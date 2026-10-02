import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, CheckCheck, CircleHelp, Copy, GitBranch, MessageCircle, PhoneForwarded, PhoneOff, Play, Plus, Trash2, X, Zap } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { FlowSlot, FlowStep, SlotType, StepType, Workflow } from '../lib/types'
import Sheet from '../components/Sheet'
import { Field, PageLoader, Toggle, TopBar, toast } from '../components/ui'

const SLOT_TYPES: { id: SlotType; label: string }[] = [
  { id: 'text', label: 'Free text' }, { id: 'name', label: 'Name' }, { id: 'datetime', label: 'Date / time' },
  { id: 'phone', label: 'Phone number' }, { id: 'email', label: 'Email' }, { id: 'yesno', label: 'Yes / no' },
  { id: 'address', label: 'Address' }, { id: 'company', label: 'Company' }, { id: 'number', label: 'Number' }, { id: 'choice', label: 'Choice' },
]
const STEP_TYPES: { id: StepType; label: string; hint: string }[] = [
  { id: 'collect', label: 'Ask a question', hint: 'Skipped automatically if the caller already said it' },
  { id: 'confirm', label: 'Confirm details', hint: 'Read back what was captured; caller can correct' },
  { id: 'say', label: 'Say something', hint: 'A line Vexa speaks, then continues' },
  { id: 'branch', label: 'If / else', hint: 'Go different ways based on an answer or the situation' },
  { id: 'action', label: 'Do something', hint: 'Create a lead, request a booking, text the caller…' },
  { id: 'transfer', label: 'Transfer to you', hint: 'Ends the flow by putting the caller through' },
  { id: 'end', label: 'End the call', hint: 'Final line, then Vexa hangs up' },
]
const ACTIONS = [
  { id: 'create_lead', label: 'Add to my inbox' }, { id: 'book_request', label: 'Create booking request' },
  { id: 'send_sms', label: 'Text the caller' }, { id: 'notify_owner', label: 'Notify me' }, { id: 'tag_spam', label: 'Mark as spam' },
]
const CONDS = [
  { id: 'business_open', label: 'We are open now' }, { id: 'transfer_allowed', label: 'Transfers allowed right now' },
  { id: 'is_vip', label: 'Caller is a VIP' }, { id: 'focus_mode', label: 'I am in Focus' }, { id: 'has_booking_url', label: 'I have a booking link' },
]
const STEP_ICON: Record<StepType, typeof Zap> = { collect: CircleHelp, confirm: CheckCheck, say: MessageCircle, branch: GitBranch, action: Zap, transfer: PhoneForwarded, end: PhoneOff, goto: ArrowDown }

function describe(step: FlowStep, flow: Workflow): string {
  const slot = flow.slots.find(s => s.key === step.slot)
  switch (step.type) {
    case 'collect': return `Ask: “${slot?.prompt || step.slot}”`
    case 'confirm': return `Confirm: “${step.text}”`
    case 'say': return `Say: “${step.text}”`
    case 'transfer': return `Transfer: “${step.text}”`
    case 'end': return `End: “${step.text}”`
    case 'action': return `Do: ${ACTIONS.find(a => a.id === step.action)?.label || step.action}`
    case 'branch': {
      const w = step.when || {}
      const c = w.cond ? CONDS.find(x => x.id === w.cond)?.label : w.slot ? `${flow.slots.find(s => s.key === w.slot)?.label || w.slot} is ${String(w.is)}` : w.all ? 'all conditions match' : 'condition'
      return `If ${c} → ${step.then || 'next'}, else → ${step.else || 'next'}`
    }
    case 'goto': return `Go to ${step.to}`
  }
}

