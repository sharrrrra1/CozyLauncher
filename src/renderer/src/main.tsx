import { createRoot } from 'react-dom/client'
import '@fontsource-variable/manrope'
import './styles/global.css'
import './styles/design-neon.css'
import './styles/design-aurora.css'
import './styles/design-crt.css'
import { AppProvider } from './state/AppContext'
import { App } from './App'

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

createRoot(container).render(
  <AppProvider>
    <App />
  </AppProvider>
)
