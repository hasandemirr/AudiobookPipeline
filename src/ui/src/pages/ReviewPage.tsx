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
    narrateMutation,
    activePageIndex,
    setActivePageIndex,
    goTo,
    goToPage,
    toggleLine,
    applyDelete,
    applyCleanup,
    resetCleanup,
    appliedPatternsCount,
    deletePatternGlobal,
  } = useReviewState(slug)

  const leftWindow  = getPageWindow(leftPages, activePageIndex)
  const rightWindow = getPageWindow(rightPages, activePageIndex)

  if (manifestLoading)
    return (
      <div className="p-8 text-muted-foreground">Loading...</div>
    )

  return (
    <div className="flex h-full overflow-hidden">
      <SectionList
        slug={slug}
        manifest={manifest}
        sections={sections}
        selectedId={selectedId}
        onSelect={goTo}
        onBack={() => navigate('/')}
      />

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
              onPrev={() =>
                currentIndex > 0 &&
                goTo(sections[currentIndex - 1].id)}
              onNext={() =>
                currentIndex < sections.length - 1 &&
                goTo(sections[currentIndex + 1].id)}
            />

            {/* Cleanup panel */}
            {selectedId && !sectionLoading &&
              (sectionData?.detected_patterns?.length ?? 0) > 0 && (
              <CleanupPanel
                patterns={sectionData.detected_patterns}
                onApply={applyCleanup}
                onReset={resetCleanup}
                appliedCount={appliedPatternsCount}
              />
            )}

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
