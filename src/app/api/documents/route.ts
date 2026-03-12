import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { parseFile } from '@/lib/parsers'
import { chunkText } from '@/lib/chunker'
import { embedBatch } from '@/lib/gemini'

// Allow up to 5 minutes for large file processing
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = session?.user?.id ?? session?.user?.email
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const characterId = formData.get('characterId') as string | null

  if (!file || !characterId) {
    return NextResponse.json({ error: 'file and characterId are required' }, { status: 400 })
  }

  const supabase = createAdminClient()

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

  // Process the file asynchronously (fire-and-forget)
  const buffer = Buffer.from(await file.arrayBuffer())
  void processDocument(buffer, file.name, file.type, doc.id, characterId, supabase)

  return NextResponse.json(
    { document: doc, message: 'Upload received. Processing has started.' },
    { status: 202 }
  )
}

export async function GET(req: NextRequest) {
  const session = await auth()
  const userId = session?.user?.id ?? session?.user?.email
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const characterId = searchParams.get('characterId')
  if (!characterId) {
    return NextResponse.json({ error: 'characterId is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
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
    const text = await parseFile(buffer, filename, mimeType)
    const chunks = chunkText(text)

    if (chunks.length === 0) {
      await supabase
        .from('documents')
        .update({ status: 'error', error_message: 'No extractable text content found.' })
        .eq('id', documentId)
      return
    }

    const embeddings = await embedBatch(chunks, 'RETRIEVAL_DOCUMENT')

    const chunkRows = chunks.map((content, i) => ({
      document_id: documentId,
      character_id: characterId,
      content,
      chunk_index: i,
      // pgvector accepts a JSON array string as input
      embedding: JSON.stringify(embeddings[i]),
    }))

    const { error: insertErr } = await supabase.from('document_chunks').insert(chunkRows)
    if (insertErr) throw new Error(`Chunk insert failed: ${insertErr.message}`)

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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[documents] Processing failed for doc ${documentId}:`, message)
    await supabase
      .from('documents')
      .update({ status: 'error', error_message: message })
      .eq('id', documentId)
  }
}
