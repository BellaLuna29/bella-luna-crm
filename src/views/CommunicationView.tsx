import { useState } from 'react'
import SmsView from './SmsView'
import NewsletterView from './NewsletterView'
import HistoriqueCommunications from '../components/HistoriqueCommunications'

type SubTab = 'sms' | 'newsletter' | 'historique'

const TABS: { key: SubTab; label: string }[] = [
  { key: 'sms', label: 'SMS & rappels' },
  { key: 'newsletter', label: 'Newsletter' },
  { key: 'historique', label: 'Historique des envois' },
]

function CommunicationView() {
  const [subTab, setSubTab] = useState<SubTab>('sms')

  return (
    <div>
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`px-3.5 py-2 rounded-[10px] text-sm font-semibold transition-colors ${
              subTab === tab.key ? 'bg-sage-dark text-white' : 'bg-white border border-border text-text-muted hover:bg-sage-pale'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'sms' && <SmsView />}
      {subTab === 'newsletter' && <NewsletterView />}
      {subTab === 'historique' && <HistoriqueCommunications />}
    </div>
  )
}

export default CommunicationView
