# Literati

A multi-user RAG-based character chatbot. Upload books and documents to create AI author personas, then have conversations with them — grounded in their actual writing.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4** — warm amber/orange book aesthetic
- **Supabase** — PostgreSQL with pgvector for embedding storage
- **Gemini** — `gemini-embedding-2-preview` (embeddings) + `gemini-2.0-flash` (generation)
- **NextAuth v5** — Google OAuth

## Features

- Upload PDF, DOCX, TXT, CSV, EPUB files per character
- Automatic chunking (800 chars, 100 char overlap) and embedding
- RAG retrieval via `match_chunks` RPC (cosine similarity, threshold 0.3)
- Streaming chat responses via `ReadableStream`
- Multiple conversations per character
- REST API with `x-api-key` header for Telegram relay integration
- Fully responsive, mobile-first UI

## Setup

### 1. Clone and install

```bash
git clone ...
cd literati
bun install
```

### 2. Configure environment

Edit `.env.local` and fill in the blank values:

```bash
# Supabase — get from supabase.com project settings > API
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google OAuth — get from console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

Other values (`GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXTAUTH_SECRET`) are pre-filled.

### 3. Set up Supabase

Run the migration in your Supabase SQL editor (Dashboard > SQL Editor):

```bash
# Copy the contents of supabase/migrations/001_schema.sql and run it
```

Or with the Supabase CLI:
```bash
supabase db push
```

The migration creates:
- `users`, `characters`, `documents`, `document_chunks`, `conversations`, `messages` tables
- `match_chunks()` RPC for semantic similarity search
- `increment_character_counts()` RPC for character stats
- HNSW index on `document_chunks.embedding` (1536-dim cosine)

### 4. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Copy Client ID and Secret to `.env.local`

### 5. Run

```bash
bun run dev   # development with hot reload
bun run build && bun run start  # production
```

## Usage

1. Sign in with Google at `http://localhost:3000`
2. Create a character (e.g. "Marcus Aurelius")
3. Upload PDFs/DOCX/TXT of their works on the character detail page
4. Wait for documents to reach "ready" status (auto-polling)
5. Click "Start Chat" to begin a conversation

## API (Telegram relay integration)

All endpoints accept `x-api-key: <LITERATI_API_KEY>` as an alternative to session cookies.

### List public characters
```
GET /api/characters
x-api-key: literati-relay-key
```

### Chat (non-streaming JSON)
```
POST /api/chat
x-api-key: literati-relay-key
x-user-id: telegram-user-123
Content-Type: application/json

{
  "characterId": "uuid-here",
  "message": "What do you think about consciousness?",
  "stream": false
}
```

Response:
```json
{
  "response": "...",
  "conversationId": "uuid",
  "characterId": "uuid"
}
```

### Continue a conversation
```
POST /api/chat
x-api-key: literati-relay-key
x-user-id: telegram-user-123
Content-Type: application/json

{
  "conversationId": "existing-uuid",
  "message": "Tell me more about that.",
  "stream": false
}
```

## Architecture

```
Upload file
  → parseFile()    (PDF/DOCX/CSV/EPUB/TXT)
  → chunkText()    (800 chars, 100 overlap)
  → embedBatch()   (gemini-embedding-2-preview, RETRIEVAL_DOCUMENT)
  → document_chunks table (vector(1536))

Chat message
  → embedText()    (RETRIEVAL_QUERY)
  → match_chunks() (top-5, threshold 0.3, cosine similarity)
  → generateCharacterResponse()
      system: character persona + retrieved passages
      model: gemini-2.0-flash, streaming
  → StreamingResponse to client
```

## File structure

```
src/
  lib/
    auth.ts          NextAuth v5 config (Google OAuth)
    supabase.ts      Supabase admin + server clients
    gemini.ts        embedText(), embedBatch(), generateCharacterResponse()
    chunker.ts       chunkText() with sentence-aware overlap
    parsers/index.ts parseFile() for PDF/DOCX/CSV/EPUB/TXT
  app/
    api/
      auth/[...nextauth]/  NextAuth route handler
      characters/          CRUD for characters
      documents/           File upload + async processing
      conversations/       CRUD for conversation threads
      chat/                RAG chat endpoint (streaming + JSON)
    dashboard/
      page.tsx             Character gallery
      characters/new/      Create character form
      characters/[id]/     Character detail + document upload
      chat/[characterId]/  Conversation list
      chat/[characterId]/[conversationId]/  Chat UI
    login/page.tsx   Google sign-in page
  components/
    CharacterCard.tsx
    FileUpload.tsx
    DocumentList.tsx   (with auto-polling for processing status)
    ChatInterface.tsx  (streaming, optimistic UI)
supabase/
  migrations/001_schema.sql
```
