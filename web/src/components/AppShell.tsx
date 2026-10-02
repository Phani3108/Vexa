import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Activity, Home, Settings, Workflow } from 'lucide-react'
import Orb from './Orb'
import AskSheet from './AskSheet'
import { api } from '../lib/api'
import { useLive } from '../lib/live'

/** Tabbed screens: Home · Activity · (Vexa) · Flows · Me */
export default function AppShell() {
  const [ask, setAsk] = useState(false)
  const [needsYou, setNeedsYou] = useState(0)
  const { version } = useLive()
  const location = useLocation()

  useEffect(() => {
    api<{ total: number }>('/api/calls?followUp=new&limit=1').then(r => setNeedsYou(r.total)).catch(() => {})
  }, [location.pathname, version])

  return (
    <>
      <main className="screen"><Outlet context={{ openAsk: () => setAsk(true) }} /></main>
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end className={({ isActive }) => `tab${isActive ? ' active' : ''}`}><Home size={22} />Home</NavLink>
        <NavLink to="/activity" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          <Activity size={22} />Activity
          {needsYou > 0 && <span className="tab-badge">{needsYou}</span>}
        </NavLink>
        <button className="tab-orb" onClick={() => setAsk(true)} aria-label="Ask Vexa"><Orb size={60} /></button>
        <NavLink to="/flows" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}><Workflow size={22} />Flows</NavLink>
        <NavLink to="/me" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}><Settings size={22} />Me</NavLink>
      </nav>
      <AskSheet open={ask} onClose={() => setAsk(false)} />
    </>
  )
}
