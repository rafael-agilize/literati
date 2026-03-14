import { NextRequest, NextResponse, after } from 'next/server'
import { auth } from '@/lib/auth'
import { createAdminClient, resolveUserIdByEmail } from '@/lib/supabase'
import { parseFile } from '@/lib/parsers'
import { chunkText } from '@/lib/chunker'
import { embedBatch } from '@/lib/gemini'
import { generateContextualPrefixes } from '@/lib/contextual-chunker'

// Allow up to 10 minutes — large files may need retries on Gemini rate limits
export const maxDuration = 600

export async function POST(req: NextRequest) {
  const session = await auth()
  const email = session?.user?.email
  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const characterId = formData.get('characterId') as string | null

  if (!file || !characterId) {
    return NextResponse.json({ error: 'file and characterId are required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const userId = await resolveUserIdByEmail(supabase, email)
  if (!userId) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 })
  }

  // Verify the character belongs to the requesting user
  const { data: character, error: charErr } = await supabase
    .from('characters')
    .select('id')
    .eq('id', characterId)
    .eq('user_id', userId)
    .single()

  if (charErr || !character) {
    return NextResponse.json({ error: 'Character not found or access denied' }, { status: 404 })
  }

  // Create a document record in 'processing' state immediately
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      character_id: characterId,
      filename: file.name,
      file_type: file.type || 'text/plain',
      status: 'processing',
    })
    .select()
    .single()

  if (docErr || !doc) {
    return NextResponse.json({ error: docErr?.message ?? 'Failed to create document record' }, { status: 500 })
  }

  // Process the file in the background — after() keeps the function alive on Vercel
  const buffer = Buffer.from(await file.arrayBuffer())
  after(() => processDocument(buffer, file.name, file.type, doc.id, characterId, supabase))

  return NextResponse.json(
    { document: doc, message: 'Upload received. Processing has started.' },
    { status: 202 }
  )
}

export async function GET(req: NextRequest) {
  const session = await auth()
  const email = session?.user?.email
  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const characterId = searchParams.get('characterId')
  if (!characterId) {
    return NextResponse.json({ error: 'characterId is required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const userId = await resolveUserIdByEmail(supabase, email)
  if (!userId) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 })
  }

  // Verify ownership
  const { data: character } = await supabase
    .from('characters')
    .select('id')
    .eq('id', characterId)
    .eq('user_id', userId)
    .single()

  if (!character) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  }

  const { data: documents, error } = await supabase
    .from('documents')
    .select('*')
    .eq('character_id', characterId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[documents] GET error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ documents })
}

async function processDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  documentId: string,
  characterId: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<void> {
  try {
    console.log(`[documents] Parsing file "${filename}" for doc ${documentId}`)
    const text = await parseFile(buffer, filename, mimeType)
    console.log(`[documents] Parsed ${text.length} chars, saving raw text and chunking...`)

    // Save raw text for future re-chunking without re-parsing
    await supabase
      .from('documents')
      .update({ raw_text: text })
      .eq('id', documentId)

    const chunks = chunkText(text)
    console.log(`[documents] Created ${chunks.length} chunks`)

    if (chunks.length === 0) {
      await supabase
        .from('documents')
        .update({ status: 'error', error_message: 'No extractable text content found.' })
        .eq('id', documentId)
      return
    }

    console.log(`[documents] Generating contextual prefixes for ${chunks.length} chunks...`)
    const contextualChunks = await generateContextualPrefixes(chunks, filename, text)
    console.log(`[documents] Embedding ${chunks.length} chunks (batch size 100)...`)
    const embeddings = await embedBatch(contextualChunks, 'RETRIEVAL_DOCUMENT')
    console.log(`[documents] Embedding complete, inserting into DB...`)

    const chunkRows = chunks.map((content, i) => ({
      document_id: documentId,
      character_id: characterId,
      content,
      content_with_context: contextualChunks[i],
      chunk_index: i,
      embedding: JSON.stringify(embeddings[i]),
      embedding_version: 3,
    }))

    // Insert in batches of 100 to stay within Postgres statement_timeout
    const INSERT_BATCH = 100
    for (let i = 0; i < chunkRows.length; i += INSERT_BATCH) {
      const batch = chunkRows.slice(i, i + INSERT_BATCH)
      let lastErr: string | null = null

      for (let attempt = 0; attempt < 3; attempt++) {
        const { error: insertErr } = await supabase.from('document_chunks').insert(batch)
        if (!insertErr) { lastErr = null; break }
        lastErr = insertErr.message
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * 2 ** attempt))
      }

      if (lastErr) throw new Error(`Chunk insert failed at batch ${i}: ${lastErr}`)
    }
    console.log(`[documents] Inserted ${chunkRows.length} chunks in ${Math.ceil(chunkRows.length / INSERT_BATCH)} batches`)

    await supabase
      .from('documents')
      .update({
        status: 'ready',
        content_length: text.length,
        chunk_count: chunks.length,
      })
      .eq('id', documentId)

    // Bump character aggregate counters
    await supabase.rpc('increment_character_counts', {
      char_id: characterId,
      doc_delta: 1,
      chunk_delta: chunks.length,
    })
    console.log(`[documents] Doc ${documentId} processing complete — status: ready`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[documents] Processing failed for doc ${documentId}:`, message)
    await supabase
      .from('documents')
      .update({ status: 'error', error_message: message })
      .eq('id', documentId)
  }
}
