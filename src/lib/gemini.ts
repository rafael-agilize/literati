import { GoogleGenAI } from '@google/genai'

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2-preview'
const GENERATION_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
const EMBEDDING_DIMS = 1536

/**
 * Embed a single text string using Gemini embeddings.
 * Use RETRIEVAL_DOCUMENT when indexing, RETRIEVAL_QUERY when searching.
 */
export async function embedText(
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'
): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      taskType,
      outputDimensionality: EMBEDDING_DIMS,
    },
  })
  // The SDK returns embeddings as an array; take the first one for a single input
  return response.embeddings?.[0]?.values ?? []
}

/**
 * Embed multiple texts using Gemini's native batch embedding.
 * The SDK accepts an array of up to 100 strings per call, which internally
 * maps to `batchEmbedContents`. This reduces 8,500 chunks from 8,500 API
 * calls down to 85. Includes exponential backoff on 429 rate-limit errors.
 */
export async function embedBatch(
  texts: string[],
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'
): Promise<number[][]> {
  const results: number[][] = []
  const BATCH_SIZE = 100

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const response = await embedWithRetry(batch, taskType)
    const embeddings = (response.embeddings ?? []).map((e) => e.values ?? [])
    results.push(...embeddings)
    // Pause between batches to respect rate limits
    if (i + BATCH_SIZE < texts.length) {
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  return results
}

async function embedWithRetry(
  contents: string[],
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY',
  maxRetries = 5
) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents,
        config: { taskType, outputDimensionality: EMBEDDING_DIMS },
      })
    } catch (err: unknown) {
      const status = (err as { status?: number }).status ?? (err as { code?: number }).code
      const isRateLimit = status === 429 || (err instanceof Error && err.message.includes('429'))
      if (!isRateLimit || attempt === maxRetries) throw err
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000)
      console.log(`[embeddings] 429 rate limit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw new Error('embedWithRetry: unreachable')
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Generate a streaming response from a character (author persona).
 * Retrieved RAG chunks are injected into the system instruction as context.
 */
export async function generateCharacterResponse(
  character: {
    name: string
    description?: string | null
    system_prompt?: string | null
  },
  retrievedChunks: string[],
  history: ChatMessage[],
  userMessage: string
): Promise<ReadableStream<Uint8Array>> {
  const systemPrompt = character.system_prompt || buildDefaultSystemPrompt(character)
  const context =
    retrievedChunks.length > 0
      ? `\n\nRelevant passages from your works:\n${retrievedChunks
          .map((c, i) => `[${i + 1}] ${c}`)
          .join('\n\n')}\n\nWhen your response draws on one of the passages above, include its number in square brackets (e.g. [1], [2]) near the relevant statement. Only cite when a passage genuinely informed your answer.`
      : ''

  const contents = [
    ...history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    {
      role: 'user' as const,
      parts: [{ text: userMessage }],
    },
  ]

  const stream = await ai.models.generateContentStream({
    model: GENERATION_MODEL,
    contents,
    config: {
      systemInstruction: systemPrompt + context,
      temperature: 0.8,
      maxOutputTokens: 2048,
    },
  })

  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.text
        if (text) {
          controller.enqueue(encoder.encode(text))
        }
      }
      controller.close()
    },
  })
}

function buildDefaultSystemPrompt(character: {
  name: string
  description?: string | null
}): string {
  return `You are ${character.name}.${character.description ? ' ' + character.description : ''}

Respond in first person as ${character.name}. Use the writing style, vocabulary, tone, and intellectual perspective characteristic of this author's works. Draw on the retrieved passages to inform your responses, but speak naturally — not as if quoting yourself.

When you don't know something from your works, respond authentically as this author would, based on their worldview and style. Never break character or acknowledge being an AI.`
}
