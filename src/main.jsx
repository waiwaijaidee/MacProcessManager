import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { SettingsProvider } from './hooks/useSettings.jsx'
import { ToastProvider } from './components/Toast.jsx'
import './styles/theme.css'
import './styles/layout.css'
import './styles/main-column.css'
import './styles/primitives.css'
import './styles/data.css'
import './styles/table.css'
import './styles/overlay.css'
import './styles/views.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SettingsProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </SettingsProvider>
  </React.StrictMode>
)
