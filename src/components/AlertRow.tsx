import type { ReactNode } from 'react'
import Icon, { type IconName } from './Icon'

interface AlertRowProps {
  colorClass: string
  subtitleClassName: string
  icon: IconName
  iconClass: string
  title: ReactNode
  subtitle: ReactNode
  onClick?: () => void
  onDismiss: () => void
}

function AlertRow({ colorClass, subtitleClassName, icon, iconClass, title, subtitle, onClick, onDismiss }: AlertRowProps) {
  const content = (
    <>
      <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconClass}`}>
        <Icon name={icon} size={15} />
      </span>
      <span className="flex-1 min-w-0 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold truncate">{title}</span>
        <span className={`text-xs font-semibold shrink-0 ${subtitleClassName}`}>{subtitle}</span>
      </span>
    </>
  )

  return (
    <div className={`w-full rounded-lg p-3 flex items-center gap-2.5 ${colorClass}`}>
      {onClick ? (
        <button onClick={onClick} className="flex-1 min-w-0 flex items-center gap-2.5 text-left">
          {content}
        </button>
      ) : (
        <div className="flex-1 min-w-0 flex items-center gap-2.5">{content}</div>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDismiss()
        }}
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-white/60 hover:bg-white text-sage-dark"
        title="Marquer comme lu"
        aria-label="Marquer comme lu"
      >
        <Icon name="check" size={13} strokeWidth={2.5} />
      </button>
    </div>
  )
}

export default AlertRow
