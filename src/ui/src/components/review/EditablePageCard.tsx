import { useState } from 'react'
import { Trash2, Layers } from 'lucide-react'
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
  onDeletePattern: (pattern: string, scope: 'section' | 'book') => void
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
  const [deletePrompt, setDeletePrompt] = useState<{
    x: number; y: number; text: string
  } | null>(null)

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
    .every(l => l.deleted || l.mergeDeleted)

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
                ${line.mergeDeleted
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
              {line.mergeType === 'source' && !line.deleted && !line.mergeDeleted && (
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
                    const PW = 200
                    const PH = 140
                    const pad = 8
                    const x = Math.min(
                      e.clientX,
                      window.innerWidth - PW - pad
                    )
                    const y = Math.min(
                      e.clientY,
                      window.innerHeight - PH - pad
                    )
                    setDeletePrompt({
                      x: Math.max(pad, x),
                      y: Math.max(pad, y),
                      text: line.text,
                    })
                  }}
                  className="opacity-0 group-hover:opacity-100
                             text-xs text-muted-foreground
                             hover:text-destructive shrink-0
                             transition-opacity"
                  title="Delete options"
                >
                  Delete
                </button>
              )}
            </div>
          )
        )}
      </div>
      {deletePrompt && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setDeletePrompt(null)}
          />
          <div
            className="fixed z-50 bg-popover border rounded-md shadow-md
                       text-xs overflow-hidden min-w-[180px]"
            style={{ left: deletePrompt.x, top: deletePrompt.y }}
          >
            <div className="px-3 py-1.5 border-b text-muted-foreground
                            font-mono truncate max-w-[220px]">
              "{deletePrompt.text}"
            </div>
            <button
              className="w-full text-left px-3 py-2 hover:bg-muted
                         transition-colors flex items-center gap-2"
              onClick={() => {
                onDeletePattern(deletePrompt.text, 'section')
                setDeletePrompt(null)
              }}
            >
              <Trash2 size={12} className="shrink-0" />
              Bu bölümden sil
            </button>
            <button
              className="w-full text-left px-3 py-2 transition-colors
                         flex items-center gap-2 text-amber-700
                         dark:text-amber-400 hover:bg-amber-500/10"
              onClick={() => {
                onDeletePattern(deletePrompt.text, 'book')
                setDeletePrompt(null)
              }}
            >
              <Layers size={12} className="shrink-0" />
              Tüm kitaptan sil
            </button>
          </div>
        </>
      )}

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
