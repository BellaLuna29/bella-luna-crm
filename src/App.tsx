import { useState } from 'react'
import { Show, SignIn } from '@clerk/react'
import logo from './assets/logo.png'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import ClientsListView from './views/ClientsListView'
import ClientDetailView from './views/ClientDetailView'
import AgendaView from './views/AgendaView'
import DashboardView from './views/DashboardView'
import AlertesView from './views/AlertesView'
import StatsView from './views/StatsView'
import FacturationView from './views/FacturationView'
import ComptaView from './views/ComptaView'
import CommunicationView from './views/CommunicationView'
import FormulairesView from './views/FormulairesView'
import ParametresView from './views/ParametresView'
import type { View } from './types'

const TITLES: Record<View, [string, string]> = {
  dashboard: ['Tableau de bord', "Vue d'ensemble de votre activité"],
  alertes: ['Alertes', 'Ce qui mérite ton attention en ce moment'],
  stats: ['Statistiques', 'Comparaison des performances mois par mois'],
  clients: ['Clientes', 'Liste des fiches clientes'],
  'client-detail': ['Fiche cliente', 'Informations, historique et notes'],
  agenda: ['Rendez-vous', 'Votre agenda et le suivi des cures'],
  billing: ['Facturation', 'Factures, promotions et suivi des paiements'],
  compta: ['Comptabilité', 'Dépenses et exports pour ta comptabilité'],
  communication: ['Communication', 'SMS, newsletter et historique des envois'],
  formulaires: ['Formulaires', 'Questionnaires envoyés aux clientes'],
  parametres: ['Paramètres', "Horaires d'ouverture et objectifs"],
}

const SIDEBAR_COLLAPSED_KEY = 'bella-luna-sidebar-collapsed'

function App() {
  const [view, setView] = useState<View>('clients')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const [title, subtitle] = TITLES[view]

  function navigate(next: View) {
    setSelectedClientId(null)
    setView(next)
  }

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <>
      <Show when="signed-out">
        <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-6">
          <div className="text-center">
            <img src={logo} alt="Bella Luna" className="w-28 h-28 mx-auto mb-4 object-contain" />
            <p className="mt-1 text-sm tracking-wider text-text-muted uppercase">
              Espace de gestion
            </p>
          </div>
          <SignIn />
        </div>
      </Show>

      <Show when="signed-in">
        <div className="flex min-h-screen">
          <div className="print:hidden">
            <Sidebar
              activeView={view}
              onNavigate={navigate}
              collapsed={collapsed}
              onToggleCollapsed={toggleCollapsed}
              mobileOpen={mobileMenuOpen}
              onCloseMobile={() => setMobileMenuOpen(false)}
            />
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            <div className="print:hidden">
              <Topbar title={title} subtitle={subtitle} onOpenMobileMenu={() => setMobileMenuOpen(true)} />
            </div>
            <main className="flex-1 p-4 md:p-8 overflow-y-auto overflow-x-hidden print:p-0 print:overflow-visible">
              <div className="max-w-[1440px] mx-auto">
              {view === 'clients' && <ClientsListView />}
              {view === 'client-detail' && selectedClientId && (
                <ClientDetailView
                  clientId={selectedClientId}
                  onBack={() => setView('clients')}
                />
              )}
              {view === 'dashboard' && (
                <DashboardView
                  onSelectClient={(id) => {
                    setSelectedClientId(id)
                    setView('client-detail')
                  }}
                  onNavigateAgenda={() => setView('agenda')}
                  onNavigateFacturation={() => setView('billing')}
                  onNavigateCompta={() => setView('compta')}
                />
              )}
              {view === 'alertes' && (
                <AlertesView
                  onSelectClient={(id) => {
                    setSelectedClientId(id)
                    setView('client-detail')
                  }}
                  onNavigateFacturation={() => setView('billing')}
                  onNavigateNewsletter={() => setView('communication')}
                />
              )}
              {view === 'stats' && <StatsView />}
              {view === 'agenda' && <AgendaView />}
              {view === 'billing' && (
                <FacturationView
                  onSelectClient={(id) => {
                    setSelectedClientId(id)
                    setView('client-detail')
                  }}
                />
              )}
              {view === 'compta' && <ComptaView />}
              {view === 'communication' && <CommunicationView />}
              {view === 'formulaires' && <FormulairesView />}
              {view === 'parametres' && <ParametresView />}
              </div>
            </main>
          </div>
        </div>
      </Show>
    </>
  )
}

export default App
