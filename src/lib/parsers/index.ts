import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import { parse as csvParse } from 'csv-parse/sync'
import { inflateRawSync } from 'zlib'

/**
 * Parse a file buffer into plain text.
 * Supports: PDF, DOCX, CSV, EPUB, and plain text (TXT, MD, etc.)
 */
export async function parseFile(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  const ext = filename.toLowerCase().split('.').pop() ?? ''

  if (ext === 'pdf' || mimeType === 'application/pdf') {
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    const result = await parser.getText()
    return result.text
  }

  if (
    ext === 'docx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  if (ext === 'csv' || mimeType === 'text/csv') {
    const records = csvParse(buffer, {
      columns: true,
      skip_empty_lines: true,
    }) as Record<string, string>[]
    return records.map((r) => Object.values(r).join(' ')).join('\n')
  }

  if (ext === 'epub' || mimeType === 'application/epub+zip') {
    try {
      return extractEpubText(buffer)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`EPUB parsing failed: ${msg}. Try converting to PDF first.`)
    }
  }

  // Default: treat as UTF-8 text (TXT, MD, etc.)
  return buffer.toString('utf8')
}

/**
 * Extract plain text from an EPUB file (ZIP archive containing HTML/XHTML).
 * Uses Node's built-in zlib for decompression — no external zip dependency required.
 */
function extractEpubText(buffer: Buffer): string {
  const texts: string[] = []
  let offset = 0
  const buf = buffer

  while (offset < buf.length - 30) {
    // Look for ZIP local file header signature: PK\x03\x04
    if (
      buf[offset] !== 0x50 ||
      buf[offset + 1] !== 0x4b ||
      buf[offset + 2] !== 0x03 ||
      buf[offset + 3] !== 0x04
    ) {
      offset++
      continue
    }

    const compression = buf.readUInt16LE(offset + 8)
    const compressedSize = buf.readUInt32LE(offset + 18)
    const filenameLength = buf.readUInt16LE(offset + 26)
    const extraLength = buf.readUInt16LE(offset + 28)
    const filename = buf.slice(offset + 30, offset + 30 + filenameLength).toString('utf8')
    const dataOffset = offset + 30 + filenameLength + extraLength

    const isHtml =
      filename.endsWith('.html') ||
      filename.endsWith('.xhtml') ||
      filename.endsWith('.htm')

    if (isHtml && compressedSize > 0 && dataOffset + compressedSize <= buf.length) {
      const compressed = buf.slice(dataOffset, dataOffset + compressedSize)
      let content = ''
      if (compression === 0) {
        // Stored (no compression)
        content = compressed.toString('utf8')
      } else if (compression === 8) {
        // Deflate
        content = inflateRawSync(compressed).toString('utf8')
      }
      if (content) {
        const text = content
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (text.length > 100) texts.push(text)
      }
    }

    offset = dataOffset + compressedSize
  }

  if (texts.length === 0) {
    throw new Error('No readable HTML content found in EPUB archive.')
  }

  return texts.join('\n\n')
}
