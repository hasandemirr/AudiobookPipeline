import { useCallback, useRef } from 'react'
import * as signalR from '@microsoft/signalr'

export interface RenderProgress {
  slug: string
  chunkId?: string | null
  index: number
  total: number
  status: string
  done?: boolean
  error?: boolean
}

interface UseRenderProgressOptions {
  onProgress: (data: RenderProgress) => void
  onDone: () => void
  onError: () => void
}

export function useRenderProgress({ onProgress, onDone, onError }: UseRenderProgressOptions) {
  const connectionRef = useRef<signalR.HubConnection | null>(null)

  const disconnect = useCallback(async () => {
    if (connectionRef.current) {
      await connectionRef.current.stop()
      connectionRef.current = null
    }
  }, [])

  const connect = useCallback(async () => {
    if (connectionRef.current) {
      await connectionRef.current.stop()
      connectionRef.current = null
    }
    const connection = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/progress')
      .withAutomaticReconnect()
      .build()

    connection.on('RenderProgress', (data: RenderProgress) => {
      onProgress(data)
      if (data.done) {
        disconnect()
        if (data.error) onError()
        else onDone()
      }
    })

    try {
      await connection.start()
      connectionRef.current = connection
    } catch {
      onError()
    }
  }, [onProgress, onDone, onError, disconnect])

  return { connect, disconnect }
}
