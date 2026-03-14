import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { chunkText } from '@/lib/chunker'
import { embedBatch } from '@/lib/gemini'
import { generateContextualPrefixes } from '@/lib/contextual-chunker'

// Allow up to 10 minutes for large corpora
export const maxDuration = 600

/**
 * Admin endpoint to re-chunk and re-embed documents using the improved
 * token-based chunker. Protected by LITERATI_API_KEY.
 *
 * POST /api/admin/reembed
 * Body: { characterId?: string, documentId?: string }
 */
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.LITERATI_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as { characterId?: string; documentId?: string }
  const { characterId, documentId } = body

  if (!characterId && !documentId) {
    return NextResponse.json(
      { error: 'characterId or documentId is required' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // Determine which documents to re-embed
  let query = supabase
    .from('documents')
    .select('id, character_id, raw_text, status, filename')
    .eq('status', 'ready')

  if (documentId) {
    query = query.eq('id', documentId)
  } else if (characterId) {
    query = query.eq('character_id', characterId)
  }

  const { data: documents, error: docErr } = await query
  if (docErr) {
    return NextResponse.json({ error: docErr.message }, { status: 500 })
  }
  if (!documents || documents.length === 0) {
    return NextResponse.json({ error: 'No ready documents found' }, { status: 404 })
  }

  const results: {
    documentId: string
    oldChunks: number
    newChunks: number
    source: 'raw_text' | 'reconstructed'
    error?: string
  }[] = []

  for (const doc of documents) {
    try {
      let text = doc.raw_text as string | null

      if (!text) {
        // Reconstruct from existing chunks (pre-migration documents)
        const { data: existingChunks } = await supabase
          .from('document_chunks')
          .select('content, chunk_index')
          .eq('document_id', doc.id)
          .order('chunk_index', { ascending: true })

        if (!existingChunks || existingChunks.length === 0) continue

        text = existingChunks.map((c) => c.content).join('\n\n')

        // Save reconstructed text for future use
        await supabase
          .from('documents')
          .update({ raw_text: text })
          .eq('id', doc.id)
      }

      // Collect old chunk IDs before processing (for safe delete-after-insert)
      const { data: oldChunkRows, count: oldCount } = await supabase
        .from('document_chunks')
        .select('id', { count: 'exact' })
        .eq('document_id', doc.id)

      const oldChunkIds = (oldChunkRows ?? []).map((r: { id: string }) => r.id)

      // Re-chunk with token-based chunker
      const chunks = chunkText(text)
      if (chunks.length === 0) continue

      // Generate contextual prefixes
      const docTitle = (doc as { filename?: string }).filename ?? 'Unknown Document'
      const contextualChunks = await generateContextualPrefixes(chunks, docTitle, text)

      // Embed context-enriched chunks
      const embeddings = await embedBatch(contextualChunks, 'RETRIEVAL_DOCUMENT')

      // Insert new chunks first (new IDs, no PK conflict)
      const INSERT_BATCH = 100
      const chunkRows = chunks.map((content, i) => ({
        document_id: doc.id,
        character_id: doc.character_id,
        content,
        content_with_context: contextualChunks[i],
        chunk_index: i,
        embedding: JSON.stringify(embeddings[i]),
        embedding_version: 3,
      }))

      for (let i = 0; i < chunkRows.length; i += INSERT_BATCH) {
        const batch = chunkRows.slice(i, i + INSERT_BATCH)
        const { error: insertErr } = await supabase.from('document_chunks').insert(batch)
        if (insertErr) throw new Error(`Insert failed at batch ${i}: ${insertErr.message}`)
      }

      // Delete old chunks by ID (safe: if insert failed above, old chunks are preserved)
      if (oldChunkIds.length > 0) {
        const DELETE_BATCH = 100
        for (let i = 0; i < oldChunkIds.length; i += DELETE_BATCH) {
          const batch = oldChunkIds.slice(i, i + DELETE_BATCH)
          await supabase.from('document_chunks').delete().in('id', batch)
        }
      }

      // Update document metadata
      await supabase
        .from('documents')
        .update({ chunk_count: chunks.length, content_length: text.length })
        .eq('id', doc.id)

      // Update character chunk count delta
      const chunkDelta = chunks.length - (oldCount ?? 0)
      if (chunkDelta !== 0) {
        await supabase.rpc('increment_character_counts', {
          char_id: doc.character_id,
          doc_delta: 0,
          chunk_delta: chunkDelta,
        })
      }

      results.push({
        documentId: doc.id,
        oldChunks: oldCount ?? 0,
        newChunks: chunks.length,
        source: doc.raw_text ? 'raw_text' : 'reconstructed',
      })

      console.log(
        `[reembed] Doc ${doc.id}: ${oldCount ?? 0} → ${chunks.length} chunks (${doc.raw_text ? 'raw_text' : 'reconstructed'})`
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[reembed] Failed for doc ${doc.id}:`, message)
      results.push({
        documentId: doc.id,
        oldChunks: -1,
        newChunks: -1,
        source: 'raw_text',
        error: message,
      })
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
  })
}
