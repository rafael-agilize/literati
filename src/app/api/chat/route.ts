import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createAdminClient, resolveUserIdByEmail } from '@/lib/supabase'
import { embedText, generateCharacterResponse } from '@/lib/gemini'
import { deduplicateChunks } from '@/lib/chunker'
import { rerankChunks } from '@/lib/reranker'

export const maxDuration = 60

// Wrap the core handler to ensure errors always return JSON instead of crashing silently
export async function POST(req: NextRequest): Promise<Response> {
  try {
    return await chatHandler(req)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[chat] unhandled error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Renamed original handler
async function chatHandler(req: NextRequest): Promise<Response> {
  return _chatHandler(req)
}

type Character = {
  id: string
  name: string
  description: string | null
  system_prompt: string | null
}

async function _chatHandler(req: NextRequest): Promise<Response> {
  const session = await auth()

  const apiKey = req.headers.get('x-api-key')
  const isApiAuth = !!apiKey && apiKey === process.env.LITERATI_API_KEY
  const apiUserId = req.headers.get('x-user-id')

  const supabase = createAdminClient()
  let effectiveUserId: string | null = null

  if (isApiAuth && apiUserId) {
    // Ensure relay user exists in users table (FK constraint)
    const relayEmail = `${apiUserId}@relay.literati`
    let { data: relayUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', relayEmail)
      .single()
    if (!relayUser) {
      const { data: created } = await supabase
        .from('users')
        .insert({ id: apiUserId, email: relayEmail, name: apiUserId })
        .select('id')
        .single()
      relayUser = created
    }
    effectiveUserId = relayUser?.id ?? null
  } else if (session?.user?.email) {
    effectiveUserId = await resolveUserIdByEmail(supabase, session.user.email)
  }

  if (!effectiveUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    conversationId?: string
    characterId?: string
    message?: string
    stream?: boolean
  }

  const { conversationId, characterId, message, stream: streamMode = true } = body

  if (!message?.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  let convId = conversationId
  let character: Character

  if (convId) {
    // Load character via the existing conversation
    const { data: conv, error } = await supabase
      .from('conversations')
      .select('*, characters(id, name, description, system_prompt)')
      .eq('id', convId)
      .eq('user_id', effectiveUserId)
      .single()

    if (error || !conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
    character = conv.characters as Character
  } else {
    if (!characterId) {
      return NextResponse.json(
        { error: 'Either conversationId or characterId is required' },
        { status: 400 }
      )
    }
    const { data: char, error: charErr } = await supabase
      .from('characters')
      .select('id, name, description, system_prompt')
      .eq('id', characterId)
      .single()

    if (charErr || !char) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }
    character = char as Character

    // Create a new conversation for this character
    const { data: conv } = await supabase
      .from('conversations')
      .insert({
        user_id: effectiveUserId,
        character_id: characterId,
        title: message.slice(0, 60),
      })
      .select('id')
      .single()

    convId = conv!.id
  }

  // Load recent conversation history (last 10 messages, oldest first)
  const { data: historyRows } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: false })
    .limit(10)

  const history = ((historyRows ?? []) as { role: 'user' | 'assistant'; content: string }[]).reverse()

  // Persist the user's message
  await supabase
    .from('chat_messages')
    .insert({ conversation_id: convId, role: 'user', content: message.trim() })

  // RAG: embed the query and retrieve via hybrid search (vector + BM25)
  const queryEmbedding = await embedText(message, 'RETRIEVAL_QUERY')
  const { data: rawChunks } = await supabase.rpc('hybrid_match_chunks', {
    query_text: message,
    query_embedding: queryEmbedding,
    character_id_filter: character.id,
    match_count: 20,
    vector_weight: 0.7,
    text_weight: 0.3,
    match_threshold: 0.3,
  })

  type RawChunk = { id: string; content: string; similarity: number; text_score: number; rrf_score: number; document_id: string; chunk_index: number }
  const allChunks = (rawChunks ?? []) as RawChunk[]

  // Rerank all 20 candidates using LLM judge, then take top 8
  const typedChunks = await rerankChunks(allChunks, message, 8)

  // Sort by document position for natural reading order
  typedChunks.sort((a, b) =>
    a.document_id === b.document_id
      ? a.chunk_index - b.chunk_index
      : a.document_id.localeCompare(b.document_id)
  )

  // Deduplicate overlapping content between adjacent same-document chunks
  const retrievedChunks = deduplicateChunks(typedChunks)

  // Fetch source filenames for chunk metadata
  let chunksMeta: { id: string; content: string; similarity: number; text_score: number; rrf_score: number; source_filename: string; chunk_index: number }[] = []
  if (typedChunks.length > 0) {
    const docIds = [...new Set(typedChunks.map((c) => c.document_id))]
    const { data: docs } = await supabase.from('documents').select('id, filename').in('id', docIds)
    const docMap = new Map((docs ?? []).map((d: { id: string; filename: string }) => [d.id, d.filename]))
    chunksMeta = typedChunks.map((c) => ({
      id: c.id,
      content: c.content,
      similarity: c.similarity,
      text_score: c.text_score,
      rrf_score: c.rrf_score,
      source_filename: docMap.get(c.document_id) ?? 'unknown',
      chunk_index: c.chunk_index,
    }))
  }

  // Generate streamed response
  const responseStream = await generateCharacterResponse(character, retrievedChunks, history, message)

  if (streamMode) {
    // Stream to client with NDJSON prefix: first line is chunk metadata JSON
    let fullResponse = ''
    const encoder = new TextEncoder()
    const transformStream = new TransformStream<Uint8Array, Uint8Array>({
      start(controller) {
        if (chunksMeta.length > 0) {
          controller.enqueue(encoder.encode(JSON.stringify({ chunks: chunksMeta }) + '\n'))
        }
      },
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk)
        fullResponse += text
        controller.enqueue(chunk)
      },
      async flush() {
        // Persist assistant message with chunk metadata after stream completes
        await supabase
          .from('chat_messages')
          .insert({
            conversation_id: convId,
            role: 'assistant',
            content: fullResponse,
            retrieved_chunks: chunksMeta.length > 0 ? chunksMeta : null,
          })
        await supabase
          .from('conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', convId)
      },
    })

    return new Response(responseStream.pipeThrough(transformStream), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Conversation-Id': convId!,
        'X-Character-Id': character.id,
      },
    })
  }

  // Non-streaming mode — buffer full response and return JSON (for API relay)
  const reader = responseStream.getReader()
  let fullResponse = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    fullResponse += new TextDecoder().decode(value)
  }

  await supabase
    .from('chat_messages')
    .insert({
      conversation_id: convId,
      role: 'assistant',
      content: fullResponse,
      retrieved_chunks: chunksMeta.length > 0 ? chunksMeta : null,
    })
  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', convId)

  return NextResponse.json({
    response: fullResponse,
    conversationId: convId,
    characterId: character.id,
    retrievedChunks: chunksMeta.length > 0 ? chunksMeta : undefined,
  })
}
