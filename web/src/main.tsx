import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
// The display face (--font-display in index.css), self-hosted: Vite bundles the woff2 and the PWA
// precaches it, so nothing is fetched from a font CDN. Fraunces, SIL Open Font License 1.1. Latin
// subset only: it sets the wordmark and headings.
import '@fontsource/fraunces/latin-600.css'
import '@fontsource/fraunces/latin-700.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
