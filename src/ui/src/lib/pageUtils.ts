export type PageBlock = {
  pageNumber: number
  text: string
  lines: LineItem[]
}

export type LineItem = {
  id: string
  text: string
  deleted: boolean
  suspicious: boolean
}

const PAGE_MARKER = '=== SAYFA '

export function isSuspicious(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (/^\d{1,4}$/.test(trimmed)) return true
  if (
    trimmed.length < 30 &&
    trimmed.length > 2 &&
    trimmed === trimmed.toUpperCase()
  ) return true
  return false
}

export function parsePages(content: string): PageBlock[] {
  // Eğer hiç marker yoksa, tüm metni Sayfa 1 olarak kabul et
  if (!content.includes(PAGE_MARKER)) {
    const lineItems: LineItem[] = content
      .split('\n')
      .map((text, i) => ({
        id: `1-${i}`,
        text,
        deleted: false,
        suspicious: isSuspicious(text),
      }))
    return [{ pageNumber: 1, text: content.trim(), lines: lineItems }]
  }

  return content
    .split(PAGE_MARKER)
    .filter(b => b.trim())
    .map(block => {
      const lines = block.split('\n')
      const pageNumStr = lines[0].replace(' ===', '').trim()
      const pageNumber = parseInt(pageNumStr) || 0
      const pageText = lines.slice(1).join('\n').trim()

      const lineItems: LineItem[] = pageText
        .split('\n')
        .map((text, i) => ({
          id: `${pageNumber}-${i}`,
          text,
          deleted: false,
          suspicious: isSuspicious(text),
        }))

      return { pageNumber, text: pageText, lines: lineItems }
    })
    .filter(p => p.pageNumber > 0)
}

export function pagesToContent(pages: PageBlock[]): string {
  return pages
    .map(p => {
      const text = p.lines
        .filter(l => !l.deleted)
        .map(l => l.text)
        .join('\n')
        .trim()
      return `${PAGE_MARKER}${p.pageNumber} ===\n${text}`
    })
    .join('\n\n')
}

export function formatRelativeTime(date: Date): string {
  const seconds = Math.floor(
    (Date.now() - date.getTime()) / 1000
  )
  if (seconds < 10) return 'Just saved'
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.floor(seconds / 60)}m ago`
}

export function deepClonePages(pages: PageBlock[]): PageBlock[] {
  return JSON.parse(JSON.stringify(pages))
}
