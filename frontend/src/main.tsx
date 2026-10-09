import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { isMockMode } from '@/config/env'
import { initDemoStore } from '@/services/mock/store'
import App from './App.tsx'

// Demo mode: load the browser store first so demo accounts registered here are known before the session is restored.
if (isMockMode) initDemoStore()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
