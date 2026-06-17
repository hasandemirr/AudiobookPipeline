const BASE = '/api'

export class ApiError extends Error {
  status: number
  constructor(
    status: number,
    message: string
  ) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

async function request<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, init)
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = await res.json()
      message = body.message ?? message
    } catch {
      // Response body is not JSON — use status text
    }
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<T>
}

export interface BookSummary {
  slug: string
  title: string
  section_count: number
  approved_count: number
  chunk_count: number
  has_manifest: boolean
}

export interface DetectedPattern {
  text: string
  position: 'first' | 'last' | 'any'
  page_count: number
  total_pages: number
  confidence: 'high' | 'medium' | 'low'
  is_page_number: boolean
  is_checked_by_default: boolean
}

export interface Section {
  id: string
  title: string
  status: string
  narrate: boolean
  page_start: number
  page_end: number
  content: string
  pages: { page_number: number; text: string }[]
  raw_pages: { page_number: number; text: string }[]
  is_reviewed: boolean
  repeated_lines: string[]
  detected_patterns: DetectedPattern[]
}

export interface RenderChunk {
  id: string
  section_id: string
  order: number
  text: string
  char_count: number
  page_start: number
  page_end: number
  status: string  // pending | rendering | done | failed | stale
  audio_path?: string | null
  audio_duration_sec?: number | null
  subtitle_start_ms?: number | null
  subtitle_end_ms?: number | null
  is_long: boolean
  retries: number
}

export interface RenderManifest {
  book: string
  created_at: string
  updated_at: string
  render_status: string  // idle | chunking | rendering | done | failed
  chunks: RenderChunk[]
  output: {
    merged_path?: string | null
    format?: string | null
    srt_path?: string | null
  }
}

export interface AudiobookSummary {
  slug: string
  title: string
  source_type: string  // pdf | txt
  render_status: string
  chunk_count: number
  created_at: string
}

export interface AudiobookChunk {
  id: string
  section_id: string
  section_title: string
  order: number
  text: string
  char_count: number
  page_start?: number | null
  page_end?: number | null
  status: string
  audio_path?: string | null
  audio_duration_sec?: number | null
  is_long: boolean
  retries: number
}

export interface AudiobookManifest {
  slug: string
  title: string
  source_type: string
  source_ref: string
  created_at: string
  updated_at: string
  render_status: string
  output: {
    merged_path?: string | null
    format?: string | null
    srt_path?: string | null
  }
}

export interface AudiobookDetail {
  manifest: AudiobookManifest
  chunks: AudiobookChunk[]
}

export interface BookManifest {
  book: string
  created_at: string
  sections: Section[]
  chunks: { id: string; status: string }[]
}

export interface SectionUpdateResult {
  id: string
  status: string
  reviewed_path: string
}

export interface ApproveResult {
  id: string
  status: string
}

export interface NarrateResult {
  id: string
  narrate: boolean
}

export interface ExtractResult {
  message: string
  slug: string
}

