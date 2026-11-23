import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { SearchProvider } from './context/SearchContext'
import { ThemeProvider } from './context/ThemeContext'
import { VoiceCallProvider } from './context/VoiceCallContext'
import { startShield } from './lib/shield'
import { initAniListSync } from './lib/anilist'
import { startVisionLive, gpuSupported } from './lib/vision-live'
import './index.css'

startShield()
initAniListSync()

if (typeof window !== 'undefined') {
  (window as any).__startVisionLive = startVisionLive;
  (window as any).__gpuSupported = gpuSupported;
}

const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:'
const Router = isFileProtocol ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <SearchProvider>
            <VoiceCallProvider>
              <App />
            </VoiceCallProvider>
          </SearchProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  </StrictMode>,
)
