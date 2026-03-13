-- Add retrieved_chunks column to chat_messages for persisting RAG chunk metadata
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS retrieved_chunks jsonb DEFAULT NULL;

-- Extend match_chunks to return document_id and chunk_index for citation metadata
-- Must DROP first because CREATE OR REPLACE cannot change return type
DROP FUNCTION IF EXISTS match_chunks(vector(1536), uuid, int, float);
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(1536),
  character_id_filter uuid,
  match_count int default 5,
  match_threshold float default 0.3
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float,
  document_id uuid,
  chunk_index int
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    dc.document_id,
    dc.chunk_index
  FROM document_chunks dc
  WHERE
    dc.character_id = character_id_filter
    AND dc.embedding IS NOT NULL
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
