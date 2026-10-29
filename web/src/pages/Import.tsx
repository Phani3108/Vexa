import { useState } from 'react'
import { FileUp, Sheet as SheetIcon } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Field, Toggle, TopBar, toast } from '../components/ui'

type Kind = 'catalog' | 'records' | 'listings'
interface Result { imported: number; wouldImport?: number; total?: number; errors: { row: number; message: string }[]; columns: string[]; preview: Record<string, unknown>[] }

const KINDS: { id: Kind; label: string; columns: string; example: string }[] = [
  { id: 'catalog', label: 'Products, menu, services', columns: 'name, price, price_max, stock, unit, category, note, aliases (separated by ;)', example: 'name,price,stock,aliases\nLED bulb,99,120,bulb;batti\nThyroid profile,500,,thyroid;tsh' },
  { id: 'records', label: 'Orders, reports, jobs, fees', columns: 'id, phone, name, status, eta, status_line', example: 'id,phone,name,status,eta\nK221,9876500000,Ravi,out for delivery,by 6 pm today' },
  { id: 'listings', label: 'Property listings', columns: 'id, title, area, bhk, price (84 lakh, 1.2 cr work)', example: 'title,area,bhk,price\n2BHK at Palm Grove,Gachibowli,2,84 lakh' },
]

/** Bring your catalog, order list or listings in from a CSV file, pasted text or a Google Sheet. */
export default function Import() {
  const { reloadConfig } = useAuth()
  const [kind, setKind] = useState<Kind>('catalog')
  const [csv, setCsv] = useState('')
  const [url, setUrl] = useState('')
  const [append, setAppend] = useState(false)
  const [preview, setPreview] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const k = KINDS.find(x => x.id === kind)!

  const body = (dryRun: boolean) => ({ kind, ...(url.trim() ? { url: url.trim() } : { csv }), mode: append ? 'append' : 'replace', dryRun })

  async function run(dryRun: boolean) {
    setBusy(true)
    try {
      const r = await api<Result>('/api/import', { method: 'POST', body: body(dryRun) })
      if (dryRun) setPreview(r)
      else { toast(`Imported ${r.imported} · ${r.total} in total${r.errors.length ? ` · ${r.errors.length} rows skipped` : ''}`); setPreview(null); await reloadConfig() }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  async function pickFile(f?: File) {
    if (!f) return
    if (f.size > 900 * 1024) return toast('File is larger than 900 KB')
    setCsv(await f.text()); setUrl(''); setPreview(null)
  }

  return (
    <>
      <TopBar title="Import" />
      <div className="segmented" role="tablist" style={{ marginBottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {KINDS.map(x => <button key={x.id} className={`chip${kind === x.id ? ' active' : ''}`} onClick={() => { setKind(x.id); setPreview(null) }} role="tab" aria-selected={kind === x.id}>{x.label}</button>)}
      </div>
      <p className="xs muted" style={{ marginBottom: 12 }}>Columns: {k.columns}. Column names can vary (Item, MRP, Qty…). Leave stock empty when you don't track it.</p>

      <div className="card stack" style={{ gap: 12 }}>
        <label className="btn" style={{ justifyContent: 'center' }}><FileUp size={16} /> Choose a CSV file<input type="file" accept=".csv,text/csv" hidden onChange={e => pickFile(e.target.files?.[0])} /></label>
        <Field label="…or a Google Sheet link" hint="In the sheet: Share → General access → Anyone with the link (Viewer)">
          <div className="row" style={{ gap: 8 }}><SheetIcon size={18} className="muted" /><input className="input" placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={e => { setUrl(e.target.value); setPreview(null) }} aria-label="Google Sheets link" /></div>
        </Field>
        <Field label="…or paste CSV">
          <textarea className="input mono xs" rows={6} placeholder={k.example} value={csv} onChange={e => { setCsv(e.target.value); setUrl(''); setPreview(null) }} aria-label="CSV text" />
        </Field>
        <div className="row between"><div><div className="small">Keep what's there and add / update</div><div className="xs muted">Off: replace the whole list</div></div><Toggle checked={append} onChange={setAppend} label="Append instead of replace" /></div>
        <button className="btn" disabled={busy || (!csv.trim() && !url.trim())} onClick={() => run(true)}>Preview</button>
      </div>

      {preview && (
        <div className="card stack section" style={{ gap: 8 }}>
          <h3>{preview.wouldImport} rows ready{preview.errors.length ? ` · ${preview.errors.length} will be skipped` : ''}</h3>
          <p className="xs muted">Matched columns: {preview.columns.join(', ')}</p>
          {preview.preview.map((p, i) => <p key={i} className="mono xs" style={{ wordBreak: 'break-all' }}>{JSON.stringify(p)}</p>)}
          {preview.errors.slice(0, 8).map(e => <p key={e.row} className="xs" style={{ color: 'var(--danger)' }}>Row {e.row}: {e.message}</p>)}
          <button className="btn primary" disabled={busy || !preview.wouldImport} onClick={() => run(false)}>{append ? 'Add' : 'Replace with'} {preview.wouldImport} rows</button>
        </div>
      )}
    </>
  )
}
