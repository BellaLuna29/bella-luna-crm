import Icon from './Icon'
import GlobalClientSearch from './GlobalClientSearch'

interface TopbarProps {
  title: string
  subtitle: string
  onOpenMobileMenu: () => void
  onSelectClient: (id: string) => void
}

function Topbar({ title, subtitle, onOpenMobileMenu, onSelectClient }: TopbarProps) {
  return (
    <header className="h-18 md:h-20 bg-white border-b border-border flex items-center gap-3.5 px-4 md:px-8 shrink-0 relative">
      <button
        onClick={onOpenMobileMenu}
        className="md:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-[10px] border border-border text-sage-dark"
        aria-label="Ouvrir le menu"
      >
        <Icon name="menu" size={18} />
      </button>
      <span className="hidden md:block w-1 h-8 rounded-full bg-gold shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <h2 className="font-serif text-xl md:text-[1.7rem] font-semibold text-text-dark tracking-tight truncate">
          {title}
        </h2>
        <div className="text-xs md:text-sm text-text-muted mt-0.5 truncate">{subtitle}</div>
      </div>
      <div className="hidden sm:block w-56 md:w-72 shrink-0 ml-auto">
        <GlobalClientSearch onSelectClient={onSelectClient} />
      </div>
      <span
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-gold/60 via-border to-transparent"
        aria-hidden="true"
      />
    </header>
  )
}

export default Topbar
