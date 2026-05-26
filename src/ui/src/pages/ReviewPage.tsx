import { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useReviewState } from '../hooks/useReviewState'
import { getPageWindow } from '../lib/pageUtils'
import { SectionList } from '../components/review/SectionList'
import { ReviewToolbar } from '../components/review/ReviewToolbar'
import { RawPage } from '../components/review/RawPageCard'
import { EditablePage } from '../components/review/EditablePageCard'
import { CleanupPanel } from '../components/review/CleanupPanel'

export default function ReviewPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const {
    selectedId,
    leftPages,
    rightPages,
    isDirty,
    lastSaved,
    manifest,
    manifestLoading,
    sections,
    currentIndex,
    currentSection,
    sectionLoading,
    sectionData,
    saveMutation,
    approveMutation,
    resetSectionMutation,
    narrateMutation,
    activePageIndex,
    setActivePageIndex,
    goTo,
    goToPage,
    toggleLine,
    applyDelete,
    applyCleanup,
    applyCleanupGlobal,
    previewCleanup,
    previewIds,
    resetCleanup,
    appliedPatternsCount,
    deletePatternGlobal,
    deletePage,
  } = useReviewState(slug)

  const leftWindow = getPageWindow(leftPages, activePageIndex)
  const rightWindow = getPageWindow(rightPages, activePageIndex)

  // Resizable cleanup panel height
  const [cleanupHeight, setCleanupHeight] = useState(280)
  const [selectedSectionIds, setSelectedSectionIds] = useState<Set<string>>(
    new Set()
  )

  const toggleSectionSelect = useCallback((id: string) => {
    setSelectedSectionIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAllSections = useCallback(() => {
    setSelectedSectionIds(prev =>
      prev.size === sections.length
        ? new Set()
        : new Set(sections.map(s => s.id))
    )
  }, [sections])

  const handleApplyGlobal = useCallback(
    (selected: Parameters<typeof applyCleanupGlobal>[0],
     custom: Parameters<typeof applyCleanupGlobal>[1]) => {
      applyCleanupGlobal(selected, custom, Array.from(selectedSectionIds))
    },
    [applyCleanupGlobal, selectedSectionIds]
  )
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startH: cleanupHeight }

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startY - ev.clientY
      const next = Math.min(500, Math.max(120, dragRef.current.startH + delta))
      setCleanupHeight(next)
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }, [cleanupHeight])

  if (manifestLoading)
    return (
      <div className="p-8 text-muted-foreground">Loading...</div>
    )

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-64 border-r flex flex-col shrink-0 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <SectionList
            slug={slug}
            manifest={manifest}
            sections={sections}
            selectedId={selectedId}
            onSelect={goTo}
            selectedIds={selectedSectionIds}
            onToggleSelect={toggleSectionSelect}
            onToggleAll={toggleAllSections}
            onBack={() => navigate('/')}
          />
        </div>

        {selectedId && !sectionLoading && sectionData &&
          (sectionData.detected_patterns?.length ?? 0) > 0 && (
            <>
              {/* Drag handle */}
              <div
                onMouseDown={onDragStart}
                className="h-1.5 shrink-0 cursor-ns-resize
                           border-t border-b bg-muted/30
                           hover:bg-primary/20 active:bg-primary/30
                           transition-colors flex items-center
                           justify-center"
              >
                <div className="w-8 h-0.5 rounded-full bg-muted-foreground/30" />
              </div>
              <div className="shrink-0 overflow-hidden"
                   style={{ height: cleanupHeight }}>
                <CleanupPanel
                  patterns={sectionData.detected_patterns}
                  onApply={applyCleanup}
                  onApplyGlobal={handleApplyGlobal}
                  selectedSectionCount={selectedSectionIds.size}
                  onPreview={previewCleanup}
                  onReset={resetCleanup}
                  appliedCount={appliedPatternsCount}
                />
              </div>
            </>
          )}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center
                          text-muted-foreground text-sm">
            Select a section from the list
          </div>
        ) : (
          <>
            <ReviewToolbar
              slug={slug}
              currentSection={currentSection}
              currentIndex={currentIndex}
              sectionsLength={sections.length}
              isDirty={isDirty}
              lastSaved={lastSaved}
              isSaving={saveMutation.isPending}
              isApproving={approveMutation.isPending}
              onSave={() => saveMutation.mutate()}
              onApprove={() => approveMutation.mutate()}
              onNarrate={() => narrateMutation.mutate()}
              onExport={async () => {
                if (isDirty) {
                  await saveMutation.mutateAsync()
                }
                window.open(`/api/books/${slug}/export`, '_blank')
              }}
              onPrev={() =>
                currentIndex > 0 &&
                goTo(sections[currentIndex - 1].id)}
              onNext={() =>
                currentIndex < sections.length - 1 &&
                goTo(sections[currentIndex + 1].id)}
              onReset={() => resetSectionMutation.mutate()}
            />

            {/* Pagination bar */}
            {rightPages.length > 10 && (
              <div className="px-4 py-2 border-b bg-muted/20
                              flex items-center justify-between
                              text-xs text-muted-foreground shrink-0">
                <button
                  onClick={() =>
                    goToPage(Math.max(0, activePageIndex - 10))}
                  disabled={activePageIndex === 0}
                  className="px-2 py-1 rounded hover:bg-muted
                             disabled:opacity-40
                             disabled:cursor-not-allowed
                             transition-colors"
                >
                  ← Previous 10
                </button>
                <span>
                  Page {leftWindow.startIndex + 1}–
                  {leftWindow.endIndex + 1} of {leftPages.length}
                </span>
                <button
                  onClick={() =>
                    goToPage(
                      Math.min(
                        rightPages.length - 1,
                        activePageIndex + 10
                      )
                    )}
                  disabled={
                    leftWindow.endIndex >= leftPages.length - 1
                  }
                  className="px-2 py-1 rounded hover:bg-muted
                             disabled:opacity-40
                             disabled:cursor-not-allowed
                             transition-colors"
                >
                  Next 10 →
                </button>
              </div>
            )}

            {sectionLoading ? (
              <div className="flex-1 flex items-center
                              justify-center text-muted-foreground">
                Loading...
              </div>
            ) : (
              <>
                {/* Kolon başlıkları — scroll dışında, sabit */}
                <div className="grid grid-cols-2 border-b shrink-0">
                  <div className="p-3 bg-muted/40 text-xs font-medium
                                  text-muted-foreground border-r">
                    Raw Text (Extract)
                  </div>
                  <div className="p-3 bg-muted/40 text-xs font-medium
                                  text-muted-foreground">
                    Edited Text
                    <span className="ml-2 text-muted-foreground/60">
                      (click line to mark/unmark)
                    </span>
                  </div>
                </div>

                {/* TEK SCROLL — her sayfa çifti kendi satırında */}
                <div className="flex-1 overflow-auto">
                  {leftWindow.pages.map((leftPage, i) => {
                    const rightPage = rightWindow.pages[i]
                    const absoluteIndex = leftWindow.startIndex + i
                    const isActive = absoluteIndex === activePageIndex

                    if (!rightPage) return null

                    return (
                      <div
                        key={leftPage.pageNumber}
                        className="grid grid-cols-2 border-b last:border-b-0"
                      >
                        {/* Sol — raw */}
                        <div className="border-r bg-muted/20 p-4">
                          <RawPage
                            page={leftPage}
                            isActive={isActive}
                          />
                        </div>
                        {/* Sağ — edited */}
                        <div className="p-4">
                          <EditablePage
                            page={rightPage}
                            isActive={isActive}
                            absoluteIndex={absoluteIndex}
                            onToggleLine={toggleLine}
                            onApplyDelete={applyDelete}
                            onDeletePattern={deletePatternGlobal}
                            onDeletePage={deletePage}
                            previewIds={previewIds}
                            onPageFocus={setActivePageIndex}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
