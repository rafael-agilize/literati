import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { chunkText, CHUNK_SIZE_TOKENS } from '@/lib/chunker'
import { embedBatch } from '@/lib/gemini'

export const maxDuration = 600

/**
 * TEMPORARY test endpoint for Phase 1 verification.
 * Tests: token-based chunking, raw_text storage, embedding_version column.
 * Protected by LITERATI_API_KEY. DELETE after testing.
 *
 * POST /api/admin/test-chunker
 * Body: { characterId: string, testText?: string }
 */
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.LITERATI_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as { characterId?: string; testText?: string }
  const { characterId, testText } = body

  if (!characterId) {
    return NextResponse.json({ error: 'characterId is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify character exists
  const { data: character } = await supabase
    .from('characters')
    .select('id, name')
    .eq('id', characterId)
    .single()

  if (!character) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  }

  // Use provided text or generate test text
  const text =
    testText ||
    Array(30)
      .fill(
        'In the depths of the ancient library, the scholar found a manuscript that would change everything. ' +
          'The pages were yellowed with age, but the ink remained as vivid as the day it was written. ' +
          'Each word seemed to pulse with a hidden meaning, drawing the reader deeper into its mysteries. ' +
          'The scholar knew that this discovery would reshape the understanding of the entire field.'
      )
      .join(' ')

  // 1. Test chunking
  const chunks = chunkText(text)
  const chunkStats = chunks.map((c, i) => ({
    index: i,
    chars: c.length,
    estimatedTokens: Math.ceil(c.length / 4),
  }))

  // 2. Create test document
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      character_id: characterId,
      filename: '__test_phase1__.txt',
      file_type: 'text/plain',
      status: 'processing',
      raw_text: text,
    })
    .select()
    .single()

  if (docErr || !doc) {
    return NextResponse.json({
      error: docErr?.message ?? 'Failed to create document',
      note: 'raw_text column may be missing — run migration first',
    }, { status: 500 })
  }

  // 3. Verify raw_text was stored
  const { data: docCheck } = await supabase
    .from('documents')
    .select('id, raw_text')
    .eq('id', doc.id)
    .single()

  const rawTextStored = !!(docCheck?.raw_text && (docCheck.raw_text as string).length > 0)

  // 4. Embed and insert chunks
  const embeddings = await embedBatch(chunks, 'RETRIEVAL_DOCUMENT')

  const chunkRows = chunks.map((content, i) => ({
    document_id: doc.id,
    character_id: characterId,
    content,
    chunk_index: i,
    embedding: JSON.stringify(embeddings[i]),
    embedding_version: 2,
  }))

  const { error: insertErr } = await supabase.from('document_chunks').insert(chunkRows)

  // 5. Verify embedding_version was stored
  const { data: chunkCheck } = await supabase
    .from('document_chunks')
    .select('id, embedding_version, chunk_index')
    .eq('document_id', doc.id)
    .order('chunk_index')

  const embeddingVersionStored = chunkCheck?.every((c) => c.embedding_version === 2)

  // 6. Update document status
  await supabase
    .from('documents')
    .update({ status: 'ready', content_length: text.length, chunk_count: chunks.length })
    .eq('id', doc.id)

  // 7. Test retrieval via match_chunks
  const testQuery = 'ancient manuscript discovery'
  const queryEmbedding = (await embedBatch([testQuery], 'RETRIEVAL_QUERY'))[0]
  const { data: matches } = await supabase.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    character_id_filter: characterId,
    match_count: 3,
    match_threshold: 0.3,
  })

  // 8. Cleanup — delete test document and chunks
  await supabase.from('document_chunks').delete().eq('document_id', doc.id)
  await supabase.from('documents').delete().eq('id', doc.id)

  return NextResponse.json({
    phase1_test: 'COMPLETE',
    results: {
      chunking: {
        status: chunks.length > 0 ? 'PASS' : 'FAIL',
        inputChars: text.length,
        inputEstTokens: Math.ceil(text.length / 4),
        chunkCount: chunks.length,
        targetTokens: CHUNK_SIZE_TOKENS,
        chunkStats,
        avgTokensPerChunk: Math.round(
          chunkStats.reduce((s, c) => s + c.estimatedTokens, 0) / chunkStats.length
        ),
      },
      rawTextStorage: {
        status: rawTextStored ? 'PASS' : 'FAIL',
        stored: rawTextStored,
      },
      embeddingVersion: {
        status: embeddingVersionStored ? 'PASS' : 'FAIL',
        allVersion2: embeddingVersionStored,
        chunksChecked: chunkCheck?.length ?? 0,
      },
      chunkInsert: {
        status: !insertErr ? 'PASS' : 'FAIL',
        error: insertErr?.message ?? null,
      },
      retrieval: {
        status: (matches?.length ?? 0) > 0 ? 'PASS' : 'FAIL',
        query: testQuery,
        matchesFound: matches?.length ?? 0,
        topSimilarity: matches?.[0]?.similarity ?? null,
      },
      cleanup: 'done',
    },
  })
}
