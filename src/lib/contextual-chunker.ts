import { ai } from '@/lib/gemini'
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
const BATCH_SIZE = 10
const BATCH_DELAY_MS = 500

/**
 * Generate contextual prefixes for chunks using Gemini Flash.
 * Each chunk gets a 1-2 sentence prefix explaining what it covers
 * and where it fits in the document. The prefix is prepended to the
 * original chunk text for embedding (not for display).
 *
 * On failure, affected chunks fall back to their original text.
 */
export async function generateContextualPrefixes(
  chunks: string[],
  documentTitle: string,
  fullText: string
): Promise<string[]> {
  const result: string[] = new Array(chunks.length)
  const docExcerpt = fullText.slice(0, 2000)

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)

    try {
      const passages = batch
        .map((c, j) => `[${j + 1}] ${c.slice(0, 400)}`)
        .join('\n\n')

      const prompt = `You are a document analysis assistant. For each passage below from the document "${documentTitle}", write 1-2 concise sentences explaining what the passage covers and where it fits in the work. Write in the same language as the document.

Document excerpt (for context):
${docExcerpt}

Passages:
${passages}

Return a JSON array of strings, one context prefix per passage.`

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0,
          maxOutputTokens: 4096,
        },
      })

      const text = response.text ?? ''
      let prefixes: unknown
      try {
        prefixes = JSON.parse(text)
      } catch {
        // Attempt to repair truncated JSON array: close any open string and array
        const repaired = text.replace(/,?\s*"?[^"]*$/, '') + ']'
        try {
          prefixes = JSON.parse(repaired)
        } catch {
          throw new Error(`Unparseable JSON (${text.length} chars)`)
        }
      }

      if (!Array.isArray(prefixes)) {
        console.warn(`[contextual-chunker] non-array response at batch ${i}, using originals`)
        for (let j = 0; j < batch.length; j++) {
          result[i + j] = batch[j]
        }
      } else {
        // Use whatever prefixes we got; fall back to original for any missing ones
        for (let j = 0; j < batch.length; j++) {
          const prefix = j < prefixes.length && typeof prefixes[j] === 'string' ? (prefixes[j] as string) : ''
          result[i + j] = prefix ? `${prefix}\n\n${batch[j]}` : batch[j]
        }
      }
    } catch (err) {
      console.warn(
        `[contextual-chunker] batch ${i} failed, using originals:`,
        err instanceof Error ? err.message : err
      )
      for (let j = 0; j < batch.length; j++) {
        result[i + j] = batch[j]
      }
    }

    // Rate limit pause between batches
    if (i + BATCH_SIZE < chunks.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  return result
}
