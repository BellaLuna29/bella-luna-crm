import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { frFR } from '@clerk/localizations'
import './index.css'
import App from './App.tsx'
import ClerkSetupNeeded from './ClerkSetupNeeded.tsx'
import ToastProvider from './components/ToastProvider.tsx'
import ReservationPublique from './views/ReservationPublique.tsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // best effort — the app works fine without it, just not "installable"
    })
  })
}

// /reserver is public — clientes booking online are never signed into Clerk,
// so it must render entirely outside the auth-gated tree below. The trailing
// segment is a secret token (rotatable in Disponibilités) rather than a fixed,
// guessable path, so an old/leaked link can be cut off without a deploy.
const reserverMatch = window.location.pathname.match(/^\/reserver(?:\/([^/]+))?\/?$/)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {reserverMatch ? (
      <ReservationPublique token={reserverMatch[1] ?? ''} />
    ) : PUBLISHABLE_KEY ? (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} localization={frFR}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ClerkProvider>
    ) : (
      <ClerkSetupNeeded />
    )}
  </StrictMode>,
)
