// pdfjs v5 uses `for await (const value of readableStream)` inside getTextContent().
// Safari < 16.4 doesn't implement ReadableStream[Symbol.asyncIterator], causing
// "undefined is not a function (near '...value of readableStream...')".
// This polyfill fixes it before pdfjs is ever imported.
if (typeof ReadableStream !== 'undefined' && !(ReadableStream.prototype as unknown as Record<symbol, unknown>)[Symbol.asyncIterator]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(ReadableStream.prototype as any)[Symbol.asyncIterator] = async function* () {
    const reader = this.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return undefined
        yield value
      }
    } finally {
      reader.releaseLock()
    }
  }
}

// Singleton — set GlobalWorkerOptions once and reuse the loaded module.
let _pdfjs: typeof import('pdfjs-dist') | null = null

async function getPdfJs() {
  if (_pdfjs) return _pdfjs
  const pdfjs = await import('pdfjs-dist')
  // The ?url import does not work when pdfjs-dist is excluded from optimizeDeps.
  // Using the CDN URL matching the installed version is the reliable alternative.
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  _pdfjs = pdfjs
  return pdfjs
}

export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await getPdfJs()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
  const parts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    parts.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
    )
  }
  return parts.join('\n')
}
