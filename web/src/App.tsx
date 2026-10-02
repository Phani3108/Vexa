import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { BrainCircuit, PhoneIncoming, ShieldCheck, Workflow } from 'lucide-react'
import { useAuth } from './lib/auth'
import { LiveProvider } from './lib/live'
import AppShell from './components/AppShell'
import HandoffSheet from './components/HandoffSheet'
import { PageLoader, ToastHost } from './components/ui'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Home from './pages/Home'
import Activity from './pages/Activity'
import CallDetail from './pages/CallDetail'
import CallScreen from './pages/CallScreen'
import Flows from './pages/Flows'
import FlowEditor from './pages/FlowEditor'
import Me from './pages/Me'
import Settings from './pages/Settings'
import Bookings from './pages/Bookings'

/** Phone-sized app; on desktop it sits in a device frame. */
function Stage({ children }: { children: ReactNode }) {
  return (
    <div className="stage">
      <aside className="stage-aside">
        <div className="eyebrow gradient-text">Vexa</div>
        <h1 style={{ marginTop: 10 }}>The AI receptionist that never misses a call.</h1>
        <p>Answers in your voice and your rules. Understands callers in one sentence, follows multi-step playbooks, and only interrupts you when it matters.</p>
        <ul>
          <li><Workflow size={18} /> Multi-turn flows: quotes, bookings, emergencies</li>
          <li><BrainCircuit size={18} /> Steer live calls with Copilot</li>
          <li><ShieldCheck size={18} /> Spam risk scored before it rings</li>
          <li><PhoneIncoming size={18} /> For you, or for your whole business</li>
        </ul>
        <p className="small" style={{ marginTop: 24 }}>Tip: on your phone, use “Add to Home Screen” to install the app.</p>
      </aside>
      <div className="device">{children}<ToastHost /></div>
    </div>
  )
}

const full = (el: ReactNode) => <main className="screen full">{el}</main>

export default function App() {
  const { token, config, loading } = useAuth()

  if (!token) {
    return (
      <Stage>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Stage>
    )
  }

  if (loading || !config) return <Stage><PageLoader /></Stage>

  if (!config.onboardingCompleted) {
    return (
      <Stage>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="*" element={<Navigate to="/onboarding" replace />} />
        </Routes>
      </Stage>
    )
  }

  return (
    <LiveProvider>
      <Stage>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Home />} />
            <Route path="activity" element={<Activity />} />
            <Route path="flows" element={<Flows />} />
            <Route path="me" element={<Me />} />
          </Route>
          <Route path="/test" element={<main className="screen full"><CallScreen mode="test" /></main>} />
          <Route path="/live/:id" element={<main className="screen full"><CallScreen mode="live" /></main>} />
          <Route path="/call/:id" element={full(<CallDetail />)} />
          <Route path="/flows/:id" element={full(<FlowEditor />)} />
          <Route path="/me/:section" element={full(<Settings />)} />
          <Route path="/bookings" element={full(<Bookings />)} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <HandoffSheet />
      </Stage>
    </LiveProvider>
  )
}
