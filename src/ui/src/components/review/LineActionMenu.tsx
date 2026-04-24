import { useRef, useEffect } from 'react'

export type DeleteScope =
  | 'this'
  | 'all-first-line'
  | 'all-last-line'
  | 'all-same-text'
  | 'all-same-position'

interface LineActionMenuProps {
  x: number
  y: number
  lineText: string
  lineIndex: number
  totalLines: number
  onSelect: (scope: DeleteScope) => void
  onClose: () => void
}

const isFirstLine = (index: number) => index <= 2
const isLastLine  = (
  index: number, total: number) => index >= total - 3

export function LineActionMenu({
  x, y,
  lineText,
  lineIndex,
  totalLines,
  onSelect,
  onClose,
}: LineActionMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current &&
          !ref.current.contains(e.target as Node))
        onClose()
    }
    document.addEventListener('mousedown', handler)
    return () =>
      document.removeEventListener('mousedown', handler)
  }, [onClose])

  const preview = lineText.length > 40
    ? lineText.slice(0, 40) + '...'
    : lineText

  const atStart = isFirstLine(lineIndex)
  const atEnd   = isLastLine(lineIndex, totalLines)

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: x, top: y }}
      className="z-50 bg-background border rounded-lg
                 shadow-lg py-1 min-w-[260px] text-xs"
    >
      <div className="px-3 py-1.5 text-muted-foreground
                      border-b font-mono truncate">
        "{preview}"
      </div>

      <button
        onClick={() => { onSelect('this'); onClose() }}
        className="w-full text-left px-3 py-2
                   hover:bg-muted transition-colors"
      >
        Delete this line
      </button>

      <button
        onClick={() => { onSelect('all-same-text'); onClose() }}
        className="w-full text-left px-3 py-2
                   hover:bg-muted transition-colors"
      >
        Delete all lines with this text
      </button>

      {(atStart || atEnd) && (
        <>
          <div className="border-t my-1" />
          <div className="px-3 py-1 text-muted-foreground/60">
            Position-based
          </div>
        </>
      )}

      {atStart && (
        <button
          onClick={() => {
            onSelect('all-first-line'); onClose() }}
          className="w-full text-left px-3 py-2
                     hover:bg-muted transition-colors"
        >
          Delete first line from all pages
        </button>
      )}

      {atEnd && (
        <button
          onClick={() => {
            onSelect('all-last-line'); onClose() }}
          className="w-full text-left px-3 py-2
                     hover:bg-muted transition-colors"
        >
          Delete last line from all pages
        </button>
      )}

      {(atStart || atEnd) && (
        <button
          onClick={() => {
            onSelect('all-same-position'); onClose() }}
          className="w-full text-left px-3 py-2
                     hover:bg-muted transition-colors"
        >
          Delete line {lineIndex + 1} from all pages
        </button>
      )}

      <div className="border-t my-1" />
      <button
        onClick={onClose}
        className="w-full text-left px-3 py-2
                   text-muted-foreground
                   hover:bg-muted transition-colors"
      >
        Cancel
      </button>
    </div>
  )
}
