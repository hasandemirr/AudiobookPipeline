import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { BookSummary } from '../lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { BookOpen, Upload, CheckCircle, Clock, Trash2, FileX } from 'lucide-react'
import { useDeleteBook } from '../hooks/useDeleteBook'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useExtractProgress, type ExtractProgress } from '../hooks/useExtractProgress'

export default function Dashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const { deleteBook, deleteOutput } = useDeleteBook()

  const [slug, setSlug] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState<ExtractProgress | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const { data: books = [], isLoading } = useQuery({
    queryKey: ['books'],
    queryFn: api.getBooks,
    refetchInterval: extracting ? 2000 : false,
  })

  const { connect, disconnect } = useExtractProgress({
    onProgress: (data) => {
      setProgress(data)
    },
    onDone: () => {
      setExtracting(false)
      queryClient.invalidateQueries({ queryKey: ['books'] })
    },
    onError: () => {
      setExtracting(false)
      setProgress(null)
    },
  })

  const startExtract = async (file: File) => {
    if (!slug.trim()) {
      toast.error('Please enter a book slug first.')
      return
    }

    await connect()
    setExtracting(true)
    setProgress({ 
      slug, 
      message: 'Starting...', 
      percent: 0 
    })

    try {
      await api.extractPdf(slug, file)
    } catch (err: any) {
      await disconnect()
      setExtracting(false)
      setProgress(null)
      const message = err?.message || 'Failed to start extract.'
      toast.error(message)
    }
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) startExtract(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.type === 'application/pdf') startExtract(file)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Kitaplar</h1>

      {/* Yeni kitap ekle */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Yeni Kitap Ekle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="kitap-slug (örn: iliada)"
              value={slug}
              onChange={e => setSlug(
                e.target.value.toLowerCase().replace(/\s+/g, '-')
              )}
              className="flex-1 px-3 py-2 text-sm border rounded-md 
                         bg-background focus:outline-none focus:ring-2 
                         focus:ring-ring"
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={extracting || !slug.trim()}
            >
              <Upload size={16} className="mr-2" />
              PDF Seç
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={onFileChange}
            />
          </div>

          {/* Drag & Drop alanı */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center 
                       text-sm text-muted-foreground transition-colors
                       ${dragOver
                         ? 'border-primary bg-primary/5'
                         : 'border-muted-foreground/25'
                       }`}
          >
            PDF dosyasını buraya sürükleyin
          </div>

          {/* Progress */}
          {progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {progress.message}
                </span>
                <span className="font-medium">
                  {progress.percent}%
                </span>
              </div>
              <Progress value={progress.percent} />
              {progress.error && (
                <p className="text-sm text-destructive">
                  Hata oluştu. Lütfen tekrar deneyin.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="mb-6" />

      {/* Kitap listesi */}
      {isLoading ? (
        <p className="text-muted-foreground">Yükleniyor...</p>
      ) : books.length === 0 ? (
        <p className="text-muted-foreground">
          Henüz kitap yok. PDF yükleyerek başlayın.
        </p>
      ) : (
        <div className="grid gap-4">
          {books.map((book: BookSummary) => (
            <Card
              key={book.slug}
              className="transition-colors hover:bg-muted/20"
            >
              <CardContent className="flex items-center
                                      justify-between py-4">
                {/* Mevcut sol kısım — değişmez */}
                <div
                  className="flex items-center gap-3 flex-1 cursor-pointer"
                  onClick={() => navigate(`/review/${book.slug}`)}
                >
                  <BookOpen size={20}
                    className="text-muted-foreground" />
                  <div>
                    <p className="font-medium">{book.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {book.section_count} sections
                    </p>
                  </div>
                </div>

                {/* Sağ kısım — status + silme butonları */}
                <div className="flex items-center gap-3">
                  <div className="text-sm text-right">
                    <div className="flex items-center gap-1
                                    text-muted-foreground">
                      <CheckCircle size={14} />
                      <span>
                        {book.approved_count}/{book.section_count} approved
                      </span>
                    </div>
                    {book.chunk_count > 0 && (
                      <div className="flex items-center gap-1
                                      text-muted-foreground">
                        <Clock size={14} />
                        <span>{book.chunk_count} chunks</span>
                      </div>
                    )}
                  </div>

                  <Badge variant={
                    book.approved_count === book.section_count
                      && book.section_count > 0
                        ? 'default' : 'outline'
                  }>
                    {book.approved_count === book.section_count
                     && book.section_count > 0
                      ? 'Ready' : 'In progress'}
                  </Badge>

                  {/* Output sil */}
                  <ConfirmDialog
                    title="Delete output files?"
                    description={
                      `This will delete the exported files for "${book.slug}".` +
                      ' Workspace data will be kept.'
                    }
                    confirmLabel="Delete output"
                    onConfirm={() =>
                      deleteOutput.mutate(book.slug)}
                  >
                    {open => (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={e => { e.stopPropagation(); open() }}
                        title="Delete output files"
                        className="text-muted-foreground
                                   hover:text-foreground shrink-0"
                      >
                        <FileX size={15} />
                      </Button>
                    )}
                  </ConfirmDialog>

                  {/* Kitabı sil */}
                  <ConfirmDialog
                    title={`Delete "${book.slug}"?`}
                    description={
                      'This will permanently delete the workspace, ' +
                      'all sections, and audio files. ' +
                      'This cannot be undone.'
                    }
                    confirmLabel="Delete permanently"
                    onConfirm={() =>
                      deleteBook.mutate(book.slug)}
                  >
                    {open => (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={e => { e.stopPropagation(); open() }}
                        title="Delete book"
                        className="text-muted-foreground
                                   hover:text-destructive shrink-0"
                      >
                        <Trash2 size={15} />
                      </Button>
                    )}
                  </ConfirmDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
