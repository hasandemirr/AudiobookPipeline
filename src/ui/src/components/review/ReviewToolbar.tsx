import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Save, Check, Volume2, VolumeX,
  ChevronLeft, ChevronRight, Download,
} from 'lucide-react'
import { formatRelativeTime } from '../../lib/pageUtils'
import type { Section } from '../../lib/api'

interface Props {
  slug: string | undefined
  currentSection: Section | undefined
  currentIndex: number
  sectionsLength: number
  isDirty: boolean
  lastSaved: Date | null
  isSaving: boolean
  isApproving: boolean
  onSave: () => void
  onApprove: () => void
  onNarrate: () => void
  onPrev: () => void
  onNext: () => void
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

export function ReviewToolbar({
  slug, currentSection, currentIndex, sectionsLength,
  isDirty, lastSaved, isSaving, isApproving,
  onSave, onApprove, onNarrate, onPrev, onNext,
}: Props) {
  const saveStatus = isSaving
    ? '⟳ Saving...'
    : isDirty
      ? '● Unsaved'
      : lastSaved
        ? `✓ ${formatRelativeTime(lastSaved)}`
        : ''

  return (
    <div className="px-4 py-2 border-b flex items-center
                    justify-between gap-3 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {currentSection?.title}
        </span>
        {currentSection && (
          <Badge variant={statusVariant(currentSection.status)}>
            {statusLabel(currentSection.status)}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {saveStatus}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost" size="icon"
          onClick={onNarrate}
          title={currentSection?.narrate ? 'Narrated' : 'Silent'}
        >
          {currentSection?.narrate
            ? <Volume2 size={15} />
            : <VolumeX size={15} className="text-muted-foreground" />}
        </Button>

        <Button variant="ghost" size="icon"
          onClick={onPrev} disabled={currentIndex <= 0}>
          <ChevronLeft size={15} />
        </Button>
        <Button variant="ghost" size="icon"
          onClick={onNext}
          disabled={currentIndex >= sectionsLength - 1}>
          <ChevronRight size={15} />
        </Button>

        <Separator orientation="vertical" className="h-5" />

        <Button variant="outline" size="sm"
          onClick={onSave}
          disabled={!isDirty || isSaving}>
          <Save size={13} className="mr-1" />
          Save
        </Button>

        <Button size="sm"
          onClick={onApprove}
          disabled={isApproving ||
            currentSection?.status === 'approved'}>
          <Check size={13} className="mr-1" />
          Approve
        </Button>

        <Button variant="ghost" size="sm"
          onClick={() =>
            window.open(`/api/books/${slug}/export`, '_blank')}>
          <Download size={13} className="mr-1" />
          Export
        </Button>
      </div>
    </div>
  )
}
