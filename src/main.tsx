import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { frFR } from '@clerk/localizations'
import './index.css'
import App from './App.tsx'
import ClerkSetupNeeded from './ClerkSetupNeeded.tsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {PUBLISHABLE_KEY ? (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} localization={frFR}>
        <App />
      </ClerkProvider>
    ) : (
      <ClerkSetupNeeded />
    )}
  </StrictMode>,
)
