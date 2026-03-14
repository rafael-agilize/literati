/**
 * Local re-embed script — bypasses Vercel function timeout.
 * Usage: npx tsx scripts/reembed-local.ts <documentId>
 */
import { createClient } from '@supabase/supabase-js'
import { chunkText } from '../src/lib/chunker'
import { embedBatch } from '../src/lib/gemini'
import { generateContextualPrefixes } from '../src/lib/contextual-chunker'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const docId = process.argv[2]
if (!docId) {
  console.error('Usage: npx tsx scripts/reembed-local.ts <documentId>')
  process.exit(1)
}

async function main() {
  console.log(`[reembed] Fetching document ${docId}...`)

  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('id, character_id, raw_text, filename')
    .eq('id', docId)
    .single()

  if (docErr || !doc) {
    console.error('Document not found:', docErr?.message)
    process.exit(1)
  }

  let text = doc.raw_text as string | null
  if (!text) {
    console.log('[reembed] No raw_text, reconstructing from chunks...')
    const { data: existingChunks } = await supabase
      .from('document_chunks')
      .select('content, chunk_index')
      .eq('document_id', docId)
      .order('chunk_index', { ascending: true })

    if (!existingChunks || existingChunks.length === 0) {
      console.error('No chunks to reconstruct from')
      process.exit(1)
    }
    text = existingChunks.map((c) => c.content).join('\n\n')
    await supabase.from('documents').update({ raw_text: text }).eq('id', docId)
  }

  console.log(`[reembed] Raw text: ${(text.length / 1000).toFixed(0)}k chars`)

  // Get old chunk IDs
  const { data: oldChunkRows, count: oldCount } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact' })
    .eq('document_id', docId)

  const oldChunkIds = (oldChunkRows ?? []).map((r: { id: string }) => r.id)
  console.log(`[reembed] Old chunks: ${oldCount}`)

  // Re-chunk
  const chunks = chunkText(text)
  console.log(`[reembed] New chunks: ${chunks.length}`)

  if (chunks.length === 0) {
    console.error('No chunks generated')
    process.exit(1)
  }

  // Generate contextual prefixes
  console.log(`[reembed] Generating contextual prefixes...`)
  const contextualChunks = await generateContextualPrefixes(chunks, doc.filename ?? 'Unknown', text)
  console.log(`[reembed] Contextual prefixes done`)

  // Embed
  console.log(`[reembed] Embedding ${contextualChunks.length} chunks...`)
  const embeddings = await embedBatch(contextualChunks, 'RETRIEVAL_DOCUMENT')
  console.log(`[reembed] Embedding done`)

  // Insert new chunks in small batches
  const INSERT_BATCH = 20
  const chunkRows = chunks.map((content, i) => ({
    document_id: docId,
    character_id: doc.character_id,
    content,
    content_with_context: contextualChunks[i],
    chunk_index: i,
    embedding: JSON.stringify(embeddings[i]),
    embedding_version: 3,
  }))

  console.log(`[reembed] Inserting ${chunkRows.length} chunks in batches of ${INSERT_BATCH}...`)
  for (let i = 0; i < chunkRows.length; i += INSERT_BATCH) {
    const batch = chunkRows.slice(i, i + INSERT_BATCH)
    const { error: insertErr } = await supabase.from('document_chunks').insert(batch)
    if (insertErr) {
      console.error(`Insert failed at batch ${i}:`, insertErr.message)
      process.exit(1)
    }
    process.stdout.write(`\r  Inserted ${Math.min(i + INSERT_BATCH, chunkRows.length)}/${chunkRows.length}`)
  }
  console.log()

  // Delete old chunks
  console.log(`[reembed] Deleting ${oldChunkIds.length} old chunks...`)
  const DELETE_BATCH = 100
  for (let i = 0; i < oldChunkIds.length; i += DELETE_BATCH) {
    const batch = oldChunkIds.slice(i, i + DELETE_BATCH)
    await supabase.from('document_chunks').delete().in('id', batch)
    process.stdout.write(`\r  Deleted ${Math.min(i + DELETE_BATCH, oldChunkIds.length)}/${oldChunkIds.length}`)
  }
  console.log()

  // Update document metadata
  await supabase
    .from('documents')
    .update({ chunk_count: chunks.length, content_length: text.length })
    .eq('id', docId)

  // Update character chunk count
  const chunkDelta = chunks.length - (oldCount ?? 0)
  if (chunkDelta !== 0) {
    await supabase.rpc('increment_character_counts', {
      char_id: doc.character_id,
      doc_delta: 0,
      chunk_delta: chunkDelta,
    })
  }

  console.log(`[reembed] Done! ${oldCount} → ${chunks.length} chunks (delta: ${chunkDelta})`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
