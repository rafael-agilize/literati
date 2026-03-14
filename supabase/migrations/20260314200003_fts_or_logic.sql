-- Fix: switch BM25 text search from AND to OR logic between query terms.
-- plainto_tsquery uses AND — ALL words must appear in a chunk for a match.
-- For hybrid search, OR logic is correct: we want to find chunks matching
-- ANY query terms, with ts_rank_cd scoring higher for more term matches.
-- The vector search handles semantic relevance; BM25 OR catches keyword matches.
--
-- Approach: take plainto_tsquery output and replace '&' with '|'.
-- E.g., "karma reencarnação" → 'karm' & 'reencarn' → 'karm' | 'reencarn'

CREATE OR REPLACE FUNCTION hybrid_match_chunks(
  query_text text,
  query_embedding vector(1536),
  character_id_filter uuid,
  match_count int default 20,
  vector_weight float default 0.7,
  text_weight float default 0.3,
  match_threshold float default 0.3
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  chunk_index int,
  similarity float,
  text_score float,
  rrf_score float
)
LANGUAGE plpgsql
AS $$
DECLARE
  ts_query tsquery;
BEGIN
  -- Build OR-based tsquery: stem via portuguese config, then replace AND with OR
  ts_query := replace(
    plainto_tsquery('portuguese', query_text)::text,
    ' & ', ' | '
  )::tsquery;

  RETURN QUERY
  WITH vector_results AS (
    SELECT
      dc.id,
      dc.document_id,
      dc.content,
      dc.chunk_index,
      (1 - (dc.embedding <=> query_embedding))::float AS similarity,
      ROW_NUMBER() OVER (ORDER BY dc.embedding <=> query_embedding) AS rank
    FROM document_chunks dc
    WHERE
      dc.character_id = character_id_filter
      AND dc.embedding IS NOT NULL
      AND 1 - (dc.embedding <=> query_embedding) > match_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT 50
  ),
  text_results AS (
    SELECT
      dc.id,
      dc.document_id,
      dc.content,
      dc.chunk_index,
      ts_rank_cd(dc.fts, ts_query)::float AS text_rank_score,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(dc.fts, ts_query) DESC) AS rank
    FROM document_chunks dc
    WHERE
      dc.character_id = character_id_filter
      AND dc.fts @@ ts_query
    ORDER BY ts_rank_cd(dc.fts, ts_query) DESC
    LIMIT 50
  ),
  combined AS (
    SELECT
      COALESCE(v.id, t.id) AS id,
      COALESCE(v.document_id, t.document_id) AS document_id,
      COALESCE(v.content, t.content) AS content,
      COALESCE(v.chunk_index, t.chunk_index) AS chunk_index,
      COALESCE(v.similarity, 0)::float AS similarity,
      COALESCE(t.text_rank_score, 0)::float AS text_score,
      (
        vector_weight / (60 + COALESCE(v.rank, 999))::float +
        text_weight / (60 + COALESCE(t.rank, 999))::float
      )::float AS rrf_score
    FROM vector_results v
    FULL OUTER JOIN text_results t ON v.id = t.id
  )
  SELECT
    combined.id,
    combined.document_id,
    combined.content,
    combined.chunk_index,
    combined.similarity,
    combined.text_score,
    combined.rrf_score
  FROM combined
  ORDER BY combined.rrf_score DESC
  LIMIT match_count;
END;
$$;
