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
  is_reviewed: boolean
  repeated_lines: string[]
  detected_patterns: DetectedPattern[]
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

  updateSection: (slug: string, id: string, content: string) =>
    request<SectionUpdateResult>(
      `${BASE}/books/${slug}/sections/${id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
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

  resetSection: (slug: string, id: string) =>
    request<{ id: string; status: string }>(
      `${BASE}/books/${slug}/sections/${id}/reviewed`,
      { method: 'DELETE' }
    ),
}
