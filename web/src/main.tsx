import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { readAppTheme } from './theme.ts'
import { SnapshotTrailProvider } from './snapshot/trail.tsx'

document.documentElement.dataset.theme = readAppTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SnapshotTrailProvider>
      <App />
    </SnapshotTrailProvider>
  </StrictMode>,
)
