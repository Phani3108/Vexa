/**
 * Import a catalog, records or listings from CSV — a file the owner uploads,
 * text they paste, or a Google Sheet link (File → Share → "Anyone with the link").
 *
 *   catalog   name, price, price_max, stock, unit, category, note, aliases (separated by ;), veg, duration
 *   records   id, phone, name, status, eta, status_line          (orders, reports, jobs, fees)
 *   listings  id, title, area, bhk, price                         (real estate)
 *
 * Column names are matched loosely ("Item", "Product", "MRP", "Rate" all work).
 * Only Google Sheets URLs are fetched (no other hosts), with a size and time limit.
 */

import userConfigService from './userConfigService.js';

const MAX_ROWS = 2000;
const MAX_BYTES = 900 * 1024;   // fits inside the API's 1 MB JSON body limit

const COLUMNS = {
  catalog: {
    name: ['name', 'item', 'product', 'service', 'test', 'dish', 'title'],
    price: ['price', 'rate', 'mrp', 'cost', 'fee', 'fees', 'amount'],
    priceMax: ['price_max', 'pricemax', 'max_price', 'price to', 'upto', 'max'],
    stock: ['stock', 'qty', 'quantity', 'in_stock', 'available'],
    unit: ['unit', 'per'],
    category: ['category', 'type', 'section', 'group'],
    note: ['note', 'notes', 'description', 'details', 'preparation'],
    aliases: ['aliases', 'alias', 'also_called', 'other_names', 'keywords'],
    veg: ['veg', 'vegetarian'],
    duration: ['duration', 'minutes', 'mins', 'time']
  },
  records: {
    id: ['id', 'reference', 'ref', 'order', 'order_id', 'order_no', 'report', 'job', 'student_id', 'number'],
    phone: ['phone', 'mobile', 'phone_number', 'contact', 'customer_phone'],
    name: ['name', 'customer', 'customer_name', 'patient', 'student'],
    status: ['status', 'state', 'stage'],
    eta: ['eta', 'expected', 'due', 'delivery_time', 'when'],
    statusLine: ['status_line', 'message', 'what_to_say', 'line']
  },
  listings: {
    id: ['id', 'ref', 'listing_id', 'code'],
    title: ['title', 'name', 'project', 'property'],
    area: ['area', 'location', 'locality', 'neighbourhood', 'neighborhood'],
    bhk: ['bhk', 'bedrooms', 'beds', 'config'],
    price: ['price', 'cost', 'amount', 'budget']
  }
};

