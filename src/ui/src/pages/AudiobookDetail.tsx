import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default function AudiobookDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  return (
    <div className="p-6 space-y-3">
      <Button variant="outline" size="sm"
        onClick={() => navigate('/audiobooks')}>
        <ArrowLeft size={13} className="mr-1" />
        Audiobooks
      </Button>
      <p className="text-sm text-muted-foreground">
        Audiobook: <span className="font-mono">{slug}</span>
        {' '}— chunk görünümü 3.5.4'te eklenecek.
      </p>
    </div>
  )
}
