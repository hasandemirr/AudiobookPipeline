import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Save, Check, Volume2, VolumeX,
  ChevronLeft, ChevronRight, Download, RotateCcw
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
  onExport: () => void
  onPrev: () => void
  onNext: () => void
  onReset: () => void
  onResetAll: () => void
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
  currentSection, currentIndex, sectionsLength,
  isDirty, lastSaved, isSaving, isApproving,
  onSave, onApprove, onNarrate, onExport, onPrev, onNext, onReset, onResetAll,
}: Props) {
  const [resetMenu, setResetMenu] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)

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

        <div className="relative">
          <Button variant="ghost" size="sm"
            onClick={() => { setResetMenu(true); setConfirmAll(false) }}
            className="text-destructive hover:bg-destructive/10 px-2"
            title="Reset to raw extracted state">
            <RotateCcw size={13} className="mr-1" />
            Reset
          </Button>
          {resetMenu && (
            <>
              <div className="fixed inset-0 z-40"
                onClick={() => { setResetMenu(false); setConfirmAll(false) }} />
              <div className="absolute right-0 top-full mt-1 z-50
                              bg-popover border rounded-md shadow-md
                              text-xs overflow-hidden min-w-[200px]">
                {!confirmAll ? (
                  <>
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-muted
                                 transition-colors flex items-center gap-2"
                      onClick={() => {
                        onReset()
                        setResetMenu(false)
                      }}
                    >
                      <RotateCcw size={12} className="shrink-0" />
                      Bu bölümü resetle
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 transition-colors
                                 flex items-center gap-2 text-destructive
                                 hover:bg-destructive/10"
                      onClick={() => setConfirmAll(true)}
                    >
                      <RotateCcw size={12} className="shrink-0" />
                      Tüm kitabı resetle
                    </button>
                  </>
                ) : (
                  <div className="p-3 space-y-2">
                    <p className="text-destructive font-medium">
                      Emin misiniz?
                    </p>
                    <p className="text-muted-foreground">
                      Tüm bölümlerdeki düzenlemeler silinir ve raw metne dönülür.
                      Bu işlem geri alınamaz.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="destructive"
                        className="flex-1 text-xs"
                        onClick={() => {
                          onResetAll()
                          setResetMenu(false)
                          setConfirmAll(false)
                        }}>
                        Evet, tüm kitabı resetle
                      </Button>
                      <Button size="sm" variant="outline"
                        className="flex-1 text-xs"
                        onClick={() => { setResetMenu(false); setConfirmAll(false) }}>
                        İptal
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

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
          onClick={onExport}
          disabled={isSaving || isApproving}>
          <Download size={13} className="mr-1" />
          Export
        </Button>
      </div>
    </div>
  )
}
