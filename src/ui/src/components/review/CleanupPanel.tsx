import { useState, useMemo, useEffect } from 'react'
import type { DetectedPattern } from '../../lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ChevronDown, ChevronUp,
  Trash2, RotateCcw, Layers
} from 'lucide-react'

export type PatternSelection = {
  pattern: DetectedPattern
  checked: boolean
}

export type CustomPattern = {
  id: string
  text: string
  matchType: 'exact' | 'starts-with' | 'ends-with'
  checked: boolean
}

interface CleanupPanelProps {
  patterns: DetectedPattern[]
  onApply: (
    selected: DetectedPattern[],
    custom: CustomPattern[]
  ) => void
  onPreview: (
    selected: DetectedPattern[],
    custom: CustomPattern[]
  ) => void
  onReset: () => void
  appliedCount: number
  onApplyGlobal: (
    selected: DetectedPattern[],
    custom: CustomPattern[]
  ) => void
  selectedSectionCount: number
}

export function CleanupPanel({
  patterns,
  onApply,
  onPreview,
  onReset,
  appliedCount,
  onApplyGlobal,
  selectedSectionCount,
}: CleanupPanelProps) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(['high'])
  )

  const [selections, setSelections] = useState<PatternSelection[]>(() =>
    patterns.map(p => ({
      pattern: p,
      checked: p.is_checked_by_default,
    }))
  )

  const [customPatterns, setCustomPatterns] = useState<CustomPattern[]>([])
  const [customInput, setCustomInput] = useState('')
  const [customMatchType, setCustomMatchType] =
    useState<CustomPattern['matchType']>('exact')

  useEffect(() => {
    const selected = selections.filter(s => s.checked).map(s => s.pattern)
    onPreview(selected, customPatterns.filter(c => c.checked))
  }, [selections, customPatterns, onPreview])

  const selectedCount = useMemo(
    () =>
      selections.filter(s => s.checked).length +
      customPatterns.filter(c => c.checked).length,
    [selections, customPatterns]
  )

  const togglePattern = (index: number) =>
    setSelections(prev =>
      prev.map((s, i) =>
        i === index ? { ...s, checked: !s.checked } : s
      )
    )

  const toggleCustom = (id: string) =>
    setCustomPatterns(prev =>
      prev.map(c =>
        c.id === id ? { ...c, checked: !c.checked } : c
      )
    )

  const addCustomPattern = () => {
    const text = customInput.trim()
    if (!text) return
    setCustomPatterns(prev => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        text,
        matchType: customMatchType,
        checked: true,
      },
    ])
    setCustomInput('')
  }

  const removeCustom = (id: string) =>
    setCustomPatterns(prev =>
      prev.filter(c => c.id !== id)
    )

  const handleApply = () => {
    const selected = selections
      .filter(s => s.checked)
      .map(s => s.pattern)
    onApply(
      selected,
      customPatterns.filter(c => c.checked)
    )
  }

  const handleApplyGlobal = () => {
    const selected = selections
      .filter(s => s.checked)
      .map(s => s.pattern)
    onApplyGlobal(
      selected,
      customPatterns.filter(c => c.checked)
    )
  }

  const toggleGroup = (key: string) =>
    setOpenGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const groups = [
    {
      key: 'high',
      label: 'High confidence',
      items: selections.filter(s => s.pattern.confidence === 'high'),
    },
    {
      key: 'medium',
      label: 'Medium confidence',
      items: selections.filter(s => s.pattern.confidence === 'medium'),
    },
    {
      key: 'low',
      label: 'Low confidence',
      items: selections.filter(s => s.pattern.confidence === 'low'),
    },
  ]

  return (
    <div className="flex flex-col h-full">

      {/* Header row */}
      <div className="px-3 py-2 flex items-center justify-between
                      border-b shrink-0">
        <span className="text-xs font-medium">Cleanup</span>
        <div className="flex items-center gap-2">
          {appliedCount > 0 && (
            <button
              onClick={onReset}
              className="flex items-center gap-1
                         text-xs text-muted-foreground
                         hover:text-foreground
                         transition-colors"
            >
              <RotateCcw size={11} />
              Reset
            </button>
          )}
          {selectedCount > 0 && (
            <Badge variant="outline" className="text-xs h-4 px-1">
              {selectedCount}
            </Badge>
          )}
        </div>
      </div>

      {/* Scrollable accordion list */}
      <div className="overflow-y-auto flex-1 min-h-0">
        {patterns.length === 0 && (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            Tekrar eden içerik bulunamadı. Aşağıdan özel bir desen ekleyebilirsiniz.
          </p>
        )}
        {groups.map(group => group.items.length === 0 ? null : (
          <div key={group.key}>

            {/* Group header — clickable */}
            <button
              onClick={() => toggleGroup(group.key)}
              className="w-full flex items-center justify-between
                         px-3 py-1.5 text-xs font-medium
                         text-muted-foreground hover:bg-muted/40
                         transition-colors border-b"
            >
              <span>{group.label}</span>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-xs h-4 px-1">
                  {group.items.length}
                </Badge>
                {openGroups.has(group.key)
                  ? <ChevronUp size={11} />
                  : <ChevronDown size={11} />}
              </div>
            </button>

            {/* Group items — shown when open */}
            {openGroups.has(group.key) && (
              <div className="px-3 py-1 space-y-1">
                {group.items.map((s, idx) => {
                  const globalIdx = selections.indexOf(s)
                  return (
                    <label key={idx}
                      className="flex items-start gap-2 cursor-pointer
                                 py-0.5">
                      <input type="checkbox" checked={s.checked}
                        onChange={() => togglePattern(globalIdx)}
                        className="mt-0.5 rounded shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-mono truncate block">
                          {s.pattern.text}
                        </span>
                        <span className="text-xs text-muted-foreground/60">
                          {s.pattern.position} · {s.pattern.page_count}p
                          {s.pattern.is_page_number ? ' · page no' : ''}
                        </span>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        ))}

        {/* Custom patterns */}
        {customPatterns.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-xs font-medium
                            text-muted-foreground border-b">
              Custom
            </div>
            <div className="px-3 py-1 space-y-1">
              {customPatterns.map(c => (
                <label key={c.id}
                  className="flex items-center gap-2 cursor-pointer py-0.5">
                  <input type="checkbox" checked={c.checked}
                    onChange={() => toggleCustom(c.id)}
                    className="rounded shrink-0" />
                  <span className="text-xs font-mono flex-1 truncate">
                    {c.text}
                  </span>
                  <span className="text-xs text-muted-foreground/60 shrink-0">
                    {c.matchType}
                  </span>
                  <button
                    onClick={() => removeCustom(c.id)}
                    className="text-muted-foreground hover:text-destructive
                               shrink-0 transition-colors"
                  >
                    <Trash2 size={11} />
                  </button>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Custom pattern input */}
        <div className="px-3 py-2 border-t">
          <div className="flex gap-1">
            <input
              type="text" value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustomPattern()}
              placeholder="Custom pattern..."
              className="flex-1 text-xs px-2 py-1 border rounded
                         bg-background focus:outline-none
                         focus:ring-1 focus:ring-ring min-w-0"
            />
            <select value={customMatchType}
              onChange={e => setCustomMatchType(
                e.target.value as CustomPattern['matchType'])}
              className="text-xs border rounded bg-background px-1">
              <option value="exact">=</option>
              <option value="starts-with">^</option>
              <option value="ends-with">$</option>
            </select>
            <button onClick={addCustomPattern}
              className="px-2 py-1 border rounded text-xs
                         hover:bg-muted transition-colors">
              +
            </button>
          </div>
        </div>
      </div>

      {/* Apply button — always visible, outside scroll */}
      <div className="px-3 py-2 border-t shrink-0">
        <Button size="sm" variant="outline" className="w-full text-xs"
          onClick={handleApply} disabled={selectedCount === 0}>
          <Trash2 size={11} className="mr-1" />
          Bu bölüme uygula ({selectedCount})
        </Button>
        <Button size="sm" variant="outline"
          className="w-full text-xs mt-1.5 border-amber-500/50
                     text-amber-700 dark:text-amber-400
                     hover:bg-amber-500/10"
          onClick={handleApplyGlobal}
          disabled={selectedCount === 0 || selectedSectionCount === 0}>
          <Layers size={11} className="mr-1" />
          {selectedSectionCount} bölüme uygula
        </Button>
      </div>
    </div>
  )
}
