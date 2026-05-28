import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type RenderChunk } from '../lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Zap } from 'lucide-react'

const statusVariant = (status: string) => {
  if (status === 'done') return 'default' as const
  if (status === 'rendering') return 'secondary' as const
  if (status === 'failed') return 'destructive' as const
  if (status === 'stale') return 'outline' as const
  return 'outline' as const  // pending
}

export default function RenderPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const { data: book } = useQuery({
    queryKey: ['book', slug],
    queryFn: () => api.getBook(slug!),
    enabled: !!slug,
  })

  const { data: render, isLoading, error } = useQuery({
    queryKey: ['render', slug],
    queryFn: () => api.getRender(slug!),
    enabled: !!slug,
    retry: false,
  })

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Yükleniyor…</div>
  }

  if (error || !render) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm">
          Bu kitap henüz seslendirilmedi. Önce review sayfasında
          "Kitabı Seslendir" butonuna basın.
        </p>
        <Button variant="outline" size="sm"
          onClick={() => navigate(`/review/${slug}`)}>
          <ArrowLeft size={13} className="mr-1" />
          Review'a Dön
        </Button>
      </div>
    )
  }

  // Group chunks by section_id, preserving book order.
  const grouped = new Map<string, RenderChunk[]>()
  for (const c of render.chunks) {
    if (!grouped.has(c.section_id)) grouped.set(c.section_id, [])
    grouped.get(c.section_id)!.push(c)
  }

  const sectionTitle = (id: string) =>
    book?.sections.find(s => s.id === id)?.title ?? id

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b flex items-center justify-between
                      shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon"
            onClick={() => navigate(`/review/${slug}`)}
            title="Review'a Dön">
            <ArrowLeft size={15} />
          </Button>
          <span className="text-sm font-medium">{book?.book ?? slug}</span>
          <Badge variant="outline" className="text-xs">
            {render.chunks.length} chunk
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {render.render_status}
          </Badge>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {Array.from(grouped.entries()).map(([sectionId, chunks]) => (
          <div key={sectionId} className="space-y-2">
            <div className="flex items-center gap-2 sticky top-0
                            bg-background py-1 z-10">
              <h2 className="text-sm font-medium">
                {sectionTitle(sectionId)}
              </h2>
              <Badge variant="outline" className="text-xs">
                {chunks.length}
              </Badge>
            </div>
            <div className="grid gap-2">
              {chunks.map(c => (
                <div key={c.id}
                  className="border rounded-md p-3 bg-card text-sm
                             space-y-2">
                  <p className="whitespace-pre-wrap break-words">{c.text}</p>
                  <div className="flex items-center gap-2 text-xs
                                  text-muted-foreground flex-wrap">
                    <span>{c.char_count}/280</span>
                    <span>·</span>
                    <span>
                      p.{c.page_start}
                      {c.page_end !== c.page_start && `–${c.page_end}`}
                    </span>
                    {c.is_long && (
                      <Badge variant="outline"
                        className="text-amber-700 dark:text-amber-400
                                   border-amber-500/50 text-[10px]
                                   px-1 py-0">
                        <Zap size={9} className="mr-0.5" />
                        long
                      </Badge>
                    )}
                    <span className="ml-auto">
                      <Badge variant={statusVariant(c.status)}
                        className="text-[10px] px-1.5 py-0">
                        {c.status}
                      </Badge>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
