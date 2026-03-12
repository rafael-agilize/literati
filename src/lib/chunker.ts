const CHUNK_SIZE = 800
const CHUNK_OVERLAP = 100
const MIN_CHUNK_LENGTH = 50

/**
 * Split text into overlapping chunks for embedding.
 * Splits on sentence boundaries first; falls back to word boundaries for overlap.
 */
export function chunkText(text: string): string[] {
  // Normalize line endings and collapse excessive whitespace
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (normalized.length === 0) return []

  // Split on sentence-ending punctuation followed by whitespace
  const sentences = normalized.split(/(?<=[.!?])\s+/)
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if (current.length + sentence.length > CHUNK_SIZE && current.length > 0) {
      chunks.push(current.trim())

      // Build overlap: take the last CHUNK_OVERLAP characters worth of words
      const words = current.split(' ')
      let overlap = ''
      for (let i = words.length - 1; i >= 0; i--) {
        const candidate = words[i] + (overlap ? ' ' + overlap : '')
        if (candidate.length > CHUNK_OVERLAP) break
        overlap = candidate
      }

      current = overlap ? overlap + ' ' + sentence + ' ' : sentence + ' '
    } else {
      current += sentence + ' '
    }
  }

  // Flush the last chunk
  if (current.trim().length >= MIN_CHUNK_LENGTH) {
    chunks.push(current.trim())
  }

  return chunks.filter((c) => c.length >= MIN_CHUNK_LENGTH)
}
