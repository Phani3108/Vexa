/** Clinic / diagnostics: doctor appointments, test prices and preparation, report status, emergencies. */
import { NAME, INDIA, hours, statusFlow } from './common.js';

export default {
  id: 'clinic',
  name: 'Clinic & diagnostics',
  industry: 'clinic',
  icon: 'stethoscope',
  replaces: ['product_inquiry'],
  description: 'Books doctor appointments, answers test prices and fasting rules, tells patients if their report is ready, and sends emergencies to 108 — never gives medical advice.',
  guardrails: {
    refuse: [{
      id: 'medical_advice',
      description: 'medical advice: diagnosis, which medicine or dose to take, whether symptoms are serious, stopping or changing medicines',
      keywords: ['which medicine', 'what medicine', 'which tablet', 'what tablet', 'what should i take', 'should i take', 'can i take', 'dose', 'dosage', 'is it serious', 'is this serious', 'stop my medicine', 'kaun si dawai', 'kaunsi dawai', 'kaun si dawa', 'dawai', 'dawa', 'goli', 'konsi tablet', 'mandu', 'marunthu', 'marundhu', 'oushadham', 'मेडिसिन', 'दवाई', 'दवा', 'మందు', 'மருந்து', 'മരുന്ന്'],
      say: 'I\'m sorry, I can\'t give medical advice on the phone — the doctor will help you with that at your appointment.'
    }]
  },
  flows: [
    {
      id: 'emergency',
      name: 'Medical emergency',
      description: 'Tells the caller to call 108 straight away, alerts the clinic, and connects the duty doctor if allowed.',
      icon: 'siren',
      priority: 1,
      trigger: { categories: ['urgent.emergency'], keywords: ['emergency', 'chest pain', 'heart attack', 'unconscious', 'not breathing', 'breathing problem', 'bleeding', 'stroke', 'fainted', 'seizure', 'accident', 'seene mein dard', 'behosh', 'saans nahi', 'khoon', 'gunde noppi', 'nenju vali'] },
      slots: [{ key: 'problem', label: 'What happened', type: 'text', prompt: 'What is happening?' }, { ...NAME, required: false }],
      steps: [
        { id: 's1', type: 'say', text: 'If this is a medical emergency, please call 108 right now or go to the nearest emergency room.' },
        { id: 's2', type: 'collect', slot: 'problem' },
        { id: 's3', type: 'action', action: 'create_lead', params: { kind: 'emergency', urgency: 'critical' } },
        { id: 's4', type: 'action', action: 'notify_owner', params: { urgent: true } },
        { id: 's5', type: 'branch', when: { cond: 'transfer_allowed' }, then: 's6', else: 's7' },
        { id: 's6', type: 'transfer', text: 'I am also connecting you to the duty doctor now. Transferring you now.' },
        { id: 's7', type: 'end', text: 'I have alerted the clinic. Please call 108 now. I\'m disconnecting the call now.' }
      ]
    },
    {
      id: 'booking',
      name: 'Doctor appointment',
      description: 'Books a consultation with the right doctor at the caller\'s preferred time; the clinic approves with one tap.',
      icon: 'calendar',
      priority: 2,
      trigger: { categories: ['booking.appointment'], keywords: ['appointment', 'book', 'booking', 'consultation', 'consult', 'see the doctor', 'doctor', 'checkup', 'check up', 'slot', 'opd'] },
      slots: [
        { key: 'service', label: 'Doctor', type: 'choice', prompt: 'Which doctor would you like to see — Dr Rao, our general physician, or Dr Meena Iyer, our diabetologist?', options: [
          { value: 'Dr Rao (general physician)', label: 'Dr Rao', synonyms: ['rao', 'general physician', 'general', 'physician', 'fever', 'cold', 'cough'] },
          { value: 'Dr Meena Iyer (diabetologist)', label: 'Dr Meena Iyer', synonyms: ['meena', 'iyer', 'diabetes', 'diabetologist', 'sugar', 'diabetic', 'thyroid'] }
        ] },
        { key: 'when', label: 'Preferred time', type: 'datetime', prompt: 'What day and time suits you?' },
        NAME
      ],
      steps: [
        { id: 's1', type: 'collect', slot: 'service' },
        { id: 's2', type: 'collect', slot: 'when' },
        { id: 's3', type: 'collect', slot: 'name' },
        { id: 's4', type: 'confirm', text: 'An appointment with {{service}}, {{when}}, for {{name}} — is that right?', recollect: ['service', 'when'] },
        { id: 's5', type: 'action', action: 'book_request' },
        { id: 's6', type: 'end', text: 'You\'re booked in, {{firstName}}. The clinic will confirm the exact time by text. Please bring any old reports. I\'m disconnecting the call now.' }
      ]
    },
    {
      id: 'test_info',
      name: 'Tests, prices & preparation',
      description: 'Quotes test prices and the clinic\'s own preparation rules (fasting etc.), then books the test.',
      icon: 'flask',
      priority: 2,
      trigger: { keywords: ['test', 'tests', 'blood test', 'fasting', 'fast', 'empty stomach', 'khali pet', 'package', 'health checkup', 'lab', 'sample', 'parikshan', 'pariksha', 'test price'] },
      slots: [
        { key: 'item', label: 'Test', type: 'text', prompt: 'Sure. Which test are you asking about?', opening: true },
        { key: 'wantBook', label: 'Book it', type: 'yesno', prompt: 'Would you like me to book it — at the centre or with home sample collection?' },
        { key: 'when', label: 'Preferred time', type: 'datetime', prompt: 'What day and time suits you? Sample collection is between 7 and 11 in the morning.' },
        NAME
      ],
      steps: [
        { id: 's1', type: 'collect', slot: 'item' },
        { id: 's2', type: 'lookup', source: 'catalog', mode: 'info' },
        { id: 's3', type: 'say', text: '{{availability}}' },
        { id: 's4', type: 'collect', slot: 'wantBook' },
        { id: 's5', type: 'branch', when: { slot: 'wantBook', is: true }, then: 's6', else: 's10' },
        { id: 's6', type: 'collect', slot: 'when' },
        { id: 's7', type: 'collect', slot: 'name' },
        { id: 's8', type: 'action', action: 'book_request', params: { service: 'Test: {{itemName}}' } },
        { id: 's9', type: 'end', text: 'Booked, {{firstName}}: {{itemName}}, {{when}}. The clinic will confirm by text. I\'m disconnecting the call now.' },
        { id: 's10', type: 'end', text: 'No problem. Thanks for calling {{biz}}. I\'m disconnecting the call now.' }
      ]
    },
    statusFlow({ id: 'report_status', name: 'Report status', description: 'Tells patients whether their report is ready — only to the phone number on the booking.', keywords: ['report', 'reports', 'result', 'results', 'report ready', 'report aaya', 'report kab', 'riport'], label: 'report', prompt: 'Sure. What is the report or receipt number?' })
  ],
  sample: {
    ...INDIA,
    businessName: 'Sunrise Diagnostics & Clinic',
    description: 'Neighbourhood clinic and diagnostic lab in Kondapur: consultations, blood tests, home sample collection.',
    address: 'Plot 12, Road 3, Kondapur, Hyderabad',
    directions: 'Opposite the Kondapur bus depot, first floor above the pharmacy. Lift available.',
    upiId: 'sunrisediagnostics@okicici',
    upiName: 'Sunrise Diagnostics',
    hours: hours([[1, '07:00', '21:00'], [2, '07:00', '21:00'], [3, '07:00', '21:00'], [4, '07:00', '21:00'], [5, '07:00', '21:00'], [6, '07:00', '21:00'], [0, '07:00', '13:00']]),
    services: ['General physician consultation — ₹500', 'Diabetes consultation — ₹700', 'Blood tests', 'Home sample collection — ₹150'],
    faqs: [
      { question: 'Do you accept insurance?', answer: 'We accept Star Health and ICICI Lombard cashless for consultations; tests are paid at the counter.' },
      { question: 'When are reports ready?', answer: 'Most blood test reports are ready the same evening by 7 pm, and we send them on WhatsApp.' },
      { question: 'Do you collect samples at home?', answer: 'Yes. Home sample collection is ₹150 within 5 km, between 7 and 11 am.' }
    ],
    catalog: [
      { name: 'Fasting blood sugar', aliases: ['blood sugar', 'sugar test', 'fbs', 'fasting sugar'], price: 100, category: 'Blood tests', note: 'You need an 8 to 10 hour fast; plain water is fine.' },
      { name: 'Lipid profile', aliases: ['lipid', 'cholesterol', 'cholesterol test'], price: 450, category: 'Blood tests', note: 'You need a 10 to 12 hour fast; plain water is fine.' },
      { name: 'HbA1c', aliases: ['hba1c', 'a1c', 'three month sugar', '3 month sugar'], price: 550, category: 'Blood tests', note: 'No fasting is needed.' },
      { name: 'Thyroid profile', aliases: ['thyroid', 'tsh', 't3 t4'], price: 500, category: 'Blood tests', note: 'No fasting is needed; come before taking your thyroid tablet.' },
      { name: 'Complete blood count', aliases: ['cbc', 'blood count', 'complete blood count'], price: 300, category: 'Blood tests', note: 'No fasting is needed.' },
      { name: 'Vitamin D', aliases: ['vitamin d', 'vit d'], price: 900, category: 'Blood tests', note: 'No fasting is needed.' }
    ],
    records: [
      { id: 'R1042', phone: '+919876500000', name: 'Ravi Kumar', status: 'ready', statusLine: 'Report R1042 is ready. It has been sent to your WhatsApp, and you can collect a printed copy at the counter.' },
      { id: 'R1043', phone: '+919812300000', name: 'Lakshmi', status: 'being processed', eta: 'today by 7 pm' }
    ]
  }
};
