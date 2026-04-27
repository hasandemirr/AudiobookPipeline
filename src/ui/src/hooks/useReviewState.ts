import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError } from '../lib/api'
import {
  type PageBlock,
  parsePages,
  pagesToContent,
  deepClonePages,
  mergeCrossPageHyphens,
} from '../lib/pageUtils'
import type { DetectedPattern } from '../lib/api'
import type { CustomPattern } from '../components/review/CleanupPanel'
import type { DeleteScope } from '../components/review/LineActionMenu'

export function useReviewState(slug: string | undefined) {
  const queryClient = useQueryClient()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [leftPages, setLeftPages]   = useState<PageBlock[]>([])
  const [rightPages, setRightPages] = useState<PageBlock[]>([])
  const [isDirty, setIsDirty]       = useState(false)
  const [lastSaved, setLastSaved]   = useState<Date | null>(null)
  const [activePageIndex, setActivePageIndex] = useState<number>(0)

  const [appliedPatternsCount, setAppliedPatternsCount] = useState(0)
  const [cleanupSnapshot, setCleanupSnapshot] = useState<PageBlock[] | null>(null)
  const [previewIds, setPreviewIds] = useState<Set<string>>(new Set())

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

    const repeatedLines  = sectionData.repeated_lines  ?? []

    const parsed = parsePages(
      sectionData.content,
      repeatedLines
    )

    setLeftPages(parsed)
    setRightPages(mergeCrossPageHyphens(deepClonePages(parsed)))
    setCleanupSnapshot(null)
    setAppliedPatternsCount(0)
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
    onError: (err) => {
      const message = err instanceof ApiError
        ? err.message
        : 'Save failed.'
      toast.error(message)
    },
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
      queryClient.resetQueries({
        queryKey: ['section', slug, selectedId],
      })
    },
    onError: (err) => {
      const message = err instanceof ApiError
        ? err.message
        : 'Approve failed.'
      toast.error(message)
    },
  })

  // Reset
  const resetSectionMutation = useMutation({
    mutationFn: () => api.resetSection(slug!, selectedId!),
    onSuccess: () => {
      toast.success('Section reset to raw.')
      queryClient.resetQueries({
        queryKey: ['section', slug, selectedId],
      })
      queryClient.invalidateQueries({ queryKey: ['book', slug] })
    },
    onError: (err) => {
      const message = err instanceof ApiError
        ? err.message
        : 'Reset failed.'
      toast.error(message)
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
      setRightPages(prev => {
        const updated = prev.map(p =>
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
        return mergeCrossPageHyphens(updated)
      })
      setIsDirty(true)

      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = setTimeout(
        () => saveMutation.mutate(), 2000)
    },
    [saveMutation]
  )

  const applyDelete = useCallback(
    (
      pageNumber: number,
      lineId: string,
      lineIndex: number,
      lineText: string,
      scope: DeleteScope
    ) => {
      setRightPages(prev => {
        const updated = prev.map(p => ({
          ...p,
          lines: p.lines.map((l) => {
            let shouldDelete = false

            switch (scope) {
              case 'this':
                shouldDelete =
                  p.pageNumber === pageNumber &&
                  l.id === lineId
                break

              case 'all-same-text':
                shouldDelete =
                  l.text.trim().toLowerCase() ===
                  lineText.trim().toLowerCase()
                break

              case 'all-first-line': {
                const nonEmpty = p.lines.filter(
                  x => x.text.trim() !== '')
                shouldDelete =
                  nonEmpty.length > 0 &&
                  l.id === nonEmpty[0].id
                break
              }

              case 'all-last-line': {
                const nonEmpty = p.lines.filter(
                  x => x.text.trim() !== '')
                shouldDelete =
                  nonEmpty.length > 0 &&
                  l.id === nonEmpty[nonEmpty.length - 1].id
                break
              }

              case 'all-same-position':
                shouldDelete = l.lineIndex === lineIndex
                break
            }

            return shouldDelete
              ? { ...l, deleted: true }
              : l
          }),
        }))
        return mergeCrossPageHyphens(updated)
      })

      setIsDirty(true)
      if (autoSaveTimer.current)
        clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = setTimeout(
        () => saveMutation.mutate(), 2000)
    },
    [saveMutation]
  )

  const applyCleanup = useCallback(
    (selected: DetectedPattern[], custom: CustomPattern[]) => {
      // Snapshot for reset
      setCleanupSnapshot(deepClonePages(rightPages))

      setRightPages(prev => {
        const updated = prev.map(page => {
          const nonEmpty = page.lines.filter(
            l => !l.deleted && l.text.trim() !== ''
          )

          return {
            ...page,
            lines: page.lines.map((line) => {
              if (line.deleted) return line

              const trimmed = line.text.trim()
              let shouldDelete = false

              // Check detected patterns
              for (const pattern of selected) {
                const matches = trimmed.toLowerCase() === pattern.text.toLowerCase()

                if (!matches) continue

                if (pattern.position === 'first') {
                  const firstNonEmpty = nonEmpty[0]
                  if (firstNonEmpty?.id === line.id) shouldDelete = true
                } else if (pattern.position === 'last') {
                  const lastNonEmpty = nonEmpty[nonEmpty.length - 1]
                  if (lastNonEmpty?.id === line.id) shouldDelete = true
                } else {
                  shouldDelete = true
                }

                if (shouldDelete) break
              }

              // Check custom patterns
              if (!shouldDelete) {
                for (const cp of custom) {
                  const t = trimmed.toLowerCase()
                  const v = cp.text.toLowerCase()
                  if (
                    (cp.matchType === 'exact' && t === v) ||
                    (cp.matchType === 'starts-with' && t.startsWith(v)) ||
                    (cp.matchType === 'ends-with' && t.endsWith(v))
                  ) {
                    shouldDelete = true
                    break
                  }
                }
              }

              return shouldDelete ? { ...line, deleted: true } : line
            }),
          }
        })
        return mergeCrossPageHyphens(updated)
      })

      setAppliedPatternsCount(selected.length + custom.length)
      setIsDirty(true)
      setPreviewIds(new Set())

      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = setTimeout(() => saveMutation.mutate(), 2000)
    },
    [rightPages, saveMutation]
  )

  const previewCleanup = useCallback(
    (selected: DetectedPattern[], custom: CustomPattern[]) => {
      const ids = new Set<string>()
      rightPages.forEach(page => {
        const nonEmpty = page.lines.filter(
          l => !l.deleted && l.text.trim() !== '')
        page.lines.forEach(line => {
          if (line.deleted) return
          const trimmed = line.text.trim()
          for (const p of selected) {
            const matches = trimmed.toLowerCase() ===
              p.text.toLowerCase()
            if (!matches) continue
            if (p.position === 'first') {
              if (nonEmpty[0]?.id === line.id) ids.add(line.id)
            } else if (p.position === 'last') {
              if (nonEmpty[nonEmpty.length - 1]?.id === line.id)
                ids.add(line.id)
            } else {
              ids.add(line.id)
            }
            break
          }
          if (!ids.has(line.id)) {
            for (const cp of custom) {
              const t = trimmed.toLowerCase()
              const v = cp.text.toLowerCase()
              if (
                (cp.matchType === 'exact' && t === v) ||
                (cp.matchType === 'starts-with' && t.startsWith(v)) ||
                (cp.matchType === 'ends-with' && t.endsWith(v))
              ) { ids.add(line.id); break }
            }
          }
        })
      })
      setPreviewIds(ids)
    },
    [rightPages]
  )

  const resetCleanup = useCallback(() => {
    if (!cleanupSnapshot) return
    setRightPages(cleanupSnapshot)
    setCleanupSnapshot(null)
    setAppliedPatternsCount(0)
    setIsDirty(true)
    setPreviewIds(new Set())
  }, [cleanupSnapshot])

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

  const deletePage = useCallback(
    (pageNumber: number) => {
      setRightPages(prev => {
        const updated = prev.map(p =>
          p.pageNumber !== pageNumber
            ? p
            : {
                ...p,
                lines: p.lines.map(l => ({ ...l, deleted: true })),
              }
        )
        return mergeCrossPageHyphens(updated)
      })
      setIsDirty(true)
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = setTimeout(() => saveMutation.mutate(), 2000)
    },
    [saveMutation]
  )

  // Navigate to specific page index
  const goToPage = useCallback(
    (absoluteIndex: number) => {
      const clamped = Math.max(
        0,
        Math.min(absoluteIndex, rightPages.length - 1)
      )
      setActivePageIndex(clamped)
    },
    [rightPages.length]
  )

  // Navigate to section
  const goTo = useCallback(
    (id: string) => {
      if (isDirty) {
        saveMutation.mutate()
      }
      setSelectedId(id)
      setActivePageIndex(0) // Reset page index on section change
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
    activePageIndex,
    setActivePageIndex,
    // Manifest
    manifest,
    manifestLoading,
    sections,
    currentIndex,
    currentSection,
    // Section loading
    sectionLoading,
    sectionData,
    // Mutations
    saveMutation,
    approveMutation,
    resetSectionMutation,
    narrateMutation,
    // Actions
    goTo,
    goToPage,
    toggleLine,
    applyDelete,
    applyCleanup,
    previewCleanup,
    previewIds,
    resetCleanup,
    appliedPatternsCount,
    deletePatternGlobal,
    deletePage,
  }
}
