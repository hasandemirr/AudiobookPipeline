import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/api'
import {
  type PageBlock,
  parsePages,
  pagesToContent,
  deepClonePages,
} from '../lib/pageUtils'

export function useReviewState(slug: string | undefined) {
  const queryClient = useQueryClient()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [leftPages, setLeftPages]   = useState<PageBlock[]>([])
  const [rightPages, setRightPages] = useState<PageBlock[]>([])
  const [isDirty, setIsDirty]       = useState(false)
  const [lastSaved, setLastSaved]   = useState<Date | null>(null)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Manifest
  const { data: manifest, isLoading: manifestLoading } = useQuery({
    queryKey: ['book', slug],
    queryFn: () => api.getBook(slug!),
    enabled: !!slug,
  })

  // Section content
  const { data: sectionData, isLoading: sectionLoading } = useQuery({
    queryKey: ['section', slug, selectedId],
    queryFn: () => api.getSection(slug!, selectedId!),
    enabled: !!slug && !!selectedId,
  })

  // Parse on load
  useEffect(() => {
    if (!sectionData) return
    const parsed = parsePages(sectionData.content)
    setLeftPages(parsed)
    setRightPages(deepClonePages(parsed))
    setIsDirty(false)
  }, [sectionData])

  // Save
  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateSection(slug!, selectedId!, pagesToContent(rightPages)),
    onSuccess: () => {
      toast.success('Saved.')
      setIsDirty(false)
      setLastSaved(new Date())
      queryClient.invalidateQueries({ queryKey: ['book', slug] })
    },
    onError: () => toast.error('Save failed.'),
  })

  // Approve
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (isDirty)
        await api.updateSection(
          slug!, selectedId!, pagesToContent(rightPages))
      return api.approveSection(slug!, selectedId!)
    },
    onSuccess: () => {
      toast.success('Section approved.')
      setIsDirty(false)
      setLastSaved(new Date())
      queryClient.invalidateQueries({ queryKey: ['book', slug] })
      queryClient.invalidateQueries({
        queryKey: ['section', slug, selectedId],
      })
    },
  })

  // Narrate toggle
  const narrateMutation = useMutation({
    mutationFn: () => api.toggleNarrate(slug!, selectedId!),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['book', slug] }),
  })

  // Toggle single line
  const toggleLine = useCallback(
    (pageNumber: number, lineId: string) => {
      setRightPages(prev =>
        prev.map(p =>
          p.pageNumber !== pageNumber
            ? p
            : {
                ...p,
                lines: p.lines.map(l =>
                  l.id !== lineId
                    ? l
                    : { ...l, deleted: !l.deleted }
                ),
              }
        )
      )
      setIsDirty(true)

      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = setTimeout(
        () => saveMutation.mutate(), 2000)
    },
    [saveMutation]
  )

  // Delete pattern across all pages
  const deletePatternGlobal = useCallback(
    (pattern: string) => {
      const trimmed = pattern.trim()
      const count = rightPages.reduce(
        (acc, p) =>
          acc + p.lines.filter(l => l.text.trim() === trimmed).length,
        0
      )

      if (count === 0) {
        toast.info('Pattern not found.')
        return
      }

      setRightPages(prev =>
        prev.map(p => ({
          ...p,
          lines: p.lines.map(l => ({
            ...l,
            deleted: l.deleted || l.text.trim() === trimmed,
          })),
        }))
      )
      setIsDirty(true)
      toast.success(`${count} lines marked for deletion.`)
    },
    [rightPages]
  )

  // Navigate to section
  const goTo = useCallback(
    (id: string) => {
      if (isDirty) {
        saveMutation.mutate()
      }
      setSelectedId(id)
    },
    [isDirty, saveMutation]
  )

  const sections = manifest?.sections ?? []
  const currentIndex = sections.findIndex(s => s.id === selectedId)
  const currentSection = sections.find(s => s.id === selectedId)

  return {
    // State
    selectedId,
    leftPages,
    rightPages,
    isDirty,
    lastSaved,
    // Manifest
    manifest,
    manifestLoading,
    sections,
    currentIndex,
    currentSection,
    // Section loading
    sectionLoading,
    // Mutations
    saveMutation,
    approveMutation,
    narrateMutation,
    // Actions
    goTo,
    toggleLine,
    deletePatternGlobal,
  }
}
