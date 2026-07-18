import { UserButton } from '@clerk/react'
import type { View } from '../types'

const NAV_ITEMS: { view: View; label: string }[] = [
  { view: 'dashboard', label: 'Tableau de bord' },
  { view: 'stats', label: 'Statistiques' },
  { view: 'clients', label: 'Clientes' },
  { view: 'agenda', label: 'Rendez-vous' },
  { view: 'billing', label: 'Facturation' },
  { view: 'compta', label: 'Compta' },
  { view: 'newsletter', label: 'Newsletter' },
]

interface SidebarProps {
  activeView: View
  onNavigate: (view: View) => void
}

function Sidebar({ activeView, onNavigate }: SidebarProps) {
  return (
    <nav className="w-60 bg-sage-dark text-white flex flex-col p-7 px-4.5 shrink-0">
      <div className="flex items-center gap-2.5 mb-9 px-2">
        <div className="w-9 h-9 rounded-full bg-gold flex items-center justify-center font-serif font-semibold text-sage-dark text-base shrink-0">
          B
        </div>
        <div>
          <div className="font-serif text-lg font-semibold tracking-wide">Bella Luna</div>
          <div className="text-[10px] text-white/60 tracking-widest -mt-0.5">ESPACE GESTION</div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.view}
            onClick={() => onNavigate(item.view)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium text-left transition-colors ${
              activeView === item.view
                ? 'bg-white/15 text-white'
                : 'text-white/85 hover:bg-white/10'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-auto flex items-center gap-3 px-3 py-3 bg-white/5 rounded-[10px]">
        <UserButton />
        <span className="text-xs text-white/70">Connecté</span>
      </div>
    </nav>
  )
}

export default Sidebar
