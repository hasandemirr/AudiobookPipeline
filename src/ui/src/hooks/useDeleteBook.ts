import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError } from '../lib/api'

export function useDeleteBook() {
  const queryClient = useQueryClient()

  const deleteBook = useMutation({
    mutationFn: (slug: string) => api.deleteBook(slug),
    onSuccess: (_, slug) => {
      toast.success(`"${slug}" deleted.`)
      queryClient.invalidateQueries({ queryKey: ['books'] })
    },
    onError: (err, slug) => {
      const message = err instanceof ApiError
        ? err.message
        : `Failed to delete "${slug}".`
      toast.error(message)
    },
  })

  const deleteOutput = useMutation({
    mutationFn: (slug: string) => api.deleteOutput(slug),
    onSuccess: (data) => {
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: ['books'] })
    },
    onError: (err, slug) => {
      const message = err instanceof ApiError
        ? err.message
        : `Failed to delete output for "${slug}".`
      toast.error(message)
    },
  })

  return { deleteBook, deleteOutput }
}