export const api = {
  getBooks: () =>
    request<BookSummary[]>(`${BASE}/books`),

  getBook: (slug: string) =>
    request<BookManifest>(`${BASE}/books/${slug}`),

  getSection: (slug: string, id: string) =>
    request<Section>(`${BASE}/books/${slug}/sections/${id}`),

  updateSection: (slug: string, id: string, pages: { pageNumber: number; text: string }[]) =>
    request<SectionUpdateResult>(
      `${BASE}/books/${slug}/sections/${id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: pages.map(p => ({ page_number: p.pageNumber, text: p.text })) }),
      }
    ),

  bulkSave: (
    slug: string,
    sections: { id: string; pages: { pageNumber: number; text: string }[] }[]
  ) =>
    request<{ saved: string[] }>(
      `${BASE}/books/${slug}/sections/bulk-save`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections: sections.map(s => ({
            id: s.id,
            pages: s.pages.map(p => ({ page_number: p.pageNumber, text: p.text })),
          })),
        }),
      }
    ),

  approveSection: (slug: string, id: string) =>
    request<ApproveResult>(
      `${BASE}/books/${slug}/sections/${id}/approve`,
      { method: 'POST' }
    ),

  toggleNarrate: (slug: string, id: string) =>
    request<NarrateResult>(
      `${BASE}/books/${slug}/sections/${id}/narrate`,
      { method: 'PATCH' }
    ),

  extractPdf: (slug: string, file: File, force = false) => {
    const form = new FormData()
    form.append('slug', slug)
    form.append('pdf', file)
    if (force) form.append('force', 'true')
    return request<ExtractResult>(`${BASE}/books/extract`, {
      method: 'POST',
      body: form,
    })
  },

  getBookStatus: (slug: string) =>
    request<{
      exists: boolean
      is_locked: boolean
      locked_by: string
      total_sections: number
      approved_count: number
    }>(`${BASE}/books/${slug}/status`),

  getExportStatus: (slug: string) =>
    request<{
      total_narrated: number
      approved_count: number
      ready_to_export: boolean
      all_approved: boolean
    }>(`${BASE}/books/${slug}/export/status`),

  health: () =>
    request<{ status: string; repo_root: string; timestamp: string }>(
      `${BASE}/health`
    ),

  deleteBook: (slug: string) =>
    request<{ message: string; slug: string }>(
      `${BASE}/books/${slug}`,
      { method: 'DELETE' }
    ),

  deleteOutput: (slug: string) =>
    request<{ message: string; deleted: string[] }>(
      `${BASE}/books/${slug}/output`,
      { method: 'DELETE' }
    ),

  chunkBook: (slug: string) =>
    request<{ existing: boolean; chunk_count: number }>(
      `${BASE}/books/${slug}/chunk`,
      { method: 'POST' }
    ),

  getRender: (slug: string) =>
    request<RenderManifest>(`${BASE}/books/${slug}/render`),

  resetSection: (slug: string, id: string) =>
    request<{ id: string; status: string }>(
      `${BASE}/books/${slug}/sections/${id}/reviewed`,
      { method: 'DELETE' }
    ),

  resetAll: (slug: string) =>
    request<{ reset: string[] }>(
      `${BASE}/books/${slug}/sections/reviewed-all`,
      { method: 'DELETE' }
    ),

  getAudiobooks: () =>
    request<AudiobookSummary[]>(`${BASE}/audiobooks`),

  getAudiobook: (slug: string) =>
    request<AudiobookDetail>(`${BASE}/audiobooks/${slug}`),

  startRender: (slug: string) =>
    request<{ message: string; slug: string }>(
      `${BASE}/audiobooks/${slug}/render`,
      { method: 'POST' }
    ),

  updateAudiobookChunk: (slug: string, id: string, text: string) =>
    request<{ id: string; char_count: number; status: string }>(
      `${BASE}/audiobooks/${slug}/chunks/${id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }
    ),

  splitAudiobookChunk: (slug: string, id: string, text: string, position: number) =>
    request<{ message: string; new_chunk_id: string; order: number }>(
      `${BASE}/audiobooks/${slug}/chunks/${id}/split`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, position }),
      }
    ),

  mergeNextChunk: (slug: string, id: string) =>
    request<{ message: string; id: string }>(
      `${BASE}/audiobooks/${slug}/chunks/${id}/merge-next`,
      { method: 'POST' }
    ),

  addChunkAfter: (slug: string, id: string) =>
    request<{ message: string; new_chunk_id: string }>(
      `${BASE}/audiobooks/${slug}/chunks/${id}/add-after`,
      { method: 'POST' }
    ),

  deleteAudiobookChunk: (slug: string, id: string) =>
    request<{ message: string; id: string }>(
      `${BASE}/audiobooks/${slug}/chunks/${id}`,
      { method: 'DELETE' }
    ),

  deleteAudiobook: (slug: string) =>
    request<{ message: string; slug: string }>(
      `${BASE}/audiobooks/${slug}`,
      { method: 'DELETE' }
    ),

  createAudiobookFromBook: (bookSlug: string, title?: string) =>
    request<{ slug: string; title: string; chunk_count: number }>(
      `${BASE}/audiobooks/from-book`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book_slug: bookSlug, title }),
      }
    ),

  createAudiobookFromText: (file: File, title?: string) => {
    const form = new FormData()
    form.append('txt', file)
    if (title) form.append('title', title)
    return request<{ slug: string; title: string; chunk_count: number }>(
      `${BASE}/audiobooks/from-text`,
      { method: 'POST', body: form }
    )
  },
}
