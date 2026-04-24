import type { PageBlock } from '../../lib/pageUtils'

interface RawPageProps {
  page: PageBlock
  isActive: boolean
}

export function RawPage({ page, isActive }: RawPageProps) {
  return (
    <div
      data-page={page.pageNumber}
      className={`border rounded-lg overflow-hidden
        transition-colors
        ${isActive ? 'border-primary/40' : ''}`}
    >
      <div className="px-3 py-1.5 bg-muted/60 text-xs
                      font-mono text-muted-foreground border-b">
        Page {page.pageNumber}
      </div>
      <div className="p-3 font-mono text-xs
                      leading-relaxed whitespace-pre-wrap
                      min-h-[60px]">
        {page.text || (
          <span className="text-muted-foreground italic">
            (empty page)
          </span>
        )}
      </div>
    </div>
  )
}
