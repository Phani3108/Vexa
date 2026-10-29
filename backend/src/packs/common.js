/** Pieces shared by business packs. */

export const NAME = { key: 'name', label: 'Name', type: 'name', prompt: 'Could I get your name, please?', reprompt: 'Sorry, what was your name?', prefill: 'caller_name' };

const HYD = 'Asia/Kolkata';
export const INDIA = { currency: 'INR', timezone: HYD };

/** Open every day with the given hours ([day, open, close], day 0 = Sunday). Missing days are closed. */
export function hours(rows) {
  const byDay = new Map(rows.map(([day, open, close]) => [day, { day, open, close, closed: false }]));
  return [0, 1, 2, 3, 4, 5, 6].map(day => byDay.get(day) || { day, open: '09:00', close: '18:00', closed: true });
}

/** A records-lookup flow: status of an order / report / job / fee by reference, or by the caller's own number. */
export function statusFlow({ id, name, description, keywords, label, prompt }) {
  return {
    id, name, description, icon: 'search', priority: 2,
    trigger: { keywords },
    slots: [
      { key: 'reference', label: `${label.charAt(0).toUpperCase()}${label.slice(1)} number`, type: 'text', prompt, required: false, opening: false },
      { ...NAME, required: false }
    ],
    steps: [
      { id: 's1', type: 'lookup', source: 'records', by: 'reference', label },
      { id: 's2', type: 'branch', when: { cond: 'record_found' }, then: 's6', else: 's3' },
      { id: 's3', type: 'collect', slot: 'reference' },
      { id: 's4', type: 'collect', slot: 'name' },
      { id: 's5', type: 'lookup', source: 'records', by: 'reference', label },
      { id: 's6', type: 'say', text: '{{recordLine}}' },
      { id: 's7', type: 'branch', when: { cond: 'record_found' }, then: 's9', else: 's8' },
      { id: 's8', type: 'action', action: 'create_lead', params: { kind: 'support' } },
      { id: 's9', type: 'end', text: 'Thanks for calling {{biz}}. I\'m disconnecting the call now.' }
    ]
  };
}
