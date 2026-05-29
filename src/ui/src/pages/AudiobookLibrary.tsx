import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { api, type AudiobookSummary, type BookSummary } from '../lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Headphones, BookText, Upload, FileText } from 'lucide-react'
import { toast } from 'sonner'

export default function AudiobookLibrary() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<'book' | 'text'>('book')
  const [selectedBook, setSelectedBook] = useState('')
  const [title, setTitle] = useState('')

  const { data: audiobooks = [], isLoading } = useQuery({
    queryKey: ['audiobooks'],
    queryFn: api.getAudiobooks,
  })

  const { data: books = [] } = useQuery({
    queryKey: ['books'],
    queryFn: api.getBooks,
  })

  // Only approved-ish books are reasonable sources; list all, user picks.
  const fromBook = useMutation({
    mutationFn: () => api.createAudiobookFromBook(selectedBook, title || undefined),
    onSuccess: (res) => {
      toast.success(`"${res.title}" oluşturuldu (${res.chunk_count} chunk).`)
      queryClient.invalidateQueries({ queryKey: ['audiobooks'] })
      navigate(`/audiobooks/${res.slug}`)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Oluşturulamadı.')
    },
  })

  const fromText = useMutation({
    mutationFn: (file: File) =>
      api.createAudiobookFromText(file, title || undefined),
    onSuccess: (res) => {
      toast.success(`"${res.title}" oluşturuldu (${res.chunk_count} chunk).`)
      queryClient.invalidateQueries({ queryKey: ['audiobooks'] })
      navigate(`/audiobooks/${res.slug}`)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Oluşturulamadı.')
    },
  })

  const handleFile = (file: File | undefined) => {
    if (!file) return
    fromText.mutate(file)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Headphones size={22} />
        <h1 className="text-xl font-semibold">Audiobooks</h1>
      </div>

      {/* Yeni Audiobook */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Yeni Audiobook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button size="sm"
              variant={mode === 'book' ? 'default' : 'outline'}
              onClick={() => setMode('book')}>
              <BookText size={14} className="mr-1" />
              Kitaptan
            </Button>
            <Button size="sm"
              variant={mode === 'text' ? 'default' : 'outline'}
              onClick={() => setMode('text')}>
              <FileText size={14} className="mr-1" />
              Txt yükle
            </Button>
          </div>

          <input
            type="text"
            placeholder="Başlık (opsiyonel — boşsa otomatik)"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          />

          {mode === 'book' ? (
            <div className="space-y-3">
              <select
                value={selectedBook}
                onChange={e => setSelectedBook(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm
                           bg-background">
                <option value="">Kitap seçin…</option>
                {books.map((b: BookSummary) => (
                  <option key={b.slug} value={b.slug}>
                    {b.title} ({b.section_count} bölüm)
                  </option>
                ))}
              </select>
              <Button size="sm"
                disabled={!selectedBook || fromBook.isPending}
                onClick={() => fromBook.mutate()}>
                <Headphones size={14} className="mr-1" />
                {fromBook.isPending ? 'Oluşturuluyor…' : 'Oluştur'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <input ref={fileRef} type="file" accept=".txt"
                className="hidden"
                onChange={e => handleFile(e.target.files?.[0])} />
              <Button size="sm" variant="outline"
                disabled={fromText.isPending}
                onClick={() => fileRef.current?.click()}>
                <Upload size={14} className="mr-1" />
                {fromText.isPending ? 'Yükleniyor…' : '.txt dosyası seç'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Liste */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Yükleniyor…</p>
      ) : audiobooks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Henüz audiobook yok. Yukarıdan bir kitaptan veya txt'den oluşturun.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {audiobooks.map((a: AudiobookSummary) => (
            <Card key={a.slug}
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => navigate(`/audiobooks/${a.slug}`)}>
              <CardContent className="p-4 space-y-2">
                <div className="font-medium text-sm">{a.title}</div>
                <div className="flex items-center gap-2 flex-wrap text-xs
                                text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">
                    {a.source_type}
                  </Badge>
                  <span>{a.chunk_count} chunk</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {a.render_status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
