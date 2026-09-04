import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import PrivacyPolicyPage from './features/legal/PrivacyPolicyPage'

const isPrivacyPage = window.location.pathname.replace(/\/+$/, '') === '/privacy'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPrivacyPage ? <PrivacyPolicyPage /> : <App />}
  </StrictMode>,
)
