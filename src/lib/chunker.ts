/** Target chunk size in estimated tokens (~4 chars per token) */
export const CHUNK_SIZE_TOKENS = 450
/** Overlap between consecutive chunks in estimated tokens */
export const CHUNK_OVERLAP_TOKENS = 50
/** Minimum chunk size — discard chunks smaller than this */
export const MIN_CHUNK_TOKENS = 30

/** Rough token estimate: ~4 characters per token for English text */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Split text into overlapping chunks for embedding.
 * Measures size in estimated tokens (not characters) targeting ~450 tokens per chunk.
 * Splits on sentence boundaries first; falls back to word boundaries for overlap.
 */
export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (normalized.length === 0) return []

  // Split on sentence-ending punctuation followed by whitespace
  const sentences = normalized.split(/(?<=[.!?])\s+/)
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    const combinedTokens = estimateTokens(current + sentence)

    if (combinedTokens > CHUNK_SIZE_TOKENS && current.length > 0) {
      chunks.push(current.trim())

      // Build overlap: take the last ~CHUNK_OVERLAP_TOKENS worth of words
      const overlapCharBudget = CHUNK_OVERLAP_TOKENS * 4
      const words = current.split(' ')
      let overlap = ''
      for (let i = words.length - 1; i >= 0; i--) {
        const candidate = words[i] + (overlap ? ' ' + overlap : '')
        if (candidate.length > overlapCharBudget) break
        overlap = candidate
      }

      current = overlap ? overlap + ' ' + sentence + ' ' : sentence + ' '
    } else {
      current += sentence + ' '
    }
  }

  // Flush the last chunk
  if (estimateTokens(current.trim()) >= MIN_CHUNK_TOKENS) {
    chunks.push(current.trim())
  }

  return chunks.filter((c) => estimateTokens(c) >= MIN_CHUNK_TOKENS)
}
