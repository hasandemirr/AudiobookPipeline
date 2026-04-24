import type { PageBlock } from '../../lib/pageUtils'

interface Props {
  page: PageBlock
}

export function RawPageCard({ page }: Props) {
  return (
    <div className="flex-1 border rounded-lg overflow-hidden bg-muted/20">
      <div className="px-3 py-1.5 bg-muted/60 text-xs
                      font-mono text-muted-foreground border-b">
        Page {page.pageNumber}
      </div>
      <div className="p-2 space-y-0.5">
        {page.lines.map((line, i) => (
          <div
            key={i}
            className="px-2 py-0.5 text-xs font-mono leading-relaxed break-all"
            title={line.text}
          >
            {line.text || '\u00A0'}
          </div>
        ))}
      </div>
    </div>
  )
}
