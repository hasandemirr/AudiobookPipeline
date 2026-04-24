import type { PageBlock } from '../../lib/pageUtils'

interface Props {
  page: PageBlock
  onToggleLine: (pageNumber: number, lineId: string) => void
  onDeletePattern: (pattern: string) => void
}

export function EditablePageCard({
  page, onToggleLine, onDeletePattern,
}: Props) {
  return (
    <div className="flex-1 border rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 bg-muted/60 text-xs
                      font-mono text-muted-foreground
                      border-b flex items-center justify-between">
        <span>Page {page.pageNumber}</span>
        {page.lines.some(l => l.deleted) && (
          <span className="text-muted-foreground/60">
            {page.lines.filter(l => l.deleted).length} hidden
          </span>
        )}
      </div>
      <div className="p-2 space-y-0.5">
        {page.lines.map(line => (
          <div
            key={line.id}
            onClick={() => onToggleLine(page.pageNumber, line.id)}
            className={`
              group flex items-start gap-2 px-2 py-0.5
              rounded cursor-pointer text-xs font-mono
              leading-relaxed transition-colors
              ${line.deleted
                ? 'line-through text-muted-foreground/40 bg-red-500/5'
                : line.suspicious
                  ? 'bg-amber-500/10 hover:bg-red-500/10 text-amber-700 dark:text-amber-400'
                  : 'hover:bg-muted/60'
              }
            `}
          >
            <span className="flex-1 break-all">
              {line.text || '\u00A0'}
            </span>
            {line.suspicious && !line.deleted && (
              <button
                onClick={e => {
                  e.stopPropagation()
                  onDeletePattern(line.text)
                }}
                className="opacity-0 group-hover:opacity-100
                           text-xs text-muted-foreground
                           hover:text-destructive shrink-0
                           transition-opacity"
                title="Delete from all pages"
              >
                Delete all
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
