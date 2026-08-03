import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

interface Toast {
  id: number
  message: string
  tone: 'success' | 'error'
}

interface ToastContextValue {
  showToast: (message: string, tone?: 'success' | 'error') => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 1

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, message, tone }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 inset-x-0 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4 print:hidden">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto max-w-md w-full sm:w-auto px-4 py-3 rounded-[10px] shadow-lg text-sm font-semibold text-white ${
              toast.tone === 'success' ? 'bg-sage-dark' : 'bg-danger'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast doit être utilisé à l\'intérieur de ToastProvider.')
  return ctx
}

export default ToastProvider
