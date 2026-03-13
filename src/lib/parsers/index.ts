import { inflateRawSync } from 'zlib'
import path from 'path'

/**
 * Parse a file buffer into plain text.
 * Supports: PDF, DOCX, CSV, EPUB, and plain text (TXT, MD, etc.)
 *
 * Heavy dependencies (pdfjs-dist, mammoth, csv-parse) are dynamically imported
 * to avoid module-level crashes on Vercel's serverless runtime.
 */
export async function parseFile(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  const ext = filename.toLowerCase().split('.').pop() ?? ''

  if (ext === 'pdf' || mimeType === 'application/pdf') {
    return extractPdfText(buffer)
  }

  if (
    ext === 'docx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const mammoth = (await import('mammoth')).default
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  if (ext === 'csv' || mimeType === 'text/csv') {
    const { parse: csvParse } = await import('csv-parse/sync')
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

/**
 * Extract text from a PDF using pdfjs-dist directly.
 * Uses the legacy build with an explicit worker path so it works in
 * Node.js / Vercel serverless (no browser APIs required beyond DOMMatrix polyfill).
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  // pdfjs-dist requires DOMMatrix (browser-only) — provide a minimal polyfill
  if (typeof globalThis.DOMMatrix === 'undefined') {
    // @ts-expect-error — lightweight shim sufficient for text extraction
    globalThis.DOMMatrix = class DOMMatrix {
      m11=1;m12=0;m13=0;m14=0;m21=0;m22=1;m23=0;m24=0;
      m31=0;m32=0;m33=1;m34=0;m41=0;m42=0;m43=0;m44=1;
      get a(){return this.m11} get b(){return this.m12} get c(){return this.m21}
      get d(){return this.m22} get e(){return this.m41} get f(){return this.m42}
      get is2D(){return true} get isIdentity(){return true}
      constructor(init?: string|number[]){
        if(Array.isArray(init)&&init.length===6){[this.m11,this.m12,this.m21,this.m22,this.m41,this.m42]=init}
      }
    }
  }

  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = path.resolve(
    require.resolve('pdfjs-dist/package.json'),
    '../legacy/build/pdf.worker.mjs'
  )

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: path.resolve(
      require.resolve('pdfjs-dist/package.json'),
      '../standard_fonts/'
    ) + '/',
    verbosity: 0,
  }).promise

  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => (item.str as string) ?? '')
      .join(' ')
    if (text.trim()) pages.push(text)
  }

  await doc.destroy()
  return pages.join('\n\n')
}
