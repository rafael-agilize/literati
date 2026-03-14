-- Phase 1: Token-based chunking + raw text storage
-- Adds raw_text column to documents for re-chunking without re-parsing
-- Adds embedding_version to chunks to track chunking strategy

ALTER TABLE documents ADD COLUMN IF NOT EXISTS raw_text text;

ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding_version smallint DEFAULT 1;
