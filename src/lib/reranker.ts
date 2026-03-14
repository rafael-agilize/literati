import { ai } from '@/lib/gemini'
const RERANK_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

/**
 * Rerank chunks by relevance to query using Gemini Flash as an LLM judge.
 * On any error, gracefully falls back to returning chunks in original order.
 */
export async function rerankChunks<T extends { content: string }>(
  chunks: T[],
  query: string,
  topK: number = 8
): Promise<T[]> {
  if (chunks.length <= topK) return chunks

  try {
    const passages = chunks
      .map((c, i) => `[${i + 1}] ${c.content.slice(0, 500)}`)
      .join('\n\n')

    const prompt = `You are a relevance scoring engine. Score each passage 0-10 for relevance to the query.

Query: ${query}

Passages:
${passages}

Return ONLY a JSON array of integer scores, one per passage. Example: [8, 3, 10, 0, ...]`

    const response = await ai.models.generateContent({
      model: RERANK_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0,
        maxOutputTokens: 256,
      },
    })

    const text = response.text ?? ''
    const scores: unknown = JSON.parse(text)

    if (!Array.isArray(scores) || scores.length !== chunks.length) {
      console.warn('[reranker] score count mismatch, falling back to original order')
      return chunks.slice(0, topK)
    }

    const scored = chunks.map((chunk, i) => ({
      chunk,
      score: typeof scores[i] === 'number' ? (scores[i] as number) : 0,
    }))

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK).map((s) => s.chunk)
  } catch (err) {
    console.warn('[reranker] error, falling back to original order:', err instanceof Error ? err.message : err)
    return chunks.slice(0, topK)
  }
}
