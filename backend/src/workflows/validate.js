/**
 * Validation for owner-edited workflows — a broken flow must never reach a live call.
 */

const SLOT_TYPES = ['text', 'name', 'phone', 'email', 'datetime', 'yesno', 'number', 'choice', 'company', 'address'];
const STEP_TYPES = ['collect', 'confirm', 'say', 'branch', 'action', 'transfer', 'end', 'goto', 'lookup'];
const ACTIONS = ['create_lead', 'book_request', 'send_sms', 'notify_owner', 'tag_spam'];
const CONDS = ['business_open', 'is_vip', 'focus_mode', 'has_booking_url', 'transfer_allowed', 'item_in_stock'];

export function validateWorkflow(w) {
  const errors = [];
  if (!w || typeof w !== 'object') return ['Workflow must be an object'];
  if (!/^[a-z0-9_.-]{2,60}$/i.test(w.id || '')) errors.push('id must be 2-60 letters, numbers, dot, dash or underscore');
  if (!w.name || String(w.name).length > 80) errors.push('name is required (max 80 chars)');
  if (!Array.isArray(w.slots)) errors.push('slots must be an array');
  if (!Array.isArray(w.steps) || w.steps.length === 0) errors.push('steps must be a non-empty array');
  if (errors.length) return errors;

  const slotKeys = new Set();
  for (const s of w.slots) {
    if (!/^[a-zA-Z][\w]{0,40}$/.test(s.key || '')) errors.push(`slot key "${s.key}" is invalid`);
    if (slotKeys.has(s.key)) errors.push(`duplicate slot "${s.key}"`);
    slotKeys.add(s.key);
    if (!SLOT_TYPES.includes(s.type)) errors.push(`slot "${s.key}" has unknown type "${s.type}"`);
    if (!s.prompt) errors.push(`slot "${s.key}" needs a question to ask`);
    if (s.type === 'choice' && !(s.options || []).length) errors.push(`choice slot "${s.key}" needs options`);
  }

  const stepIds = new Set(w.steps.map(s => s.id));
  if (stepIds.size !== w.steps.length) errors.push('step ids must be unique');
  let terminal = false;
  for (const st of w.steps) {
    if (!STEP_TYPES.includes(st.type)) { errors.push(`step "${st.id}" has unknown type "${st.type}"`); continue; }
    if (st.type === 'collect' && !slotKeys.has(st.slot)) errors.push(`step "${st.id}" collects unknown slot "${st.slot}"`);
    if (['say', 'confirm'].includes(st.type) && !st.text) errors.push(`step "${st.id}" needs text`);
    if (st.type === 'action' && !ACTIONS.includes(st.action)) errors.push(`step "${st.id}" has unknown action "${st.action}"`);
    if (st.type === 'branch') {
      for (const t of [st.then, st.else]) if (t && !stepIds.has(t)) errors.push(`branch "${st.id}" jumps to missing step "${t}"`);
      const when = st.when || {};
      const conds = [when, ...(when.all || []), ...(when.any || [])].filter(c => c.cond);
      for (const c of conds) if (!CONDS.includes(c.cond)) errors.push(`branch "${st.id}" uses unknown condition "${c.cond}"`);
    }
    if (st.type === 'goto' && !stepIds.has(st.to)) errors.push(`goto "${st.id}" targets missing step "${st.to}"`);
    if (st.type === 'confirm') for (const k of st.recollect || []) if (!slotKeys.has(k)) errors.push(`confirm "${st.id}" recollects unknown slot "${k}"`);
    if (st.type === 'end' || st.type === 'transfer') terminal = true;
  }
  if (!terminal) errors.push('a flow needs at least one end or transfer step');
  return errors;
}

export function sanitizeWorkflow(w) {
  const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : v);
  return {
    id: w.id,
    name: clip(w.name, 80),
    description: clip(w.description || '', 300),
    icon: clip(w.icon || 'workflow', 30),
    priority: Math.min(Math.max(Number(w.priority) || 5, 1), 10),
    enabled: w.enabled !== false,
    builtIn: !!w.builtIn,
    mode: w.mode || 'business',
    maxTurns: Math.min(Math.max(Number(w.maxTurns) || 10, 2), 20),
    trigger: {
      keywords: (w.trigger?.keywords || []).map(k => clip(String(k), 60)).slice(0, 40),
      categories: (w.trigger?.categories || []).slice(0, 10),
      ...(w.trigger?.isDefault ? { isDefault: true } : {}),
      ...(w.trigger?.cond ? { cond: w.trigger.cond } : {})
    },
    slots: w.slots.map(s => ({
      key: s.key, label: clip(s.label || s.key, 60), type: s.type, prompt: clip(s.prompt, 300),
      ...(s.reprompt ? { reprompt: clip(s.reprompt, 300) } : {}),
      ...(s.required === false ? { required: false } : {}),
      ...(s.prefill ? { prefill: s.prefill } : {}),
      ...(s.options ? { options: s.options.slice(0, 10) } : {})
    })),
    steps: w.steps.map(st => ({ ...st, ...(st.text ? { text: clip(st.text, 500) } : {}) }))
  };
}