/** RFC 4180-ish CSV: quotes, escaped quotes, commas and newlines inside quotes, CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}

const norm = h => String(h).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const num = v => {
  const t = String(v ?? '').replace(/[₹$,\s]|rs\.?|inr/gi, '');
  if (!t) return null;
  const lakh = /l(akh)?s?$/i.test(t), crore = /c(r|rore)s?$/i.test(t);
  const n = Number(t.replace(/(lakhs?|l|crores?|cr|c)$/i, ''));
  if (!Number.isFinite(n)) return NaN;
  return lakh ? n * 1e5 : crore ? n * 1e7 : n;
};

function mapHeader(kind, header) {
  const map = {};
  header.forEach((h, i) => {
    const key = norm(h);
    for (const [field, names] of Object.entries(COLUMNS[kind])) {
      if (map[field] == null && names.map(norm).includes(key)) { map[field] = i; break; }
    }
  });
  return map;
}

function rowsToItems(kind, rows) {
  if (rows.length < 2) throw Object.assign(new Error('The file needs a header row and at least one data row'), { status: 400 });
  if (rows.length - 1 > MAX_ROWS) throw Object.assign(new Error(`At most ${MAX_ROWS} rows at a time`), { status: 400 });
  const map = mapHeader(kind, rows[0]);
  const required = { catalog: ['name'], records: ['id'], listings: ['title', 'price'] }[kind];
  const missing = required.filter(f => map[f] == null);
  if (missing.length) throw Object.assign(new Error(`Missing column: ${missing.join(', ')}. Found: ${rows[0].join(', ')}`), { status: 400 });

  const items = [], errors = [];
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const get = f => (map[f] == null ? '' : String(r[map[f]] ?? '').trim());
    try {
      if (kind === 'catalog') {
        const name = get('name');
        if (!name) throw new Error('name is empty');
        const price = num(get('price')), priceMax = num(get('priceMax')), stock = num(get('stock'));
        if (Number.isNaN(price) || Number.isNaN(priceMax) || Number.isNaN(stock)) throw new Error('price, price_max and stock must be numbers');
        const item = { name: name.slice(0, 120) };
        if (price != null) item.price = price;
        if (priceMax != null && priceMax > (price || 0)) item.priceMax = priceMax;
        if (stock != null) item.stock = Math.max(0, Math.round(stock));
        for (const f of ['unit', 'category', 'note']) if (get(f)) item[f] = get(f).slice(0, f === 'note' ? 300 : 60);
        const aliases = get('aliases').split(/[;|]/).map(a => a.trim().toLowerCase()).filter(Boolean);
        item.aliases = [...new Set([name.toLowerCase(), ...aliases])].slice(0, 12);
        if (get('veg')) item.veg = /^(y|yes|true|1|veg)$/i.test(get('veg'));
        if (get('duration') && Number.isFinite(num(get('duration')))) item.duration = num(get('duration'));
        items.push(item);
      } else if (kind === 'records') {
        const id = get('id');
        if (!id) throw new Error('id is empty');
        const rec = { id: id.slice(0, 40), status: get('status').slice(0, 120) || 'in progress' };
        const phone = get('phone').replace(/[^\d+]/g, '');
        if (phone) rec.phone = phone.startsWith('+') ? phone : phone.length === 10 ? `${process.env.DEFAULT_COUNTRY_CODE || '+91'}${phone}` : `+${phone}`;
        for (const f of ['name', 'eta', 'statusLine']) if (get(f)) rec[f] = get(f).slice(0, f === 'statusLine' ? 300 : 120);
        items.push(rec);
      } else {
        const price = num(get('price')), bhk = num(get('bhk'));
        if (!get('title')) throw new Error('title is empty');
        if (!(price > 0)) throw new Error('price must be a number (e.g. 8400000, 84 lakh, 1.2 cr)');
        items.push({ id: (get('id') || `L${line}`).slice(0, 40), title: get('title').slice(0, 120), area: get('area').slice(0, 80), bhk: Number.isFinite(bhk) ? bhk : null, price });
      }
    } catch (e) {
      errors.push({ row: line, message: e.message });
    }
  });
  return { items, errors, columns: Object.keys(map) };
}

/** Only Google Sheets, turned into its CSV export URL. */
export function sheetCsvUrl(url) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'docs.google.com') return null;
  const m = u.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (!m) return null;
  const gid = u.searchParams.get('gid') || (u.hash.match(/gid=(\d+)/) || [])[1];
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
}

async function fetchSheet(url) {
  const csvUrl = sheetCsvUrl(url);
  if (!csvUrl) throw Object.assign(new Error('Only Google Sheets links are supported (docs.google.com/spreadsheets/…)'), { status: 400 });
  const res = await fetch(csvUrl, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!res.ok || !/text\/csv/.test(res.headers.get('content-type') || '')) {
    throw Object.assign(new Error('Could not read the sheet. In Google Sheets: Share → General access → Anyone with the link (Viewer).'), { status: 400 });
  }
  const text = await res.text();
  if (text.length > MAX_BYTES) throw Object.assign(new Error('The sheet is larger than 900 KB'), { status: 400 });
  return text;
}

/**
 * @param {{ kind: 'catalog'|'records'|'listings', csv?: string, url?: string, mode?: 'replace'|'append', dryRun?: boolean }} input
 */
export async function importData(userId, { kind, csv, url, mode = 'replace', dryRun = false }) {
  if (!COLUMNS[kind]) throw Object.assign(new Error('kind must be catalog, records or listings'), { status: 400 });
  const text = url ? await fetchSheet(url) : String(csv || '');
  if (!text.trim()) throw Object.assign(new Error('Paste CSV, upload a file or give a Google Sheets link'), { status: 400 });
  if (text.length > MAX_BYTES) throw Object.assign(new Error('The file is larger than 900 KB'), { status: 400 });
  const { items, errors, columns } = rowsToItems(kind, parseCsv(text));
  if (dryRun || !items.length) return { kind, imported: 0, wouldImport: items.length, errors, columns, preview: items.slice(0, 5) };

  const user = await userConfigService.getUser(userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  const key = kind === 'catalog' ? 'name' : 'id';
  const existing = mode === 'append' ? (user.businessProfile?.[kind] || []) : [];
  const merged = new Map(existing.map(x => [String(x[key]).toLowerCase(), x]));
  for (const it of items) merged.set(String(it[key]).toLowerCase(), it);   // same name / id: the new row wins
  const updated = await userConfigService.updateUser(userId, { [`businessProfile.${kind}`]: [...merged.values()] });
  if (!updated) throw Object.assign(new Error('Could not save'), { status: 500 });
  return { kind, imported: items.length, total: updated.businessProfile?.[kind]?.length || 0, errors, columns, preview: items.slice(0, 5) };
}

export default { importData, parseCsv, sheetCsvUrl };
