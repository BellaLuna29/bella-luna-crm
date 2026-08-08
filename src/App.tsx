import { lazy, Suspense, useState } from 'react'
import { Show, SignIn } from '@clerk/react'
import logo from './assets/logo.png'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import type { View } from './types'

// Lazy-loaded so the initial bundle only pays for the shell (Sidebar/Topbar)
// plus whichever single view is actually open — the CRM has a lot of views
// and she only ever looks at one at a time.
const ClientsListView = lazy(() => import('./views/ClientsListView'))
const ClientDetailView = lazy(() => import('./views/ClientDetailView'))
const AgendaView = lazy(() => import('./views/AgendaView'))
const DashboardView = lazy(() => import('./views/DashboardView'))
const StatsView = lazy(() => import('./views/StatsView'))
const FacturationView = lazy(() => import('./views/FacturationView'))
const PrestationsView = lazy(() => import('./views/PrestationsView'))
const ComptaView = lazy(() => import('./views/ComptaView'))
const CommunicationView = lazy(() => import('./views/CommunicationView'))
const ParametresView = lazy(() => import('./views/ParametresView'))

const TITLES: Record<View, [string, string]> = {
  dashboard: ['Tableau de bord', "Vue d'ensemble de votre activité"],
  stats: ['Statistiques', 'Comparaison des performances mois par mois'],
  clients: ['Clientes', 'Liste des fiches clientes'],
  'client-detail': ['Fiche cliente', 'Informations, historique et notes'],
  agenda: ['Rendez-vous', 'Votre agenda et le suivi des cures'],
  billing: ['Facturation', 'Factures, promotions et suivi des paiements'],
  prestations: ['Prestations', 'Le catalogue de tes soins et massages'],
  compta: ['Comptabilité', 'Dépenses et exports pour ta comptabilité'],
  communication: ['Communication', 'SMS, newsletter et historique des envois'],
  parametres: ['Paramètres', "Alertes, modèles, formulaires et objectifs"],
}

const SIDEBAR_COLLAPSED_KEY = 'bella-luna-sidebar-collapsed'

function App() {
  const [view, setView] = useState<View>('dashboard')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const [title, subtitle] = TITLES[view]

  function navigate(next: View) {
    setSelectedClientId(null)
    setView(next)
  }

  function selectClient(id: string) {
    setSelectedClientId(id)
    setView('client-detail')
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
        <div className="flex h-screen overflow-hidden print:h-auto print:overflow-visible">
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
          <div className="flex-1 flex flex-col min-w-0 print:overflow-visible">
            <div className="print:hidden">
              <Topbar
                title={title}
                subtitle={subtitle}
                onOpenMobileMenu={() => setMobileMenuOpen(true)}
                onSelectClient={selectClient}
              />
            </div>
            <main className="flex-1 p-4 md:p-8 overflow-y-auto overflow-x-hidden print:p-0 print:overflow-visible">
              <Suspense fallback={<p className="text-sm text-text-muted">Chargement…</p>}>
              <div>
              {view === 'clients' && <ClientsListView />}
              {view === 'client-detail' && selectedClientId && (
                <ClientDetailView
                  clientId={selectedClientId}
                  onBack={() => setView('clients')}
                />
              )}
              {view === 'dashboard' && (
                <DashboardView
                  onSelectClient={selectClient}
                  onNavigateAgenda={() => setView('agenda')}
                  onNavigateFacturation={() => setView('billing')}
                  onNavigateCompta={() => setView('compta')}
                  onNavigateParametres={() => setView('parametres')}
                />
              )}
              {view === 'stats' && <StatsView />}
              {view === 'agenda' && <AgendaView />}
              {view === 'billing' && (
                <FacturationView onSelectClient={selectClient} />
              )}
              {view === 'prestations' && <PrestationsView />}
              {view === 'compta' && <ComptaView />}
              {view === 'communication' && <CommunicationView />}
              {view === 'parametres' && (
                <ParametresView
                  onSelectClient={selectClient}
                  onNavigateFacturation={() => setView('billing')}
                  onNavigateNewsletter={() => setView('communication')}
                />
              )}
              </div>
              </Suspense>
            </main>
          </div>
        </div>
      </Show>
    </>
  )
}

export default App
