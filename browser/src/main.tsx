import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './game.css'
import App from './GameApp.tsx'

const root = createRoot(document.getElementById('root')!)
if (import.meta.env.DEV && new URLSearchParams(location.search).get('lab') === 'stress') {
  void import('./dev/StressLab.tsx').then(({ default: StressLab }) => root.render(<StressLab />))
} else root.render(<StrictMode><App /></StrictMode>)
