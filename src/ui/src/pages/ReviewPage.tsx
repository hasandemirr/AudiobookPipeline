import { useParams, useNavigate } from 'react-router-dom'
import { useReviewState } from '../hooks/useReviewState'
import { SectionList } from '../components/review/SectionList'
import { ReviewToolbar } from '../components/review/ReviewToolbar'
import { RawPageCard } from '../components/review/RawPageCard'
import { EditablePageCard } from '../components/review/EditablePageCard'

export default function ReviewPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const {
    selectedId, leftPages, rightPages,
    isDirty, lastSaved,
    manifest, manifestLoading,
    sections, currentIndex, currentSection,
    sectionLoading,
    saveMutation, approveMutation, narrateMutation,
    goTo, toggleLine, deletePatternGlobal,
  } = useReviewState(slug)

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

            <div className="flex sticky top-0 bg-background z-10 border-b shrink-0">
              <div className="flex-1 p-2 text-[10px] uppercase tracking-wider
                              font-bold text-muted-foreground border-r bg-muted/30">
                Raw Text (Extract)
              </div>
              <div className="flex-1 p-2 text-[10px] uppercase tracking-wider
                              font-bold text-muted-foreground bg-muted/30">
                Edited Text (Review)
              </div>
            </div>

            {sectionLoading ? (
              <div className="flex-1 flex items-center
                              justify-center text-muted-foreground">
                Loading...
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-8">
                  {leftPages.map((leftPage, i) => {
                    const rightPage = rightPages[i]
                    if (!rightPage) return null
                    return (
                      <div key={leftPage.pageNumber} className="flex gap-4 items-stretch">
                        <RawPageCard page={leftPage} />
                        <EditablePageCard
                          page={rightPage}
                          onToggleLine={toggleLine}
                          onDeletePattern={deletePatternGlobal}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
