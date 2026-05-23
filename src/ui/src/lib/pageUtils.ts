export type PageBlock = {
  pageNumber: number
  text: string
  lines: LineItem[]
}

export interface LineItem {
  id: string
  text: string
  originalText: string
  lineIndex: number
  deleted: boolean
  suspicious: boolean
  mergeType?: 'target' | 'source'
  mergedWith?: string
  mergeDeleted?: boolean
  previewing?: boolean
}

const PAGE_MARKER = '=== SAYFA '

export function isSuspicious(
  line: string,
  repeatedLines: string[] = []
): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false

  // Exact page number (standalone digit)
  if (/^\d{1,4}$/.test(trimmed)) return true

  // Known repeated full lines from detector
  if (repeatedLines.some(
    r => r.trim().toLowerCase() ===
         trimmed.toLowerCase()
  )) return true

  // Short all-caps (likely header/footer)
  if (
    trimmed.length < 30 &&
    trimmed.length > 2 &&
    trimmed === trimmed.toUpperCase()
  ) return true

  return false
}

export function detectPageNumbers(
  pages: PageBlock[]
): Set<string> {
  // Her sayfanın ilk 3 ve son 3 satırındaki
  // rakamları topla
  const candidates = new Map<number, number>()

  for (const page of pages) {
    const nonEmpty = page.lines
      .filter(l => l.text.trim() !== '')
    
    const checkLines = [
      ...nonEmpty.slice(0, 3),
      ...nonEmpty.slice(-3),
    ]

    for (const line of checkLines) {
      const num = parseInt(line.text.trim())
      if (!isNaN(num) && /^\d{1,4}$/.test(
        line.text.trim())) {
        candidates.set(
          num,
          (candidates.get(num) ?? 0) + 1
        )
      }
    }
  }

  // Ardışık artan rakam dizisi bul
  const nums = [...candidates.keys()].sort((a, b) => a - b)
  const pageNums = new Set<string>()

  for (let i = 0; i < nums.length - 1; i++) {
    if (nums[i + 1] - nums[i] === 1) {
      pageNums.add(String(nums[i]))
      pageNums.add(String(nums[i + 1]))
    }
  }

  return pageNums
}

export function parsePages(
  content: string,
  repeatedLines: string[] = []
): PageBlock[] {
  // Eğer hiç marker yoksa, tüm metni Sayfa 1 olarak kabul et
  if (!content.includes(PAGE_MARKER)) {
    const lineItems: LineItem[] = content
      .split('\n')
      .map((text, i) => ({
        id: `1-${i}`,
        text,
        originalText: text,
        lineIndex: i,
        deleted: false,
        suspicious: isSuspicious(text, repeatedLines),
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
          originalText: text,
          lineIndex: i,
          deleted: false,
          suspicious: isSuspicious(text, repeatedLines),
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
        .map(l => l.originalText)
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

export const PAGE_WINDOW_SIZE = 10

export function getPageWindow(
  pages: PageBlock[],
  centerIndex: number
): { pages: PageBlock[]; startIndex: number; endIndex: number } {
  const half = Math.floor(PAGE_WINDOW_SIZE / 2)
  const total = pages.length

  let start = Math.max(0, centerIndex - half)
  let end = Math.min(total - 1, start + PAGE_WINDOW_SIZE - 1)

  // Adjust start if end hit the boundary
  start = Math.max(0, end - PAGE_WINDOW_SIZE + 1)

  return {
    pages: pages.slice(start, end + 1),
    startIndex: start,
    endIndex: end,
  }
}

export function mergeCrossPageHyphens(
  pages: PageBlock[]
): PageBlock[] {
  if (pages.length < 2) return pages

  const result: PageBlock[] = pages.map(p => ({
    ...p,
    lines: p.lines.map(l => ({ ...l })),
  }))

  for (let i = 0; i < result.length - 1; i++) {
    const currentPage = result[i]
    const nextPage = result[i + 1]

    // Find last visible non-empty line of current page
    const lastLineIndex = [...currentPage.lines]
      .reverse()
      .findIndex(l => !l.deleted && !l.mergeDeleted && l.text.trim() !== '')
    if (lastLineIndex === -1) continue

    const realLastIndex =
      currentPage.lines.length - 1 - lastLineIndex
    const lastLine = currentPage.lines[realLastIndex]

    // Check if it ends with hyphen
    if (!lastLine.text.trimEnd().endsWith('-')) continue

    // Find first visible non-empty line of next page
    const firstLineIndex = nextPage.lines.findIndex(
      l => !l.deleted && !l.suspicious && !l.mergeDeleted && l.text.trim() !== ''
    )
    if (firstLineIndex === -1) continue

    const firstLine = nextPage.lines[firstLineIndex]

    // Extract first word from next page's first line
    const nextWords = firstLine.text.trimStart().split(/\s+/)

    // Skip leading words that look like embedded headers
    // (handles "İLYADA soğlu..." where İLYADA was merged by API)
    let wordIdx = 0
    while (
      wordIdx < nextWords.length &&
      isSuspicious(nextWords[wordIdx])
    ) {
      wordIdx++
    }
    const firstWord = nextWords[wordIdx]
    if (!firstWord) continue

    // Merge: remove hyphen from end, append first word
    const merged =
      lastLine.text.trimEnd().slice(0, -1) + firstWord

    // Update target line (current page last line)
    currentPage.lines[realLastIndex] = {
      ...lastLine,
      text: merged,
      mergeType: 'target',
      mergedWith: firstLine.id,
    }

    // Remove only the merged word from the source line.
    // Keep any skipped suspicious words (they stay for cleanup).
    const beforeMerged = nextWords.slice(0, wordIdx).join(' ')
    const afterMerged = nextWords.slice(wordIdx + 1).join(' ')
    const remainingText = [beforeMerged, afterMerged]
      .filter(s => s.trim() !== '')
      .join(' ')

    if (remainingText.trim() === '') {
      // Whole line was the continuation — mark deleted
      nextPage.lines[firstLineIndex] = {
        ...firstLine,
        mergeDeleted: true,
        mergeType: 'source',
        mergedWith: lastLine.id,
      }
    } else {
      nextPage.lines[firstLineIndex] = {
        ...firstLine,
        text: remainingText,
        mergeType: 'source',
        mergedWith: lastLine.id,
      }
    }
  }

  return result
}