export default function FlowEditor() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [flow, setFlow] = useState<Workflow | null>(null)
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [editStep, setEditStep] = useState<number | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [kw, setKw] = useState('')

  useEffect(() => {
    api<{ workflows: Workflow[] }>('/api/workflows').then(r => setFlow(r.workflows.find(w => w.id === id) || null))
  }, [id])

  if (!flow) return <PageLoader />

  const update = (patch: Partial<Workflow>) => { setFlow({ ...flow, ...patch }); setDirty(true); setErrors([]) }
  const setStep = (i: number, patch: Partial<FlowStep>) => update({ steps: flow.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  const setSlot = (i: number, patch: Partial<FlowSlot>) => update({ slots: flow.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  const move = (i: number, d: -1 | 1) => {
    const steps = flow.steps.slice()
    const j = i + d
    if (j < 0 || j >= steps.length) return
    ;[steps[i], steps[j]] = [steps[j], steps[i]]
    update({ steps })
  }

  async function save(): Promise<boolean> {
    try {
      const r = await api<{ workflow: Workflow }>(`/api/workflows/${flow!.id}`, { method: 'PUT', body: flow })
      setFlow(r.workflow)
      setDirty(false)
      toast('Flow saved')
      return true
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not save'
      setErrors([msg])
      toast(msg)
      return false
    }
  }

  async function test() {
    if (dirty && !(await save())) return
    navigate(`/test?flow=${flow!.id}`)
  }

  async function duplicate() {
    const r = await api<{ workflow: Workflow }>('/api/workflows', { method: 'POST', body: { duplicateOf: flow!.id } })
    navigate(`/flows/${r.workflow.id}`, { replace: true })
  }

  async function remove() {
    if (!confirm(`Delete “${flow!.name}”?`)) return
    await api(`/api/workflows/${flow!.id}`, { method: 'DELETE' })
    navigate('/flows', { replace: true })
  }

  function addStep(type: StepType) {
    const nid = `s${Date.now().toString(36)}`
    const base: FlowStep = { id: nid, type }
    if (type === 'collect') base.slot = flow!.slots[0]?.key
    if (['say', 'confirm', 'end', 'transfer'].includes(type)) base.text = type === 'end' ? 'Thanks for calling. I\'m disconnecting the call now.' : type === 'transfer' ? 'Let me put you through. Transferring you now.' : type === 'confirm' ? 'Did I get that right?' : 'One moment.'
    if (type === 'action') base.action = 'create_lead'
    if (type === 'branch') base.when = { cond: 'business_open' }
    // insert before the final end/transfer so flows stay valid
    const steps = flow!.steps.slice()
    const lastTerminal = steps.map(s => s.type).lastIndexOf('end')
    const at = type === 'end' || type === 'transfer' || lastTerminal < 0 ? steps.length : lastTerminal
    steps.splice(at, 0, base)
    update({ steps })
    setAddOpen(false)
    setEditStep(at)
  }

  function addSlot() {
    const n = flow!.slots.length + 1
    update({ slots: [...flow!.slots, { key: `q${n}_${Date.now().toString(36).slice(-3)}`, label: `Question ${n}`, type: 'text', prompt: 'What would you like to tell us?' }] })
  }

  const step = editStep != null ? flow.steps[editStep] : null

  return (
    <>
      <TopBar title={flow.name} right={<button className="btn sm primary" onClick={save} disabled={!dirty}>Save</button>} />

      {errors.length > 0 && <div className="alert danger" style={{ marginBottom: 12 }}>{errors[0]}</div>}

      <div className="card stack">
        <Field label="Name"><input className="input" value={flow.name} onChange={e => update({ name: e.target.value })} /></Field>
        <Field label="What it’s for"><input className="input" value={flow.description || ''} onChange={e => update({ description: e.target.value })} /></Field>
        {!flow.trigger?.isDefault && (
          <Field label="Starts when the caller mentions" hint="Vexa also uses AI understanding when an OpenAI key is set.">
            <div className="row wrap" style={{ gap: 6 }}>
              {(flow.trigger.keywords || []).map(k => (
                <span key={k} className="chip" style={{ height: 28 }}>{k}<button className="btn ghost icon sm" style={{ width: 18, height: 18 }} aria-label={`Remove ${k}`} onClick={() => update({ trigger: { ...flow.trigger, keywords: flow.trigger.keywords!.filter(x => x !== k) } })}><X size={12} /></button></span>
              ))}
            </div>
            <form className="composer" onSubmit={e => { e.preventDefault(); if (kw.trim()) { update({ trigger: { ...flow.trigger, keywords: [...(flow.trigger.keywords || []), kw.trim().toLowerCase()] } }); setKw('') } }}>
              <input className="input" placeholder="Add a word or phrase" value={kw} onChange={e => setKw(e.target.value)} />
              <button className="btn icon round" aria-label="Add keyword"><Plus size={16} /></button>
            </form>
          </Field>
        )}
        {flow.trigger?.isDefault && <p className="small muted">This is the fallback — Vexa uses it when no other flow matches.</p>}
      </div>

      <div className="section">
        <div className="section-head"><h2>What Vexa needs to find out</h2><button className="link" onClick={addSlot}>+ Add</button></div>
        <div className="stack" style={{ gap: 10 }}>
          {flow.slots.map((s, i) => (
            <div key={s.key} className="card stack" style={{ marginTop: 0, gap: 10 }}>
              <div className="row">
                <input className="input" style={{ height: 40 }} value={s.label} onChange={e => setSlot(i, { label: e.target.value })} aria-label="Label" />
                <select className="select" style={{ height: 40, width: 150 }} value={s.type} onChange={e => setSlot(i, { type: e.target.value as SlotType })} aria-label="Answer type">
                  {SLOT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <button className="btn ghost icon sm" aria-label="Remove question" onClick={() => update({ slots: flow.slots.filter((_, j) => j !== i), steps: flow.steps.filter(st => !(st.type === 'collect' && st.slot === s.key)) })}><Trash2 size={15} /></button>
              </div>
              <input className="input" value={s.prompt} onChange={e => setSlot(i, { prompt: e.target.value })} aria-label="Question Vexa asks" />
              {s.type === 'choice' && (
                <input className="input" placeholder="Options, comma separated" value={(s.options || []).map(o => o.value).join(', ')} onChange={e => setSlot(i, { options: e.target.value.split(',').map(v => ({ value: v.trim() })).filter(o => o.value) })} />
              )}
              <div className="row between small dim">
                <label className="row" style={{ gap: 8 }}><Toggle checked={s.required !== false} onChange={v => setSlot(i, { required: v ? undefined : false })} label="Required" /> Required</label>
                {s.prefill && <span className="badge accent">Auto-filled from {s.prefill === 'caller_name' ? 'caller memory' : 'caller ID'}</span>}
              </div>
            </div>
          ))}
          {flow.slots.length === 0 && <p className="small muted">No questions — this flow acts immediately (great for spam).</p>}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Steps</h2><button className="link" onClick={() => setAddOpen(true)}>+ Add step</button></div>
        <div className="timeline">
          {flow.steps.map((st, i) => {
            const Icon = STEP_ICON[st.type]
            return (
              <button key={st.id} className={`step t-${st.type}`} onClick={() => setEditStep(i)}>
                <span className="node"><Icon size={13} /></span>
                <div className="grow">
                  <div className="xs muted">{st.id} · {STEP_TYPES.find(t => t.id === st.type)?.label}</div>
                  <div className="small" style={{ marginTop: 2 }}>{describe(st, flow)}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="stack section">
        <button className="btn primary block" onClick={test}><Play size={16} /> Test this flow</button>
        <div className="row">
          <button className="btn grow" onClick={duplicate}><Copy size={16} /> Duplicate</button>
          {!flow.builtIn && <button className="btn grow danger" onClick={remove}><Trash2 size={16} /> Delete</button>}
        </div>
      </div>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} label="Add step">
        <h2 style={{ marginBottom: 12 }}>Add a step</h2>
        <div className="stack" style={{ gap: 8 }}>
          {STEP_TYPES.map(t => {
            const Icon = STEP_ICON[t.id]
            return (
              <button key={t.id} className="step" onClick={() => addStep(t.id)}>
                <span className="node"><Icon size={13} /></span>
                <div><div style={{ fontWeight: 600 }}>{t.label}</div><div className="xs muted">{t.hint}</div></div>
              </button>
            )
          })}
        </div>
      </Sheet>

      <Sheet open={!!step} onClose={() => setEditStep(null)} label="Edit step">
        {step && editStep != null && (
          <div className="stack">
            <div className="row between"><h2>{STEP_TYPES.find(t => t.id === step.type)?.label}</h2><span className="badge">{step.id}</span></div>
            {step.type === 'collect' && (
              <Field label="Question">
                <select className="select" value={step.slot} onChange={e => setStep(editStep, { slot: e.target.value })}>
                  {flow.slots.map(s => <option key={s.key} value={s.key}>{s.label} — “{s.prompt}”</option>)}
                </select>
              </Field>
            )}
            {['say', 'confirm', 'end', 'transfer'].includes(step.type) && (
              <Field label="What Vexa says" hint="Use {{slot}} to insert answers, e.g. {{firstName}}, {{biz}}, {{timing}}.">
                <textarea className="textarea" value={step.text || ''} onChange={e => setStep(editStep, { text: e.target.value })} />
              </Field>
            )}
            {step.type === 'confirm' && (
              <Field label="If the caller says no, re-ask">
                <div className="row wrap" style={{ gap: 6 }}>
                  {flow.slots.map(s => {
                    const on = (step.recollect || []).includes(s.key)
                    return <button key={s.key} className={`chip${on ? ' active' : ''}`} onClick={() => setStep(editStep, { recollect: on ? step.recollect!.filter(k => k !== s.key) : [...(step.recollect || []), s.key] })}>{s.label}</button>
                  })}
                </div>
              </Field>
            )}
            {step.type === 'action' && (
              <>
                <Field label="Action">
                  <select className="select" value={step.action} onChange={e => setStep(editStep, { action: e.target.value })}>
                    {ACTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                </Field>
                {step.action === 'send_sms' && (
                  <Field label="Text message"><textarea className="textarea" value={String(step.params?.template || '')} onChange={e => setStep(editStep, { params: { ...step.params, template: e.target.value } })} /></Field>
                )}
              </>
            )}
            {step.type === 'branch' && (
              <>
                <Field label="Check">
                  <select className="select" value={step.when?.cond ? `cond:${step.when.cond}` : step.when?.slot ? `slot:${step.when.slot}` : ''} onChange={e => {
                    const [k, v] = e.target.value.split(':')
                    setStep(editStep, { when: k === 'cond' ? { cond: v } : { slot: v, is: true } })
                  }}>
                    <optgroup label="Situation">{CONDS.map(c => <option key={c.id} value={`cond:${c.id}`}>{c.label}</option>)}</optgroup>
                    <optgroup label="Caller's answer is yes">{flow.slots.filter(s => s.type === 'yesno').map(s => <option key={s.key} value={`slot:${s.key}`}>{s.label}</option>)}</optgroup>
                  </select>
                </Field>
                <div className="row">
                  <Field label="If yes, go to"><select className="select" value={step.then || ''} onChange={e => setStep(editStep, { then: e.target.value })}>{flow.steps.map(s => <option key={s.id} value={s.id}>{s.id} · {s.type}</option>)}</select></Field>
                  <Field label="Otherwise"><select className="select" value={step.else || ''} onChange={e => setStep(editStep, { else: e.target.value })}>{flow.steps.map(s => <option key={s.id} value={s.id}>{s.id} · {s.type}</option>)}</select></Field>
                </div>
              </>
            )}
            <div className="row">
              <button className="btn icon" onClick={() => { move(editStep, -1); setEditStep(Math.max(0, editStep - 1)) }} aria-label="Move up"><ArrowUp size={16} /></button>
              <button className="btn icon" onClick={() => { move(editStep, 1); setEditStep(Math.min(flow.steps.length - 1, editStep + 1)) }} aria-label="Move down"><ArrowDown size={16} /></button>
              <button className="btn grow danger" onClick={() => { update({ steps: flow.steps.filter((_, j) => j !== editStep) }); setEditStep(null) }}><Trash2 size={16} /> Remove</button>
              <button className="btn grow primary" onClick={() => setEditStep(null)}>Done</button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  )
}
