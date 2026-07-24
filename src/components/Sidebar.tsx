import { UserButton } from '@clerk/react'
import logo from '../assets/logo.png'
import type { View } from '../types'
import Icon, { type IconName } from './Icon'

const NAV_ITEMS: { view: View; label: string; icon: IconName; chipClass: string }[] = [
  { view: 'dashboard', label: 'Tableau de bord', icon: 'home', chipClass: 'bg-avatar-indigo/25 text-avatar-indigo' },
  { view: 'agenda', label: 'Rendez-vous', icon: 'calendar', chipClass: 'bg-avatar-teal/25 text-avatar-teal' },
  { view: 'clients', label: 'Clientes', icon: 'users', chipClass: 'bg-avatar-mauve/25 text-avatar-mauve' },
  { view: 'billing', label: 'Facturation', icon: 'receipt', chipClass: 'bg-gold/25 text-gold' },
  { view: 'prestations', label: 'Prestations', icon: 'clipboard-list', chipClass: 'bg-avatar-forest/25 text-avatar-forest' },
  { view: 'compta', label: 'Comptabilité', icon: 'calculator', chipClass: 'bg-white/20 text-white' },
  { view: 'stats', label: 'Statistiques', icon: 'trending-up', chipClass: 'bg-avatar-indigo/25 text-avatar-indigo' },
  { view: 'communication', label: 'Communication', icon: 'message-circle', chipClass: 'bg-avatar-teal/25 text-avatar-teal' },
  { view: 'parametres', label: 'Paramètres', icon: 'settings', chipClass: 'bg-white/20 text-white' },
]

interface SidebarProps {
  activeView: View
  onNavigate: (view: View) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}

function Sidebar({ activeView, onNavigate, collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const collapsedDesktop = collapsed ? 'md:justify-center md:px-0' : ''
  const hideOnCollapse = collapsed ? 'md:hidden' : ''

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={onCloseMobile} aria-hidden="true" />
      )}
      <nav
        className={`bg-sage-dark text-white flex flex-col p-7 px-4.5 shrink-0 fixed inset-y-0 left-0 z-40 transition-transform duration-200 w-60 md:static md:h-full md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'md:w-[72px] md:px-3' : ''}`}
      >
        <div className={`flex items-center gap-2.5 mb-9 px-2 ${collapsedDesktop}`}>
          <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0 p-1">
            <img src={logo} alt="Bella Luna" className="w-full h-full object-contain" />
          </div>
          <div className={hideOnCollapse}>
            <div className="font-serif text-lg font-semibold tracking-wide">Bella Luna</div>
            <div className="text-[10px] text-white/60 tracking-widest -mt-0.5">ESPACE GESTION</div>
          </div>
        </div>

        <div className="flex flex-col gap-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.view}
              onClick={() => {
                onNavigate(item.view)
                onCloseMobile()
              }}
              title={item.label}
              className={`flex items-center gap-3 px-2.5 py-2.5 rounded-[10px] text-sm font-medium text-left transition-colors ${collapsedDesktop} ${
                activeView === item.view ? 'bg-white/15 text-white' : 'text-white/85 hover:bg-white/10'
              }`}
            >
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${item.chipClass}`}>
                <Icon name={item.icon} size={16} strokeWidth={2.25} />
              </span>
              <span className={hideOnCollapse}>{item.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={onToggleCollapsed}
          className="hidden md:flex items-center justify-center gap-2 mt-4 px-3 py-2 rounded-[10px] text-xs font-semibold text-white/70 hover:bg-white/10"
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={14} />
          <span className={hideOnCollapse}>Réduire le menu</span>
        </button>

        <div className={`mt-auto flex items-center gap-3 px-3 py-3 bg-white/5 rounded-[10px] ${collapsedDesktop}`}>
          <UserButton />
          <span className={`text-xs text-white/70 ${hideOnCollapse}`}>Connecté</span>
        </div>
      </nav>
    </>
  )
}

export default Sidebar
