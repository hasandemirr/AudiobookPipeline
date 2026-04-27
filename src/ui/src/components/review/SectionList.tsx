import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import type { BookManifest, Section } from '../../lib/api'

interface Props {
  slug: string | undefined
  manifest: BookManifest | undefined
  sections: Section[]
  selectedId: string | null
  onSelect: (id: string) => void
  onBack: () => void
}

const statusVariant = (status: string) => {
  if (status === 'approved') return 'default' as const
  if (status === 'reviewed') return 'secondary' as const
  return 'outline' as const
}

const statusLabel = (status: string) => {
  if (status === 'approved') return 'Approved'
  if (status === 'reviewed') return 'Reviewed'
  return 'Extracted'
}

export function SectionList({
  slug, manifest, sections,
  selectedId, onSelect, onBack,
}: Props) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-3 border-b flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft size={16} />
        </Button>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {manifest?.book ?? slug}
          </p>
          <p className="text-xs text-muted-foreground">
            {sections.filter(s => s.status === 'approved').length}
            /{sections.length} approved
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`w-full text-left px-3 py-2.5 border-b
                       text-sm hover:bg-muted/50 transition-colors
                       ${selectedId === s.id ? 'bg-muted' : ''}`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="truncate font-medium text-xs">
                {s.title}
              </span>
              <Badge
                variant={statusVariant(s.status)}
                className="text-xs shrink-0 h-4 px-1"
              >
                {statusLabel(s.status)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              p.{s.page_start}–{s.page_end}
              {!s.narrate && ' · silent'}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
