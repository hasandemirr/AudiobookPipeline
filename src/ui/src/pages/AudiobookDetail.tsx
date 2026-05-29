import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type AudiobookChunk } from '../lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Zap } from 'lucide-react'

const statusVariant = (s: string) => {
  if (s === 'done') return 'default' as const
  if (s === 'rendering') return 'secondary' as const
  if (s === 'failed') return 'destructive' as const
  return 'outline' as const
}

export default function AudiobookDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const { data, isLoading, error } = useQuery({
    queryKey: ['audiobook', slug],
    queryFn: () => api.getAudiobook(slug!),
    enabled: !!slug,
    retry: false,
  })

  if (isLoading)
    return <div className="p-6 text-sm text-muted-foreground">Yükleniyor…</div>

  if (error || !data) {
    return (
      <div className="p-6 space-y-3">
        <Button variant="outline" size="sm"
          onClick={() => navigate('/audiobooks')}>
          <ArrowLeft size={13} className="mr-1" />
          Audiobooks
        </Button>
        <p className="text-sm text-muted-foreground">Audiobook bulunamadı.</p>
      </div>
    )
  }

  const { manifest, chunks } = data

  // Group chunks by section_id, preserving order.
  const groups: { sectionId: string; title: string; items: AudiobookChunk[] }[] = []
  const indexBySection = new Map<string, number>()
  for (const c of chunks) {
    if (!indexBySection.has(c.section_id)) {
      indexBySection.set(c.section_id, groups.length)
      groups.push({ sectionId: c.section_id, title: c.section_title, items: [] })
    }
    groups[indexBySection.get(c.section_id)!].items.push(c)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Üst bar */}
      <div className="px-4 py-2 border-b flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="icon"
          onClick={() => navigate('/audiobooks')} title="Audiobooks">
          <ArrowLeft size={15} />
        </Button>
        <span className="text-sm font-medium">{manifest.title}</span>
        <Badge variant="outline" className="text-xs">{manifest.source_type}</Badge>
        <Badge variant="outline" className="text-xs">{chunks.length} chunk</Badge>
        <Badge variant="secondary" className="text-xs">
          {manifest.render_status}
        </Badge>
      </div>

      {/* Section card'lar */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {groups.map(g => (
          <Card key={g.sectionId}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">
                  {g.title || g.sectionId}
                </h2>
                <Badge variant="outline" className="text-[10px]">
                  {g.items.length}
                </Badge>
              </div>
              {/* Chunk'lar soldan saga akan grid */}
              <div className="flex flex-wrap gap-2">
                {g.items.map(c => (
                  <ChunkBox key={c.id} slug={slug!} chunk={c} />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function ChunkBox({ slug, chunk }: {
  slug: string
  chunk: AudiobookChunk
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(chunk.text)

  const save = useMutation({
    mutationFn: () => api.updateAudiobookChunk(slug, chunk.id, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audiobook', slug] })
    },
  })

  const handleBlur = () => {
    setEditing(false)
    if (text !== chunk.text) save.mutate()
  }

  const count = text.length
  const over = count > 280

  return (
    <div className="border rounded-md p-2 bg-background w-[260px]
                    text-xs space-y-1.5">
      {editing ? (
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={handleBlur}
          className="w-full text-xs border rounded p-1 bg-background
                     resize-none min-h-[80px] outline-none focus:ring-1
                     focus:ring-primary"
        />
      ) : (
        <p className="whitespace-pre-wrap break-words line-clamp-4
                      cursor-text"
          onClick={() => { setText(chunk.text); setEditing(true) }}>
          {chunk.text}
        </p>
      )}
      <div className="flex items-center gap-1.5 flex-wrap text-muted-foreground">
        <span className={over ? 'text-destructive font-medium' : ''}>
          {count}/280
        </span>
        {chunk.page_start != null && (
          <>
            <span>·</span>
            <span>
              p.{chunk.page_start}
              {chunk.page_end != null && chunk.page_end !== chunk.page_start
                && `–${chunk.page_end}`}
            </span>
          </>
        )}
        {chunk.is_long && (
          <Badge variant="outline"
            className="text-amber-700 dark:text-amber-400
                       border-amber-500/50 text-[9px] px-1 py-0">
            <Zap size={8} className="mr-0.5" />long
          </Badge>
        )}
        <span className="ml-auto">
          <Badge variant={statusVariant(chunk.status)}
            className="text-[9px] px-1 py-0">{chunk.status}</Badge>
        </span>
      </div>
    </div>
  )
}
