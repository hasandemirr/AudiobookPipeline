import { useCallback, useRef } from 'react'
import * as signalR from '@microsoft/signalr'

export interface ExtractProgress {
  slug: string
  message: string
  percent: number
  done?: boolean
  error?: boolean
}

interface UseExtractProgressOptions {
  onProgress: (data: ExtractProgress) => void
  onDone: () => void
  onError: () => void
}

export function useExtractProgress({
  onProgress,
  onDone,
  onError,
}: UseExtractProgressOptions) {
  const connectionRef = useRef<signalR.HubConnection | null>(null)

  const connect = useCallback(async () => {
    // Existing connection cleanup before creating a new one
    if (connectionRef.current) {
      await connectionRef.current.stop()
      connectionRef.current = null
    }

    const connection = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/progress')
      .withAutomaticReconnect()
      .build()

    connection.on('ExtractProgress', (data: ExtractProgress) => {
      onProgress(data)
      if (data.done) {
        disconnect()
        onDone()
      }
      if (data.error) {
        disconnect()
        onError()
      }
    })

    try {
      await connection.start()
      connectionRef.current = connection
    } catch {
      onError()
    }
  }, [onProgress, onDone, onError])

  const disconnect = useCallback(async () => {
    if (connectionRef.current) {
      await connectionRef.current.stop()
      connectionRef.current = null
    }
  }, [])

  return { connect, disconnect }
}
