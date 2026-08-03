import type { ReactNode } from 'react'

interface ModalProps {
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

const MAX_WIDTH: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
}

/**
 * Shared backdrop + centered white panel used by every modal in the app.
 * Purely a layout wrapper — each caller still renders its own title/content,
 * so behavior (no backdrop-click-to-close, focus, etc.) is unchanged from
 * before this was extracted.
 */
function Modal({ size = 'lg', children }: ModalProps) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className={`bg-white rounded-2xl w-full ${MAX_WIDTH[size]} max-h-[90vh] overflow-y-auto p-6`}>
        {children}
      </div>
    </div>
  )
}

export default Modal
