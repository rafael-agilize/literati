import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { embedText } from '@/lib/gemini'

export const maxDuration = 30

export async function POST(req: NextRequest): Promise<Response> {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.LITERATI_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { query, characterId } = await req.json() as { query: string; characterId: string }
  if (!query || !characterId) {
    return NextResponse.json({ error: 'query and characterId are required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const queryEmbedding = await embedText(query, 'RETRIEVAL_QUERY')

  // Run both searches in parallel
  const [vectorResult, hybridResult] = await Promise.all([
    supabase.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      character_id_filter: characterId,
      match_count: 10,
      match_threshold: 0.3,
    }),
    supabase.rpc('hybrid_match_chunks', {
      query_text: query,
      query_embedding: queryEmbedding,
      character_id_filter: characterId,
      match_count: 10,
      vector_weight: 0.7,
      text_weight: 0.3,
      match_threshold: 0.3,
    }),
  ])

  const vectorChunks = (vectorResult.data ?? []) as { id: string; content: string; similarity: number }[]
  const hybridChunks = (hybridResult.data ?? []) as { id: string; content: string; similarity: number; text_score: number; rrf_score: number }[]

  // Find chunks unique to hybrid (found by text search but not vector)
  const vectorIds = new Set(vectorChunks.map((c) => c.id))
  const hybridOnly = hybridChunks.filter((c) => !vectorIds.has(c.id))

  return NextResponse.json({
    query,
    vector: {
      count: vectorChunks.length,
      chunks: vectorChunks.map((c) => ({
        id: c.id,
        similarity: c.similarity,
        preview: c.content.slice(0, 200),
      })),
    },
    hybrid: {
      count: hybridChunks.length,
      chunks: hybridChunks.map((c) => ({
        id: c.id,
        similarity: c.similarity,
        text_score: c.text_score,
        rrf_score: c.rrf_score,
        preview: c.content.slice(0, 200),
      })),
    },
    hybrid_only_count: hybridOnly.length,
    hybrid_only: hybridOnly.map((c) => ({
      id: c.id,
      text_score: c.text_score,
      rrf_score: c.rrf_score,
      preview: c.content.slice(0, 200),
    })),
  })
}
