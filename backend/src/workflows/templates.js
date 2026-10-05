/**
 * Built-in workflows ("flows").
 *
 * A flow is a small state machine the receptionist follows turn by turn:
 *   slots  — the facts to collect (typed, so they can be extracted from any utterance)
 *   steps  — collect / confirm / say / branch / action / transfer / end / goto
 *
 * Templates use {{slot}} and {{biz}}, {{owner}}, {{ownerFirst}}, {{nextOpen}},
 * {{bookingUrl}}, {{address}}, {{deliveryNote}} placeholders.
 * Owners can edit any of this in the app; these are the starting points.
 */

const NAME = { key: 'name', label: 'Name', type: 'name', prompt: 'Could I get your name, please?', reprompt: 'Sorry, what was your name?', prefill: 'caller_name' };
const CALLBACK = { key: 'callback', label: 'Callback number', type: 'phone', prompt: 'What is the best number to call you back on?', prefill: 'caller_number' };

// ─────────────────────────────────────────────────────────────────────────────
// Business (SME) flows
// ─────────────────────────────────────────────────────────────────────────────

const BUSINESS = [
  {
    id: 'emergency',
    name: 'Emergency',
    description: 'Gets the problem and address in two questions, alerts you, and transfers the call.',
    icon: 'siren',
    priority: 1,
    trigger: { categories: ['urgent.emergency'], keywords: ['emergency', 'urgent', 'flooding', 'burst', 'leak', 'no heat', 'gas smell', 'sparking', 'fire', 'accident'] },
    slots: [
      { key: 'problem', label: 'Problem', type: 'text', prompt: 'I can help right away. What is happening?' },
      { key: 'address', label: 'Address', type: 'address', prompt: 'What is the address?' },
      NAME
    ],
    steps: [
      { id: 's1', type: 'collect', slot: 'problem' },
      { id: 's2', type: 'collect', slot: 'address' },
      { id: 's3', type: 'collect', slot: 'name' },
      { id: 's4', type: 'action', action: 'create_lead', params: { kind: 'emergency', urgency: 'critical' } },
      { id: 's5', type: 'action', action: 'notify_owner', params: { urgent: true } },
      { id: 's6', type: 'branch', when: { cond: 'transfer_allowed' }, then: 's7', else: 's8' },
      { id: 's7', type: 'transfer', text: 'Thanks {{firstName}}. I am connecting you to the team now. Transferring you now.' },
      { id: 's8', type: 'end', text: 'Thanks {{firstName}}. I have flagged this as urgent and the team is being alerted right now. If anyone is in danger, please call 911. I\'m disconnecting the call now.' }
    ]
  },
  {
    id: 'lead_intake',
    name: 'New customer / quote',
    description: 'Qualifies new customers: what they need, when, who — then texts them a confirmation.',
    icon: 'sparkles',
    priority: 2,
    trigger: { categories: ['customer.new_inquiry'], keywords: ['quote', 'estimate', 'price', 'pricing', 'how much', 'cost', 'interested', 'looking for', 'need a', 'do you offer', 'do you do', 'install', 'repair'] },
    slots: [
      { key: 'need', label: 'Needs', type: 'text', prompt: 'Happy to help. What do you need help with?' },
      NAME,
      { key: 'timing', label: 'Timing', type: 'datetime', prompt: 'When would you like this done?' },
      CALLBACK
    ],
    steps: [
      { id: 's1', type: 'collect', slot: 'need' },
      { id: 's2', type: 'collect', slot: 'name' },
      { id: 's3', type: 'collect', slot: 'timing' },
      { id: 's4', type: 'confirm', text: 'Great. So that is {{need}}, {{timing}}, for {{name}}. Did I get that right?', recollect: ['need', 'timing'] },
      { id: 's5', type: 'action', action: 'create_lead', params: { kind: 'quote' } },
      { id: 's6', type: 'action', action: 'send_sms', params: { template: 'Hi {{firstName}}, thanks for calling {{biz}}! We got your request ({{need}}) and will call you back {{timing}}.' } },
      { id: 's7', type: 'action', action: 'notify_owner' },
      { id: 's8', type: 'end', text: 'Perfect, {{firstName}}. The team will call you back shortly, and I have texted you a confirmation. Thanks for calling {{biz}}! I\'m disconnecting the call now.' }
    ]
  },
  {
    id: 'booking',
    name: 'Book an appointment',
    description: 'Collects the service and preferred time, offers your booking link, and creates a booking request you approve with one tap.',
    icon: 'calendar',
    priority: 2,
    trigger: { categories: ['booking.appointment'], keywords: ['appointment', 'book', 'booking', 'schedule', 'reservation', 'reserve', 'availability', 'available slot'] },
    slots: [
      { key: 'service', label: 'Service', type: 'text', prompt: 'Sure! What would you like to book?' },
      { key: 'when', label: 'Preferred time', type: 'datetime', prompt: 'What day and time works best for you?' },
      NAME
    ],
    steps: [
      { id: 's1', type: 'collect', slot: 'service' },
      { id: 's2', type: 'collect', slot: 'when' },
      { id: 's3', type: 'collect', slot: 'name' },
      { id: 's4', type: 'confirm', text: '{{service}}, {{when}}, under {{name}} — is that right?', recollect: ['service', 'when'] },
      { id: 's5', type: 'action', action: 'book_request' },
      { id: 's6', type: 'branch', when: { cond: 'has_booking_url' }, then: 's7', else: 's8' },
      { id: 's7', type: 'action', action: 'send_sms', params: { template: 'Hi {{firstName}}, {{biz}} here. We have your request for {{service}} ({{when}}). Want it instantly? Book here: {{bookingUrl}}' } },
      { id: 's8', type: 'end', text: 'You are all set, {{firstName}}. I have requested {{when}} for you, and the team will confirm by text shortly. I\'m disconnecting the call now.' }
    ]
  },
  {
    id: 'reschedule',
    name: 'Reschedule / cancel',
    description: 'Handles changes to existing appointments.',
    icon: 'calendar-clock',
    priority: 2,
    trigger: { keywords: ['reschedule', 'cancel', 'move my appointment', 'change my appointment', 'push back', 'running late'] },
    slots: [
      NAME,
      { key: 'current', label: 'Current appointment', type: 'datetime', prompt: 'When is your current appointment?' },
      { key: 'change', label: 'Change', type: 'choice', prompt: 'Would you like to reschedule or cancel?', options: [{ value: 'reschedule', synonyms: ['move', 'change', 'different time', 'another time'] }, { value: 'cancel', synonyms: ['cancel it', 'call it off'] }] },
      { key: 'newTime', label: 'New time', type: 'datetime', prompt: 'What new time works for you?' }
    ],
    steps: [
      { id: 's1', type: 'collect', slot: 'name' },
      { id: 's2', type: 'collect', slot: 'current' },
      { id: 's3', type: 'collect', slot: 'change' },
      { id: 's4', type: 'branch', when: { slot: 'change', is: 'cancel' }, then: 's7', else: 's5' },
      { id: 's5', type: 'collect', slot: 'newTime' },
      { id: 's6', type: 'action', action: 'book_request', params: { kind: 'reschedule' } },
      { id: 's6b', type: 'end', text: 'Got it, {{firstName}}. I have requested to move your {{current}} appointment to {{newTime}}. The team will confirm by text. I\'m disconnecting the call now.' },
      { id: 's7', type: 'action', action: 'book_request', params: { kind: 'cancel' } },
      { id: 's8', type: 'end', text: 'No problem, {{firstName}}. I have noted the cancellation for {{current}}. I\'m disconnecting the call now.' }
    ]
  },
  {
    id: 'product_inquiry',
    name: 'Product availability & price',
    description: 'Checks your catalog live: stock, unit price and total for the quantity asked, then offers to reserve it.',
    icon: 'shopping-bag',
    priority: 2,
    trigger: { keywords: ['in stock', 'available', 'availability', 'do you have', 'do you sell', 'price of', 'how much is', 'cost of', 'stock', 'buy', 'pieces', 'units'] },
    slots: [
      { key: 'item', label: 'Item', type: 'text', prompt: 'Sure! Which item are you looking for?', opening: true },
      { key: 'quantity', label: 'Quantity', type: 'number', prompt: 'How many do you need?' },
      { key: 'reserve', label: 'Reserve', type: 'yesno', prompt: 'Would you like me to reserve them for you to pick up?' },
      NAME
    ],
    steps: [
      { id: 's1', type: 'collect', slot: 'item' },
      { id: 's2', type: 'collect', slot: 'quantity' },
      { id: 's3', type: 'lookup', source: 'catalog' },
      { id: 's4', type: 'say', text: '{{availability}}' },
      { id: 's5', type: 'branch', when: { cond: 'item_in_stock' }, then: 's6', else: 's11' },
      { id: 's6', type: 'collect', slot: 'reserve' },
      { id: 's7', type: 'branch', when: { slot: 'reserve', is: true }, then: 's8', else: 's12' },
      { id: 's8', type: 'collect', slot: 'name' },
      { id: 's9', type: 'action', action: 'create_lead', params: { kind: 'order' } },
      { id: 's10', type: 'end', text: 'Done! I have reserved {{reservedQty}} units of the {{itemName}} under {{firstName}} — {{total}} in total, payable at pickup. See you soon! I\'m disconnecting the call now.' },
      { id: 's11', type: 'action', action: 'create_lead', params: { kind: 'restock' } },
      { id: 's11b', type: 'end', text: 'Thanks for calling {{biz}} — we will be in touch soon. I\'m disconnecting the call now.' },
      { id: 's12', type: 'end', text: 'No problem! Thanks for calling {{biz}}. I\'m disconnecting the call now.' }
    ]
  },
  {
    id: 'info_request',
    name: 'Address, directions & hours',
    description: 'Answers where you are, how to get there and when you are open — then checks if there is anything else.',
    icon: 'map-pin',
    priority: 3,
    trigger: { keywords: ['where are you', 'address', 'located', 'location', 'directions', 'how do i reach', 'how to reach', 'how do i get', 'how to get', 'landmark', 'opening hours', 'timings', 'open on', 'open today', 'what time do you'] },
    slots: [
      { key: 'more', label: 'Anything else', type: 'text', prompt: 'Is there anything else I can help you with?', required: false }
    ],
    steps: [
      { id: 's1', type: 'collect', slot: 'more' },
      { id: 's2', type: 'end', text: 'Happy to help. See you soon at {{biz}}! I\'m disconnecting the call now.' }
    ]
  },
  {
    id: 'existing_customer',
    name: 'Existing customer / support',
    description: 'Takes a precise support message with any order or job reference.',
    icon: 'life-buoy',
    priority: 3,
    trigger: { categories: ['customer.existing'], keywords: ['my order', 'invoice', 'refund', 'complaint', 'follow up', 'following up', 'last week', 'warranty', 'still broken', 'not working'] },
    slots: [
      NAME,
      { key: 'issue', label: 'Issue', type: 'text', prompt: 'I am sorry to hear that. What is going on?' },
      { key: 'reference', label: 'Reference', type: 'text', prompt: 'Do you have an order or job number? It is fine if not.', required: false }
    ],
    steps: [
      { id: 's1', type: 'collect', slot: 'issue' },
      { id: 's2', type: 'collect', slot: 'name' },
      { id: 's3', type: 'collect', slot: 'reference' },
      { id: 's4', type: 'action', action: 'create_lead', params: { kind: 'support' } },
      { id: 's5', type: 'action', action: 'notify_owner' },
      { id: 's6', type: 'end', text: 'Thanks {{firstName}}, I have passed this straight to the team and someone will call you back today. I\'m disconnecting the call now.' }
    ]
  },
  {
    id: 'job_applicant',
    name: 'Job applicant',
    description: 'Points applicants to email without taking your time.',
    icon: 'briefcase',
    priority: 5,
    trigger: { categories: ['jobs.applicant'], keywords: ['hiring', 'job', 'position', 'resume', 'vacancy', 'apply', 'work for you'] },
    slots: [{ key: 'role', label: 'Role', type: 'text', prompt: 'Thanks for your interest! Which role are you interested in?' }, NAME],
    steps: [
      { id: 's1', type: 'collect', slot: 'role' },
      { id: 's2', type: 'collect', slot: 'name' },
      { id: 's3', type: 'end', text: 'Thanks {{firstName}}! Please email your resume{{emailHint}} and mention the {{role}} role. I\'m disconnecting the call now.' }
    ]
  },
  {
    id: 'sales_shutdown',
    name: 'Sales & spam shutdown',
    description: 'Ends sales pitches and robocalls in one turn.',
    icon: 'shield',
    priority: 6,
    trigger: { categories: ['business.sales', 'spam.robocall'], keywords: ['seo', 'marketing services', 'google listing', 'merchant services', 'business loan', 'funding', 'warranty', 'you have won', 'press 1', 'final notice', 'credit card processing'] },
    slots: [],
    steps: [
      { id: 's1', type: 'action', action: 'tag_spam' },
      { id: 's2', type: 'end', text: 'Thanks, but we are not interested. Please send any details by email. I\'m disconnecting the call now.' }
    ]
  },
  {
    id: 'general_message',
    name: 'Take a message',
    description: 'Fallback for anything else: who, what, and when to call back.',
    icon: 'message',
    priority: 9,
    trigger: { isDefault: true, keywords: [] },
    slots: [
      { key: 'reason', label: 'Reason', type: 'text', prompt: 'How can we help you today?' },
      NAME,
      { key: 'callbackTime', label: 'Best time', type: 'datetime', prompt: 'When is a good time for a callback?' }
    ],
    steps: [
      { id: 's1', type: 'collect', slot: 'reason' },
      { id: 's2', type: 'collect', slot: 'name' },
      { id: 's3', type: 'collect', slot: 'callbackTime' },
      { id: 's4', type: 'action', action: 'create_lead', params: { kind: 'message' } },
      { id: 's5', type: 'end', text: 'Thanks {{firstName}}, I have passed that on and you will get a call back {{callbackTime}}. I\'m disconnecting the call now.' }
    ]
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// Personal flows
// ─────────────────────────────────────────────────────────────────────────────

const PERSONAL = [
  {
    id: 'p_emergency',
    name: 'Emergency',
    description: 'Breaks through Focus and transfers immediately.',
    icon: 'siren',
    priority: 1,
    trigger: { keywords: ['emergency', 'urgent', 'hospital', 'accident', 'police', 'fire', 'ambulance'] },
    slots: [NAME, { key: 'problem', label: 'What happened', type: 'text', prompt: 'What has happened?' }],
    steps: [
      { id: 's1', type: 'collect', slot: 'name' },
      { id: 's2', type: 'collect', slot: 'problem' },
      { id: 's3', type: 'action', action: 'notify_owner', params: { urgent: true } },
      { id: 's4', type: 'transfer', text: 'Okay {{firstName}}, I am getting {{ownerFirst}} on the line right now. Transferring you now.' }
    ]
  },
  {
    id: 'p_delivery',
    name: 'Deliveries',
    description: 'Finds out where the courier is, guides them to your door, briefs them for the security gate, and hands off to you only for OTPs.',
    icon: 'package',
    priority: 2,
    trigger: { categories: ['delivery.food', 'delivery.package', 'delivery.grocery'], keywords: ['delivery', 'deliver', 'package', 'parcel', 'courier', 'order', 'amazon', 'flipkart', 'ups', 'fedex', 'usps', 'dhl', 'doordash', 'uber eats', 'swiggy', 'zomato', 'instacart', 'blinkit', 'zepto', 'dunzo', 'bigbasket'] },
    slots: [
      { key: 'company', label: 'Company', type: 'company', prompt: 'Which company is the delivery from?' },
      { key: 'location', label: 'Courier location', type: 'text', prompt: 'Sure, I will guide you. Where are you right now?', opening: false },
      { key: 'needsCode', label: 'Needs OTP / signature', type: 'yesno', prompt: 'Do you need an OTP or a signature from {{ownerFirst}}?' }
    ],
    steps: [
      { id: 's1', type: 'collect', slot: 'company' },
      { id: 's2', type: 'collect', slot: 'location' },
      { id: 's3', type: 'say', text: '{{directions}}', generate: 'directions' },
      { id: 's4', type: 'say', text: '{{securityLine}}' },
      { id: 's5', type: 'collect', slot: 'needsCode' },
      { id: 's6', type: 'branch', when: { slot: 'needsCode', is: true }, then: 's7', else: 's8' },
      { id: 's7', type: 'transfer', text: 'No problem, I am connecting you to {{ownerFirst}} for the OTP right now. Transferring you now.' },
      { id: 's8', type: 'action', action: 'notify_owner', params: { quiet: true } },
      { id: 's9', type: 'end', text: 'Perfect, thank you! See you soon. I\'m disconnecting the call now.' }
    ]
  },
  {
    id: 'p_loan',
    name: 'Bank & loan offers',
    description: 'Screens bank and loan calls: gets the offer details, asks for the rate and tenure, and negotiates the rate down before taking a message.',
    icon: 'banknote',
    priority: 3,
    trigger: { categories: ['business.sales'], keywords: ['personal loan', 'loan', 'pre-approved', 'preapproved', 'bank', 'interest rate', 'emi', 'credit card', 'home loan', 'top-up'] },
    slots: [
      { key: 'bank', label: 'Bank', type: 'company', prompt: 'May I know which bank you are calling from?' },
      { key: 'product', label: 'Offer', type: 'choice', prompt: 'What is the offer about — a personal loan, a credit card, or something else?', options: [{ value: 'personal loan', synonyms: ['loan', 'personal'] }, { value: 'credit card', synonyms: ['card'] }, { value: 'other', synonyms: ['insurance', 'investment', 'something else'] }] },
      { key: 'amount', label: 'Amount', type: 'text', prompt: 'What loan amount is being offered?', opening: false },
      { key: 'rate', label: 'Interest rate (%)', type: 'number', prompt: 'And what is the interest rate?' },
      { key: 'tenure', label: 'Tenure', type: 'text', prompt: 'For what tenure?' },
      { key: 'finalRate', label: 'Negotiated rate', type: 'text', prompt: '{{rate}} percent is on the high side. Could you bring it down to {{counterRate}} percent?' }
    ],
    steps: [
      { id: 's1', type: 'collect', slot: 'bank' },
      { id: 's2', type: 'collect', slot: 'product' },
      { id: 's3', type: 'branch', when: { slot: 'product', is: 'personal loan' }, then: 's4', else: 's10' },
      { id: 's4', type: 'collect', slot: 'amount' },
      { id: 's5', type: 'collect', slot: 'rate' },
      { id: 's6', type: 'collect', slot: 'tenure' },
      { id: 's7', type: 'collect', slot: 'finalRate' },
      { id: 's8', type: 'action', action: 'create_lead', params: { kind: 'offer' } },
      { id: 's9', type: 'end', text: 'Thank you. Please send the final offer — {{amount}} at {{finalRate}} for {{tenure}} — by SMS. {{ownerFirst}} will review it and call back only if interested. I\'m disconnecting the call now.' },
      { id: 's10', type: 'action', action: 'tag_spam' },
      { id: 's11', type: 'end', text: 'Thanks, but {{ownerFirst}} is not interested. Please remove this number from your list. I\'m disconnecting the call now.' }
    ]
  },
  {
    id: 'p_vip',
    name: 'VIPs & family',
    description: 'Greets trusted contacts by name. If you are free, offers to put them through; if you are in Focus, tells them when you will be free and alerts you.',
    icon: 'heart',
    priority: 2,
    trigger: { cond: 'is_vip', keywords: [] },
    slots: [
      { key: 'reason', label: 'Reason', type: 'text', prompt: 'Hi {{firstName}}! What is it about?' },
      { key: 'putThrough', label: 'Wants to talk now', type: 'yesno', prompt: 'Do you want me to put you through to {{ownerFirst}} now?' }
    ],
    steps: [
      { id: 's1', type: 'collect', slot: 'reason' },
      { id: 's2', type: 'branch', when: { cond: 'focus_mode' }, then: 's6', else: 's3' },
      { id: 's3', type: 'collect', slot: 'putThrough' },
      { id: 's4', type: 'branch', when: { slot: 'putThrough', is: true }, then: 's5', else: 's6' },
      { id: 's5', type: 'transfer', text: 'Of course. Transferring you now.' },
      { id: 's6', type: 'action', action: 'notify_owner', params: { priority: true } },
      { id: 's7', type: 'action', action: 'create_lead', params: { kind: 'message', priority: true } },
      { id: 's8', type: 'end', text: '{{ownerFirst}} is busy right now and will be available {{availableAt}}. I have passed your message on, so please reach {{ownerFirst}} then. I\'m disconnecting the call now.' }
    ]
  },
  {
    id: 'p_spam',
    name: 'Spam & sales shield',
    description: 'One question, then gone. Average under 12 seconds.',
    icon: 'shield',
    priority: 3,
    trigger: { categories: ['spam.telemarketing'], keywords: ['insurance', 'warranty', 'survey', 'prize', 'you have won', 'lottery', 'promotional', 'press 1', 'final notice', 'medicare', 'kyc', 'otp'] },
    slots: [],
    steps: [
      { id: 's1', type: 'action', action: 'tag_spam' },
      { id: 's2', type: 'end', text: 'Thanks, but not interested. Please remove this number from your list. I\'m disconnecting the call now.' }
    ]
  },
  {
    id: 'p_appointment',
    name: 'Appointments & reminders',
    description: 'Doctor offices, salons and services calling to confirm or reschedule.',
    icon: 'calendar',
    priority: 4,
    trigger: { keywords: ['appointment', 'confirm your', 'reminder', 'reschedule', 'office calling', 'clinic', 'dentist'] },
    slots: [
      { key: 'org', label: 'Calling from', type: 'company', prompt: 'Who is calling, please?' },
      { key: 'details', label: 'Details', type: 'text', prompt: 'What would you like me to pass on?' }
    ],
    steps: [
      { id: 's1', type: 'collect', slot: 'org' },
      { id: 's2', type: 'collect', slot: 'details' },
      { id: 's3', type: 'action', action: 'create_lead', params: { kind: 'message' } },
      { id: 's4', type: 'end', text: 'Thank you, I will pass that to {{ownerFirst}} right away. I\'m disconnecting the call now.' }
    ]
  },
  {
    id: 'p_screen',
    name: 'Unknown callers',
    description: 'Who is it, what is it about, is it urgent? Then a message or a transfer.',
    icon: 'user-search',
    priority: 9,
    trigger: { isDefault: true, keywords: [] },
    slots: [
      NAME,
      { key: 'reason', label: 'Reason', type: 'text', prompt: 'And what is the call about?', opening: true },
      { key: 'urgent', label: 'Urgent', type: 'yesno', prompt: 'Is it urgent?' }
    ],
    steps: [
      { id: 's1', type: 'collect', slot: 'name' },
      { id: 's2', type: 'collect', slot: 'reason' },
      { id: 's3', type: 'collect', slot: 'urgent' },
      { id: 's4', type: 'branch', when: { all: [{ slot: 'urgent', is: true }, { cond: 'transfer_allowed' }] }, then: 's5', else: 's6' },
      { id: 's5', type: 'transfer', text: 'Okay, let me see if {{ownerFirst}} can pick up. Transferring you now.' },
      { id: 's6', type: 'action', action: 'create_lead', params: { kind: 'message' } },
      { id: 's7', type: 'end', text: 'Thanks {{firstName}}, I will make sure {{ownerFirst}} gets your message. I\'m disconnecting the call now.' }
    ]
  }
];

function stamp(list, mode) {
  return list.map(w => ({ enabled: true, builtIn: true, mode, maxTurns: 10, ...structuredClone(w) }));
}

export function defaultWorkflows(accountType = 'business') {
  return accountType === 'personal' ? stamp(PERSONAL, 'personal') : stamp(BUSINESS, 'business');
}

export function builtInWorkflow(id) {
  return [...stamp(BUSINESS, 'business'), ...stamp(PERSONAL, 'personal')].find(w => w.id === id) || null;
}
