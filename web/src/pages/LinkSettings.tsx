import { useEffect, useState } from 'react'
import { Copy, Download, ExternalLink, Share2 } from 'lucide-react'
import QRCode from 'qrcode'
import { api } from '../lib/api'
import { Field, PageLoader, Toggle, TopBar, toast } from '../components/ui'

interface Settings { enabled: boolean; slug: string | null; suggestedSlug: string; dailyLimit: number; usedToday: number }

/** Vexa Link: a page + QR code where customers talk to your receptionist from their own phone. */
export default function LinkSettings() {
  const [s, setS] = useState<Settings | null>(null)
  const [slug, setSlug] = useState('')
  const [limit, setLimit] = useState('50')
  const [qr, setQr] = useState<string | null>(null)

  const apply = (r: Settings) => { setS(r); setSlug(r.slug || r.suggestedSlug); setLimit(String(r.dailyLimit)) }
  useEffect(() => { api<Settings>('/api/link').then(apply) }, [])

  const url = s?.slug ? `${location.origin}/l/${s.slug}` : null
  useEffect(() => {
    if (!url || !s?.enabled) { setQr(null); return }
    QRCode.toDataURL(url, { width: 440, margin: 1, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(null))
  }, [url, s?.enabled])

  async function save(body: Partial<{ enabled: boolean; slug: string; dailyLimit: number }>) {
    try {
      apply(await api<Settings>('/api/link', { method: 'PUT', body }))
      toast('Saved')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save')
    }
  }

  async function share() {
    if (!url) return
    if (navigator.share) await navigator.share({ title: 'Talk to us', text: 'Ask us anything or place an order — answered instantly:', url }).catch(() => {})
    else { await navigator.clipboard.writeText(url); toast('Link copied') }
  }

  if (!s) return <PageLoader />

  return (
    <>
      <TopBar title="Vexa Link" />
      <p className="small dim" style={{ marginBottom: 14 }}>A page anyone can open from a link or QR code to talk to your receptionist, by voice or text, in 8 languages. No phone number or app needed. Put the QR on your counter, door or WhatsApp status.</p>

      <div className="card row between">
        <div>
          <div>Link is {s.enabled ? 'on' : 'off'}</div>
          <div className="xs muted">{s.usedToday} of {s.dailyLimit} conversations used today</div>
        </div>
        <Toggle checked={s.enabled} onChange={v => save({ enabled: v })} label="Vexa Link on" />
      </div>

      {s.enabled && url && (
        <div className="card stack" style={{ gap: 12, alignItems: 'stretch' }}>
          {qr && <div className="qr-box"><img src={qr} alt={`QR code for ${url}`} /></div>}
          <p className="mono small" style={{ textAlign: 'center', wordBreak: 'break-all' }}>{url}</p>
          <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
            <button className="btn sm" onClick={() => navigator.clipboard.writeText(url).then(() => toast('Link copied'))}><Copy size={14} /> Copy</button>
            <button className="btn sm" onClick={share}><Share2 size={14} /> Share</button>
            {qr && <a className="btn sm" href={qr} download={`vexa-link-${s.slug}.png`}><Download size={14} /> QR image</a>}
            <a className="btn sm" href={url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>
          </div>
        </div>
      )}

      <div className="section stack" style={{ gap: 12 }}>
        <Field label="Link name" hint="Lowercase letters, numbers and dashes">
          <div className="row" style={{ gap: 8 }}>
            <input className="input" value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} aria-label="Link name" />
            <button className="btn sm" disabled={!slug || slug === s.slug} onClick={() => save({ slug })}>Save</button>
          </div>
        </Field>
        <Field label="Conversations per day" hint="Keeps AI costs predictable. New visitors are asked to call instead once it is reached.">
          <div className="row" style={{ gap: 8 }}>
            <input className="input" inputMode="numeric" value={limit} onChange={e => setLimit(e.target.value.replace(/\D/g, ''))} aria-label="Conversations per day" />
            <button className="btn sm" disabled={!limit || Number(limit) === s.dailyLimit} onClick={() => save({ dailyLimit: Number(limit) })}>Save</button>
          </div>
        </Field>
        <p className="xs muted">Visitors are anonymous: Vexa never reads out order, report or fee records on the link, and nothing is recorded. Conversations appear in Activity like calls.</p>
      </div>
    </>
  )
}
