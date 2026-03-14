-- Fix: switch FTS from 'simple' to 'portuguese' language config.
-- 'simple' was keeping Portuguese stop words (de, do, dos, a, e) as required
-- AND terms in plainto_tsquery, causing nearly zero text matches.
-- 'portuguese' config properly:
--   - Removes Portuguese stop words
--   - Stems Portuguese words (reencarnação, princípios, etc.)
--   - Handles accented characters correctly

DROP INDEX IF EXISTS idx_chunks_fts;
ALTER TABLE document_chunks DROP COLUMN IF EXISTS fts;
ALTER TABLE document_chunks ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (to_tsvector('portuguese', content)) STORED;
CREATE INDEX idx_chunks_fts ON document_chunks USING gin(fts);

-- Update hybrid search function to use 'portuguese' config
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
BEGIN
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
      ts_rank_cd(dc.fts, plainto_tsquery('portuguese', query_text))::float AS text_rank_score,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(dc.fts, plainto_tsquery('portuguese', query_text)) DESC) AS rank
    FROM document_chunks dc
    WHERE
      dc.character_id = character_id_filter
      AND dc.fts @@ plainto_tsquery('portuguese', query_text)
    ORDER BY ts_rank_cd(dc.fts, plainto_tsquery('portuguese', query_text)) DESC
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
