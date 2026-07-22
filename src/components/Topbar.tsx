import Icon from './Icon'

interface TopbarProps {
  title: string
  subtitle: string
  onOpenMobileMenu: () => void
}

function Topbar({ title, subtitle, onOpenMobileMenu }: TopbarProps) {
  return (
    <header className="h-16 md:h-18 bg-white border-b border-border flex items-center gap-3 px-4 md:px-8 shrink-0">
      <button
        onClick={onOpenMobileMenu}
        className="md:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-[10px] border border-border text-sage-dark"
        aria-label="Ouvrir le menu"
      >
        <Icon name="menu" size={18} />
      </button>
      <div className="min-w-0">
        <h2 className="text-lg md:text-xl font-semibold truncate">{title}</h2>
        <div className="text-xs md:text-sm text-text-muted mt-0.5 truncate">{subtitle}</div>
      </div>
    </header>
  )
}

export default Topbar
