const BASE = '/api'

export interface BookSummary {
  slug: string
  title: string
  section_count: number
  approved_count: number
  chunk_count: number
  has_manifest: boolean
}

export interface Section {
  id: string
  title: string
  status: string
  narrate: boolean
  page_start: number
  page_end: number
  content: string
  isReviewed: boolean
}

export interface BookManifest {
  book: string
  created_at: string
  sections: Section[]
  chunks: { id: string; status: string }[]
}

export const api = {
  getBooks: (): Promise<BookSummary[]> =>
    fetch(`${BASE}/books`).then(r => r.json()),

  getBook: (slug: string): Promise<BookManifest> =>
    fetch(`${BASE}/books/${slug}`).then(r => r.json()),

  getSection: (slug: string, id: string): Promise<Section> =>
    fetch(`${BASE}/books/${slug}/sections/${id}`)
      .then(r => r.json()),

  updateSection: (slug: string, id: string, content: string) =>
    fetch(`${BASE}/books/${slug}/sections/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }).then(r => r.json()),

  approveSection: (slug: string, id: string) =>
    fetch(`${BASE}/books/${slug}/sections/${id}/approve`, {
      method: 'POST',
    }).then(r => r.json()),

  toggleNarrate: (slug: string, id: string) =>
    fetch(`${BASE}/books/${slug}/sections/${id}/narrate`, {
      method: 'PATCH',
    }).then(r => r.json()),

  extractPdf: (slug: string, file: File) => {
    const form = new FormData()
    form.append('slug', slug)
    form.append('pdf', file)
    return fetch(`${BASE}/books/extract`, {
      method: 'POST',
      body: form,
    }).then(r => r.json())
  },

  health: () =>
    fetch(`${BASE}/health`).then(r => r.json()),
}
