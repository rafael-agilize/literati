import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.LITERATI_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Get documents for Blavatsky character
  const { data: docs } = await supabase
    .from('documents')
    .select('id, filename, chunk_count')
    .eq('character_id', 'a25cdae3-4863-4cea-8472-2e737af54029')
    .order('chunk_count', { ascending: true })

  // Check content_with_context on a few chunks
  const { data: chunks } = await supabase
    .from('document_chunks')
    .select('id, chunk_index, content_with_context, embedding_version')
    .eq('character_id', 'a25cdae3-4863-4cea-8472-2e737af54029')
    .order('chunk_index', { ascending: true })
    .limit(3)

  return NextResponse.json({
    documents: docs,
    sampleChunks: chunks?.map((c) => ({
      id: c.id,
      chunk_index: c.chunk_index,
      embedding_version: c.embedding_version,
      has_context: !!c.content_with_context,
      content_with_context_preview: c.content_with_context?.slice(0, 200) ?? null,
    })),
  })
}
