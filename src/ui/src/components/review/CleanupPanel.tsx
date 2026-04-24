import { useState, useMemo } from 'react'
import type { DetectedPattern } from '../../lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  ChevronDown, ChevronUp,
  Trash2, RotateCcw, Plus
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
  onReset: () => void
  appliedCount: number
}

function confidenceBadge(conf: string) {
  if (conf === 'high')
    return (
      <Badge variant="default" className="text-xs h-4 px-1">
        high
      </Badge>
    )
  if (conf === 'medium')
    return (
      <Badge variant="secondary" className="text-xs h-4 px-1">
        medium
      </Badge>
    )
  return (
    <Badge variant="outline" className="text-xs h-4 px-1">
      low
    </Badge>
  )
}

export function CleanupPanel({
  patterns,
  onApply,
  onReset,
  appliedCount,
}: CleanupPanelProps) {
  const [isOpen, setIsOpen] = useState(true)

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

  const selectedCount = useMemo(
    () =>
      selections.filter(s => s.checked).length +
      customPatterns.filter(c => c.checked).length,
    [selections, customPatterns]
  )

  const allChecked = useMemo(
    () =>
      selections.every(s => s.checked) &&
      customPatterns.every(c => c.checked),
    [selections, customPatterns]
  )

  const toggleAll = () => {
    const next = !allChecked
    setSelections(prev =>
      prev.map(s => ({ ...s, checked: next }))
    )
    setCustomPatterns(prev =>
      prev.map(c => ({ ...c, checked: next }))
    )
  }

  const togglePattern = (index: number) => {
    setSelections(prev =>
      prev.map((s, i) =>
        i === index ? { ...s, checked: !s.checked } : s
      )
    )
  }

  const toggleCustom = (id: string) => {
    setCustomPatterns(prev =>
      prev.map(c =>
        c.id === id ? { ...c, checked: !c.checked } : c
      )
    )
  }

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

  const removeCustomPattern = (id: string) => {
    setCustomPatterns(prev =>
      prev.filter(c => c.id !== id)
    )
  }

  const handleApply = () => {
    const selected = selections
      .filter(s => s.checked)
      .map(s => s.pattern)
    onApply(selected, customPatterns.filter(c => c.checked))
  }

  const highPatterns   = selections.filter(
    s => s.pattern.confidence === 'high')
  const mediumPatterns = selections.filter(
    s => s.pattern.confidence === 'medium')
  const lowPatterns    = selections.filter(
    s => s.pattern.confidence === 'low')

  return (
    <div className="border-b bg-muted/10 shrink-0">
      {/* Header */}
      <div
        className="px-4 py-2 flex items-center
                   justify-between cursor-pointer
                   hover:bg-muted/20 transition-colors"
        onClick={() => setIsOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">
            Cleanup
          </span>
          {appliedCount > 0 && (
            <Badge variant="secondary"
              className="text-xs h-4 px-1">
              {appliedCount} applied
            </Badge>
          )}
          {selectedCount > 0 && appliedCount === 0 && (
            <Badge variant="outline"
              className="text-xs h-4 px-1">
              {selectedCount} selected
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {appliedCount > 0 && (
            <button
              onClick={e => {
                e.stopPropagation()
                onReset()
              }}
              className="flex items-center gap-1
                         text-xs text-muted-foreground
                         hover:text-foreground
                         transition-colors"
            >
              <RotateCcw size={12} />
              Reset
            </button>
          )}
          {isOpen
            ? <ChevronUp size={14}
                className="text-muted-foreground" />
            : <ChevronDown size={14}
                className="text-muted-foreground" />
          }
        </div>
      </div>

      {isOpen && (
        <div className="px-4 pb-3 space-y-3">

          {/* Select all */}
          <div className="flex items-center
                          justify-between">
            <label className="flex items-center
                               gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
                className="rounded"
              />
              <span className="text-xs
                               text-muted-foreground">
                Select all
              </span>
            </label>
          </div>

          <Separator />

          {/* Pattern groups */}
          {[
            { label: 'High confidence',
              items: highPatterns },
            { label: 'Medium confidence',
              items: mediumPatterns },
            { label: 'Low confidence',
              items: lowPatterns },
          ].map(group =>
            group.items.length === 0 ? null : (
              <div key={group.label}
                className="space-y-1">
                <p className="text-xs
                               text-muted-foreground/60
                               font-medium uppercase
                               tracking-wide">
                  {group.label}
                </p>
                {group.items.map((s, groupIdx) => {
                  const globalIdx =
                    selections.indexOf(s)
                  return (
                    <label
                      key={s.pattern.text + s.pattern.position}
                      className="flex items-start
                                 gap-2 cursor-pointer
                                 group"
                    >
                      <input
                        type="checkbox"
                        checked={s.checked}
                        onChange={() =>
                          togglePattern(globalIdx)}
                        className="rounded mt-0.5
                                   shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center
                                        gap-1.5 flex-wrap">
                          <span className="text-xs
                                           font-mono
                                           truncate">
                            {s.pattern.text}
                          </span>
                          {confidenceBadge(
                            s.pattern.confidence)}
                          {s.pattern.is_page_number && (
                            <Badge variant="outline"
                              className="text-xs h-4
                                         px-1 text-blue-600
                                         dark:text-blue-400">
                              page no
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs
                                      text-muted-foreground/60">
                          {s.pattern.position} line
                          · {s.pattern.page_count} pages
                        </p>
                      </div>
                    </label>
                  )
                })}
              </div>
            )
          )}

          {/* Custom patterns */}
          {customPatterns.length > 0 && (
            <>
              <Separator />
              <div className="space-y-1">
                <p className="text-xs
                               text-muted-foreground/60
                               font-medium uppercase
                               tracking-wide">
                  Custom
                </p>
                {customPatterns.map(c => (
                  <label
                    key={c.id}
                    className="flex items-center
                               gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={c.checked}
                      onChange={() => toggleCustom(c.id)}
                      className="rounded shrink-0"
                    />
                    <span className="text-xs font-mono
                                     flex-1 truncate">
                      {c.text}
                    </span>
                    <span className="text-xs
                                     text-muted-foreground/60
                                     shrink-0">
                      {c.matchType}
                    </span>
                    <button
                      onClick={() =>
                        removeCustomPattern(c.id)}
                      className="text-muted-foreground
                                 hover:text-destructive
                                 shrink-0 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </label>
                ))}
              </div>
            </>
          )}

          {/* Custom input */}
          <Separator />
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground/60
                          font-medium uppercase
                          tracking-wide">
              Add pattern
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={customInput}
                onChange={e =>
                  setCustomInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter')
                    addCustomPattern()
                }}
                placeholder="Text to remove..."
                className="flex-1 px-2 py-1 text-xs
                           border rounded bg-background
                           focus:outline-none
                           focus:ring-1 focus:ring-ring"
              />
              <select
                value={customMatchType}
                onChange={e =>
                  setCustomMatchType(
                    e.target.value as
                      CustomPattern['matchType']
                  )}
                className="text-xs border rounded
                           bg-background px-1
                           focus:outline-none"
              >
                <option value="exact">exact</option>
                <option value="starts-with">
                  starts with
                </option>
                <option value="ends-with">
                  ends with
                </option>
              </select>
              <Button
                size="sm"
                variant="outline"
                onClick={addCustomPattern}
                disabled={!customInput.trim()}
                className="shrink-0"
              >
                <Plus size={12} />
              </Button>
            </div>
          </div>

          {/* Apply button */}
          <Button
            size="sm"
            className="w-full"
            onClick={handleApply}
            disabled={selectedCount === 0}
          >
            <Trash2 size={13} className="mr-1.5" />
            Apply to all pages ({selectedCount} patterns)
          </Button>
        </div>
      )}
    </div>
  )
}
