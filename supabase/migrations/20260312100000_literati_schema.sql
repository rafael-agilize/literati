-- Enable pgvector
create extension if not exists vector;

-- Users mirror (synced from NextAuth on sign-in)
create table if not exists users (
  id text primary key,
  email text unique not null,
  name text,
  image text,
  created_at timestamptz default now()
);

-- Characters (personas based on book authors)
create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  user_id text references users(id) on delete cascade,
  name text not null,
  description text,
  avatar_url text,
  system_prompt text,
  is_public boolean default false,
  document_count int default 0,
  chunk_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Source documents uploaded per character
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  character_id uuid references characters(id) on delete cascade,
  filename text not null,
  file_type text not null,
  content_length int default 0,
  chunk_count int default 0,
  status text default 'processing', -- processing | ready | error
  error_message text,
  created_at timestamptz default now()
);

-- Text chunks with vector embeddings
create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  character_id uuid references characters(id) on delete cascade,
  content text not null,
  chunk_index int not null,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- Conversation threads (multiple per character+user)
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text references users(id) on delete cascade,
  character_id uuid references characters(id) on delete cascade,
  title text default 'New conversation',
  message_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Chat messages (named chat_messages to avoid conflict with relay's messages table)
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_characters_user on characters(user_id);
create index if not exists idx_documents_character on documents(character_id);
create index if not exists idx_chunks_character on document_chunks(character_id);
create index if not exists idx_chunks_document on document_chunks(document_id);
create index if not exists idx_conversations_user on conversations(user_id);
create index if not exists idx_conversations_character on conversations(character_id);
create index if not exists idx_chat_messages_conversation on chat_messages(conversation_id);
create index if not exists idx_chat_messages_created on chat_messages(conversation_id, created_at);

-- HNSW vector similarity search index (fast approximate nearest neighbor)
create index if not exists idx_chunks_embedding on document_chunks
  using hnsw (embedding vector_cosine_ops);

-- RPC: semantic similarity search for RAG retrieval
create or replace function match_chunks(
  query_embedding vector(1536),
  character_id_filter uuid,
  match_count int default 8,
  match_threshold float default 0.3
)
returns table (
  id uuid,
  content text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    dc.id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where
    dc.character_id = character_id_filter
    and dc.embedding is not null
    and 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- RPC: increment document and chunk counts on a character
create or replace function increment_character_counts(
  char_id uuid,
  doc_delta int,
  chunk_delta int
)
returns void
language plpgsql
as $$
begin
  update characters
  set
    document_count = document_count + doc_delta,
    chunk_count = chunk_count + chunk_delta,
    updated_at = now()
  where id = char_id;
end;
$$;

-- RPC: increment message count and updated_at on a conversation
create or replace function increment_conversation_messages(
  conv_id uuid,
  delta int default 1
)
returns void
language plpgsql
as $$
begin
  update conversations
  set
    message_count = message_count + delta,
    updated_at = now()
  where id = conv_id;
end;
$$;
