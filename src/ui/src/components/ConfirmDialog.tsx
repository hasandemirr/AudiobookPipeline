import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'destructive' | 'default'
  onConfirm: () => void
  children: (open: () => void) => React.ReactNode
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'destructive',
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleConfirm = () => {
    setIsOpen(false)
    onConfirm()
  }

  return (
    <>
      {children(() => setIsOpen(true))}

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center
                     justify-center bg-black/40"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-background border rounded-xl
                       shadow-lg p-6 w-full max-w-sm mx-4
                       space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h2 className="text-sm font-medium">{title}</h2>
              <p className="text-xs text-muted-foreground">
                {description}
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(false)}
              >
                {cancelLabel}
              </Button>
              <Button
                variant={variant}
                size="sm"
                onClick={handleConfirm}
              >
                {confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
