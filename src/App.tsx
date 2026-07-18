import { useState } from 'react'
import { Show, SignIn } from '@clerk/react'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import ClientsListView from './views/ClientsListView'
import ClientDetailView from './views/ClientDetailView'
import AgendaView from './views/AgendaView'
import DashboardView from './views/DashboardView'
import StatsView from './views/StatsView'
import FacturationView from './views/FacturationView'
import ComingSoon from './views/ComingSoon'
import type { View } from './types'

const TITLES: Record<View, [string, string]> = {
  dashboard: ['Tableau de bord', "Vue d'ensemble de votre activité"],
  stats: ['Statistiques', 'Comparaison des performances mois par mois'],
  clients: ['Clientes', 'Liste des fiches clientes'],
  'client-detail': ['Fiche cliente', 'Informations, historique et notes'],
  agenda: ['Rendez-vous', 'Votre agenda et le suivi des cures'],
  billing: ['Facturation', 'Factures, promotions et suivi des paiements'],
  newsletter: ['Newsletter', 'Offres du moment et ciblage clientes'],
}

function App() {
  const [view, setView] = useState<View>('clients')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)

  const [title, subtitle] = TITLES[view]

  function navigate(next: View) {
    setSelectedClientId(null)
    setView(next)
  }

  return (
    <>
      <Show when="signed-out">
        <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-gold flex items-center justify-center mx-auto mb-4">
              <span className="font-serif font-semibold text-2xl text-sage-dark">B</span>
            </div>
            <h1 className="font-serif text-3xl font-semibold text-sage-dark">Bella Luna</h1>
            <p className="mt-1 text-sm tracking-wider text-text-muted uppercase">
              Espace de gestion
            </p>
          </div>
          <SignIn />
        </div>
      </Show>

      <Show when="signed-in">
        <div className="flex min-h-screen">
          <Sidebar activeView={view} onNavigate={navigate} />
          <div className="flex-1 flex flex-col min-w-0">
            <Topbar title={title} subtitle={subtitle} />
            <main className="flex-1 p-8 overflow-y-auto">
              {view === 'clients' && (
                <ClientsListView
                  onSelectClient={(id) => {
                    setSelectedClientId(id)
                    setView('client-detail')
                  }}
                />
              )}
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
                  onNavigateClients={() => setView('clients')}
                  onNavigateFacturation={() => setView('billing')}
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
              {view === 'newsletter' && <ComingSoon title="Newsletter" />}
            </main>
          </div>
        </div>
      </Show>
    </>
  )
}

export default App
