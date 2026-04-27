import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { PageBlock } from '../../lib/pageUtils'
import {
  LineActionMenu,
  type DeleteScope
} from './LineActionMenu'

interface EditablePageProps {
  page: PageBlock
  isActive: boolean
  absoluteIndex: number
  previewIds?: Set<string>
  onToggleLine: (pageNumber: number, lineId: string) => void
  onApplyDelete: (
    pageNumber: number,
    lineId: string,
    lineIndex: number,
    lineText: string,
    scope: DeleteScope
  ) => void
  onDeletePattern: (pattern: string) => void
  onDeletePage: (pageNumber: number) => void
  onPageFocus: (absoluteIndex: number) => void
}

export function EditablePage({
  page,
  isActive,
  absoluteIndex,
  previewIds = new Set(),
  onToggleLine,
  onApplyDelete,
  onDeletePattern,
  onDeletePage,
  onPageFocus,
}: EditablePageProps) {
  const [menu, setMenu] = useState<{
    x: number; y: number
    lineId: string
    lineText: string
    lineIndex: number
    totalLines: number
  } | null>(null)

  const deletedCount = page.lines.filter(l => l.deleted).length
  const allDeleted = page.lines
    .filter(l => l.text.trim() !== '')
    .every(l => l.deleted)

  return (
    <div
      data-page={page.pageNumber}
      onClick={() => onPageFocus(absoluteIndex)}
      className={`border rounded-lg overflow-hidden
        transition-colors cursor-default
        ${isActive ? 'border-primary/40' : ''}`}
    >
      <div className={`px-3 py-1.5 ${allDeleted ? 'bg-destructive/10' : 'bg-muted/60'} text-xs
                      font-mono text-muted-foreground
                      border-b flex items-center justify-between group/header`}>
        <span>Page {page.pageNumber}</span>
        <div className="flex items-center gap-2">
          {deletedCount > 0 && (
            <span className="text-destructive/70">
              {deletedCount} to delete
            </span>
          )}
          <button
            onClick={e => {
              e.stopPropagation()
              onDeletePage(page.pageNumber)
            }}
            className="opacity-0 group-hover/header:opacity-100
                       text-muted-foreground hover:text-destructive
                       transition-opacity"
            title="Delete entire page"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <div className="p-2 space-y-0.5 min-h-[60px]">
        {page.lines.map(line =>
          line.text.trim() === '' ? (
            <div key={line.id} className="h-3" />
          ) : (
            <div
              key={line.id}
              onClick={e => {
                e.stopPropagation()
                onToggleLine(page.pageNumber, line.id)
              }}
              onContextMenu={e => {
                e.preventDefault()
                e.stopPropagation()
                setMenu({
                  x: e.clientX,
                  y: e.clientY,
                  lineId: line.id,
                  lineText: line.text,
                  lineIndex: line.lineIndex,
                  totalLines: page.lines.filter(
                    l => l.text.trim() !== '').length,
                })
              }}
              className={`
                group flex items-start gap-2 px-2 py-0.5
                rounded cursor-pointer text-xs font-mono
                leading-relaxed transition-colors
                ${line.deleted && line.mergeType === 'source'
                  ? 'text-muted-foreground/30 line-through bg-blue-500/10'
                  : line.deleted
                    ? 'line-through text-muted-foreground/40 bg-destructive/10'
                    : line.mergeType === 'target'
                      ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                      : previewIds.has(line.id)
                        ? 'bg-amber-500/20 border border-amber-500/50 border-dashed text-amber-700 dark:text-amber-400'
                        : line.suspicious
                          ? 'bg-amber-500/10 hover:bg-destructive/10 text-amber-700 dark:text-amber-400'
                          : 'hover:bg-muted/60'
                }
              `}
            >
              <span className="flex-1 break-all">
                {line.text}
              </span>
              {line.mergeType === 'target' && (
                <span className="shrink-0 text-green-600
                                 dark:text-green-500 text-xs
                                 opacity-70 ml-1"
                  title="Merged from next page">
                  ↩
                </span>
              )}
              {line.mergeType === 'source' && !line.deleted && (
                <span className="shrink-0 text-blue-500
                                 text-xs opacity-70 ml-1"
                  title="Continuation moved to previous page">
                  ↪
                </span>
              )}
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
          )
        )}
      </div>
      {menu && (
        <LineActionMenu
          x={menu.x}
          y={menu.y}
          lineText={menu.lineText}
          lineIndex={menu.lineIndex}
          totalLines={menu.totalLines}
          onSelect={scope => {
            onApplyDelete(
              page.pageNumber,
              menu.lineId,
              menu.lineIndex,
              menu.lineText,
              scope
            )
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
