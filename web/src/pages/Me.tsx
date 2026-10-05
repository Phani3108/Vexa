import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, Building2, CalendarCheck, ChevronRight, Clock, LogOut, Disc3, Mic2, Package, PhoneForwarded, ShieldBan, Star, Users } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { UserConfig } from '../lib/types'
import { formatPhone, initials } from '../lib/format'
import { LANG_SHORT } from '../lib/speech'
import Sheet from '../components/Sheet'
import { toast } from '../components/ui'

function Row({ to, icon: Icon, label, hint }: { to: string; icon: typeof Clock; label: string; hint?: string }) {
  return (
    <Link to={to} className="list-row">
      <span className="avatar" style={{ width: 36, height: 36, borderRadius: 11 }}><Icon size={17} /></span>
      <div className="grow"><h3>{label}</h3>{hint && <p className="xs muted truncate">{hint}</p>}</div>
      <ChevronRight size={17} className="chev" />
    </Link>
  )
}

export default function Me() {
  const { config, meta, signOut, setConfig } = useAuth()
  const navigate = useNavigate()
  const [switchTo, setSwitchTo] = useState<'personal' | 'business' | null>(null)
  if (!config) return null
  const isBiz = config.accountType !== 'personal'
  const p = config.businessProfile || ({} as UserConfig['businessProfile'])

  async function confirmSwitch() {
    if (switchTo === 'business') { navigate('/onboarding?mode=business'); return }
    const { config: c } = await api<{ config: UserConfig }>('/api/users/onboarding', { method: 'POST', body: { accountType: 'personal', name: config!.name } })
    setConfig(c)
    setSwitchTo(null)
    toast('Switched to personal')
  }

  return (
    <>
      <h1 style={{ marginBottom: 16 }}>Me</h1>

      <div className="card row">
        <span className="avatar lg">{initials(p.businessName || config.name || 'V')}</span>
        <div className="grow">
          <h2 className="truncate">{isBiz ? p.businessName || 'Your business' : config.name}</h2>
          <p className="small muted">{formatPhone(config.phoneNumber)}</p>
          {isBiz && config.name !== 'User' && <p className="xs muted">{config.name}</p>}
        </div>
      </div>

      <div className="section">
        <div className="eyebrow" style={{ margin: '0 4px 8px' }}>Mode</div>
        <div className="choice-grid">
          <button className={`choice${!isBiz ? ' active' : ''}`} onClick={() => isBiz && setSwitchTo('personal')}>Personal<span className="sub">Screens your calls, deliveries & spam</span></button>
          <button className={`choice${isBiz ? ' active' : ''}`} onClick={() => !isBiz && setSwitchTo('business')}>Business<span className="sub">Receptionist: leads, bookings, support</span></button>
        </div>
      </div>

      <div className="section">
        <div className="eyebrow" style={{ margin: '0 4px 8px' }}>Your receptionist</div>
        <div className="card tight">
          {isBiz ? (
            <>
              <Row to="/me/business" icon={Building2} label="Business info" hint={p.address || 'Name, address, links, transfer number'} />
              <Row to="/me/knowledge" icon={BookOpen} label="Services & FAQs" hint={`${p.services?.length || 0} services · ${p.faqs?.length || 0} FAQs`} />
              <Row to="/me/products" icon={Package} label="Products & stock" hint={`${p.catalog?.length || 0} items · prices quoted live on calls`} />
              <Row to="/me/hours" icon={Clock} label="Opening hours" hint={p.timezone} />
              <Row to="/bookings" icon={CalendarCheck} label="Bookings" hint="Approve requests from callers" />
            </>
          ) : (
            <Row to="/me/deliveries" icon={Package} label="Deliveries" hint="Address and drop-off instructions" />
          )}
          <Row to="/me/voice" icon={Mic2} label="Voice & language" hint={`${config.aiSettings?.voice ? `Voice: ${config.aiSettings.voice} · ` : ''}${LANG_SHORT[config.aiSettings?.language || 'en']} + 7 languages, auto-switch`} />
          <Row to="/me/recording" icon={Disc3} label="Recording & privacy" hint={config.recording?.enabled === false ? 'Off' : `On · kept ${config.recording?.retentionDays ?? 90} days`} />
        </div>
      </div>

      <div className="section">
        <div className="eyebrow" style={{ margin: '0 4px 8px' }}>People</div>
        <div className="card tight">
          <Row to="/me/contacts?tab=callers" icon={Users} label="Callers Vexa remembers" />
          <Row to="/me/contacts?tab=vip" icon={Star} label="VIPs" hint={`${config.vipContacts?.length || 0} people`} />
          <Row to="/me/contacts?tab=blocked" icon={ShieldBan} label="Blocked numbers" hint={`${config.blockedNumbers?.length || 0} numbers`} />
        </div>
      </div>

      <div className="section">
        <div className="eyebrow" style={{ margin: '0 4px 8px' }}>Phone</div>
        <div className="card tight">
          <Row to="/me/phone" icon={PhoneForwarded} label="Phone setup" hint={meta?.voiceEnabled ? 'Live calls connected' : 'Connect your number to go live'} />
        </div>
      </div>

      <button className="btn block ghost section" style={{ color: 'var(--danger)' }} onClick={signOut}><LogOut size={16} /> Sign out</button>
      <p className="xs muted" style={{ textAlign: 'center', marginTop: 8 }}>Vexa · {meta?.aiEnabled ? 'AI connected' : 'Offline engine'}</p>

      <Sheet open={!!switchTo} onClose={() => setSwitchTo(null)} label="Switch mode">
        <h2>Switch to {switchTo}?</h2>
        <p className="small muted" style={{ margin: '8px 0 16px' }}>
          {switchTo === 'business' ? 'You’ll set up your business in a few steps. Flows switch to receptionist playbooks.' : 'Flows switch to personal call screening. Your business details are kept.'}
        </p>
        <button className="btn block primary" onClick={confirmSwitch}>Switch</button>
      </Sheet>
    </>
  )
}
