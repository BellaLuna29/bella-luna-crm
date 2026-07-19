import type { ReactNode } from 'react'

interface AlertRowProps {
  colorClass: string
  subtitleClassName: string
  title: ReactNode
  subtitle: ReactNode
  onClick?: () => void
  onDismiss: () => void
}

function AlertRow({ colorClass, subtitleClassName, title, subtitle, onClick, onDismiss }: AlertRowProps) {
  const content = (
    <>
      <span className="text-sm font-semibold truncate">{title}</span>
      <span className={`text-xs font-semibold shrink-0 ${subtitleClassName}`}>{subtitle}</span>
    </>
  )

  return (
    <div className={`w-full rounded-lg p-3 flex items-center gap-2 ${colorClass}`}>
      {onClick ? (
        <button onClick={onClick} className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left">
          {content}
        </button>
      ) : (
        <div className="flex-1 min-w-0 flex items-center justify-between gap-3">{content}</div>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDismiss()
        }}
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-white/60 hover:bg-white text-sage-dark text-xs"
        title="Marquer comme lu"
        aria-label="Marquer comme lu"
      >
        ✓
      </button>
    </div>
  )
}

export default AlertRow
