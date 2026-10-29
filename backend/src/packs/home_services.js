/** Home services: job booking with price ranges, safety-first emergencies, technician ETA. */
import { NAME, INDIA, hours, statusFlow } from './common.js';

export default {
  id: 'home_services',
  name: 'Home services',
  industry: 'home_services',
  icon: 'wrench',
  replaces: ['product_inquiry'],
  description: 'Books AC, plumbing, electrical and appliance jobs with the usual price range, gives safety steps for gas, sparks and floods, and tells customers when the technician will arrive.',
  guardrails: {
    refuse: [{
      id: 'fixed_quote',
      description: 'promising a fixed final price before the technician inspects',
      keywords: ['exact price', 'final price', 'fixed price', 'pakka price', 'guarantee the price', 'exact amount', 'final amount'],
      say: 'I can only give the usual price range — the technician confirms the final price after checking.'
    }]
  },
  flows: [
    {
      id: 'emergency',
      name: 'Emergency (gas, sparks, flooding)',
      description: 'Safety steps first, then the address, then an urgent alert and transfer.',
      icon: 'siren',
      priority: 1,
      trigger: { categories: ['urgent.emergency'], keywords: ['emergency', 'gas leak', 'gas smell', 'sparking', 'sparks', 'short circuit', 'fire', 'smoke', 'flooding', 'burst', 'pipe burst', 'current', 'shock', 'aag', 'dhuan'] },
      slots: [{ key: 'address', label: 'Address', type: 'address', prompt: 'What is the address?' }, { ...NAME, required: false }],
      steps: [
        { id: 's1', type: 'say', text: 'Please stay safe first: if you smell gas, close the gas valve, don\'t touch any switches and open the windows. For sparks or a short circuit, switch off the main power. For flooding, close the main water valve.' },
        { id: 's2', type: 'collect', slot: 'address' },
        { id: 's3', type: 'action', action: 'create_lead', params: { kind: 'emergency', urgency: 'critical' } },
        { id: 's4', type: 'action', action: 'notify_owner', params: { urgent: true } },
        { id: 's5', type: 'branch', when: { cond: 'transfer_allowed' }, then: 's6', else: 's7' },
        { id: 's6', type: 'transfer', text: 'Connecting you to our emergency technician now. Transferring you now.' },
        { id: 's7', type: 'end', text: 'I have flagged this as urgent and the team is being alerted now. If anyone is in danger, call 101 for fire or 112. I\'m disconnecting the call now.' }
      ]
    },
    {
      id: 'lead_intake',
      name: 'Book a service visit',
      description: 'The problem, the usual price range, a time and the address — booked as a request you approve.',
      icon: 'wrench',
      priority: 2,
      trigger: { categories: ['customer.new_inquiry', 'booking.appointment'], keywords: ['service', 'repair', 'not working', 'not cooling', 'leaking', 'leak', 'install', 'installation', 'technician', 'plumber', 'electrician', 'ac', 'kharab', 'chal nahi raha', 'book'] },
      slots: [
        { key: 'problem', label: 'Job', type: 'text', prompt: 'Sure! What needs fixing?', opening: true },
        { key: 'when', label: 'Preferred time', type: 'datetime', prompt: 'When would you like the technician to come?' },
        { key: 'address', label: 'Address', type: 'address', prompt: 'What\'s the address?' },
        NAME
      ],
      steps: [
        { id: 's1', type: 'collect', slot: 'problem' },
        { id: 's2', type: 'lookup', source: 'catalog', mode: 'info', of: 'problem' },
        { id: 's3', type: 'say', text: '{{availability}}' },
        { id: 's4', type: 'collect', slot: 'when' },
        { id: 's5', type: 'collect', slot: 'address' },
        { id: 's6', type: 'collect', slot: 'name' },
        { id: 's7', type: 'confirm', text: 'A technician visit for {{itemName}}, {{when}}, at {{address}}, for {{name}} — shall I book it?', recollect: ['when', 'address'] },
        { id: 's8', type: 'action', action: 'book_request', params: { service: '{{problem}}' } },
        { id: 's9', type: 'end', text: 'Booked, {{firstName}}. The team will confirm the technician by text. I\'m disconnecting the call now.' }
      ]
    },
    statusFlow({ id: 'job_status', name: 'Technician on the way?', description: 'Where is my technician? Answered from your job list.', keywords: ['technician', 'where is the technician', 'kab aayega', 'kab ayega', 'kab tak', 'on the way', 'eta', 'abhi tak nahi aaya', 'not come', 'not arrived', 'job status'], label: 'job', prompt: 'Sure. What is the job or booking number?' })
  ],
  sample: {
    ...INDIA,
    businessName: 'CoolFix Home Services',
    description: 'AC, plumbing, electrical and appliance repairs across west Hyderabad.',
    address: 'Plot 22, Hitech City Road, Hyderabad',
    directions: 'We come to you — no need to visit.',
    upiId: 'coolfix@okhdfcbank',
    upiName: 'CoolFix',
    hours: hours([[0, '09:00', '18:00'], [1, '08:00', '21:00'], [2, '08:00', '21:00'], [3, '08:00', '21:00'], [4, '08:00', '21:00'], [5, '08:00', '21:00'], [6, '08:00', '21:00']]),
    services: ['AC service and repair', 'Plumbing', 'Electrical', 'Washing machine and RO repair'],
    faqs: [
      { question: 'Is there a visit charge?', answer: 'The visit charge is ₹199, adjusted in the bill if you go ahead with the repair.' },
      { question: 'Do you give a warranty?', answer: 'Yes, 30 days on service and 90 days on spare parts we fit.' }
    ],
    catalog: [
      { name: 'AC service', aliases: ['ac service', 'ac servicing', 'ac cleaning', 'ac wash'], price: 599, priceMax: 799 },
      { name: 'AC gas refill', aliases: ['gas refill', 'gas filling', 'ac gas', 'gas charging'], price: 1800, priceMax: 2500 },
      { name: 'AC repair', aliases: ['ac repair', 'ac not cooling', 'ac kharab', 'ac not working', 'water dripping'], price: 499, priceMax: 3000 },
      { name: 'Plumber visit', aliases: ['plumber', 'leak', 'tap', 'pipe', 'blockage', 'drain'], price: 299, priceMax: 1500 },
      { name: 'Electrician visit', aliases: ['electrician', 'switch', 'wiring', 'fan repair', 'mcb'], price: 299, priceMax: 1500 },
      { name: 'Washing machine repair', aliases: ['washing machine'], price: 399, priceMax: 2500 },
      { name: 'RO service', aliases: ['ro service', 'water purifier', 'ro', 'filter change'], price: 499, priceMax: 1200 }
    ],
    records: [
      { id: 'J5531', phone: '+919876500000', name: 'Ravi', status: 'assigned to Arjun', statusLine: 'Your technician Arjun is on the way and about 20 minutes away.' }
    ]
  }
};
