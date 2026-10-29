/** Coaching / school: admissions enquiries, fees and batch timings, demo classes, fee status. */
import { NAME, INDIA, hours, statusFlow } from './common.js';

export default {
  id: 'coaching',
  name: 'Coaching & school',
  industry: 'other',
  icon: 'graduation-cap',
  replaces: ['product_inquiry'],
  description: 'Answers admissions questions with your fees and batch timings, books free demo classes, and tells parents about fee dues — without promising marks or ranks.',
  guardrails: {
    refuse: [{
      id: 'result_guarantee',
      description: 'guaranteeing marks, ranks, selection or placement',
      keywords: ['guarantee', 'guaranteed', '100% result', 'sure selection', 'rank guarantee', 'pakka selection', 'confirm seat', 'sure shot'],
      say: 'We can\'t promise marks or selection — results depend on each student\'s own preparation. Our counsellor can share last year\'s results with you.'
    }]
  },
  flows: [
    {
      id: 'admissions',
      name: 'Admissions & demo class',
      description: 'Course fees and batch timings from your list, then a free demo class booking.',
      icon: 'graduation-cap',
      priority: 2,
      trigger: { categories: ['customer.new_inquiry', 'booking.appointment'], keywords: ['admission', 'admissions', 'join', 'course', 'batch', 'batches', 'classes', 'tuition', 'coaching', 'fees', 'demo class', 'class 10', 'class 12', 'jee', 'neet', 'spoken english', 'maths', 'science'] },
      slots: [
        { key: 'course', label: 'Course', type: 'text', prompt: 'Sure! Which course or class are you asking about?', opening: true },
        { key: 'wantDemo', label: 'Demo class', type: 'yesno', prompt: 'Would you like to book a free demo class?' },
        { key: 'when', label: 'Demo time', type: 'datetime', prompt: 'Which day suits you for the demo?' },
        { ...NAME, label: 'Student name', prompt: 'And the student\'s name?' }
      ],
      steps: [
        { id: 's1', type: 'collect', slot: 'course' },
        { id: 's2', type: 'lookup', source: 'catalog', mode: 'info', of: 'course' },
        { id: 's3', type: 'say', text: '{{availability}}' },
        { id: 's4', type: 'collect', slot: 'wantDemo' },
        { id: 's5', type: 'branch', when: { slot: 'wantDemo', is: true }, then: 's6', else: 's10' },
        { id: 's6', type: 'collect', slot: 'when' },
        { id: 's7', type: 'collect', slot: 'name' },
        { id: 's8', type: 'action', action: 'book_request', params: { service: 'Demo class: {{itemName}}' } },
        { id: 's9', type: 'end', text: 'Booked — a free demo class for {{firstName}}, {{when}}. We\'ll text the details. I\'m disconnecting the call now.' },
        { id: 's10', type: 'action', action: 'create_lead', params: { kind: 'enquiry' } },
        { id: 's11', type: 'end', text: 'No problem. Our counsellor will call you with more details. I\'m disconnecting the call now.' }
      ]
    },
    statusFlow({ id: 'fee_status', name: 'Fee status', description: 'Fee dues for a student — only to the registered parent number.', keywords: ['fee due', 'fees due', 'fee status', 'pending fee', 'fee paid', 'how much fee is pending', 'fees baaki'], label: 'student ID', prompt: 'Sure. What is the student ID?' })
  ],
  sample: {
    ...INDIA,
    businessName: 'Bright Minds Academy',
    description: 'Coaching for Class 9–12, JEE and NEET foundation, and spoken English in Ameerpet.',
    address: '3rd floor, Annapurna Block, Ameerpet, Hyderabad',
    directions: 'Two minutes from Ameerpet metro, exit B.',
    upiId: 'brightminds@okicici',
    upiName: 'Bright Minds Academy',
    hours: hours([[1, '07:00', '20:30'], [2, '07:00', '20:30'], [3, '07:00', '20:30'], [4, '07:00', '20:30'], [5, '07:00', '20:30'], [6, '07:00', '20:30']]),
    services: ['Class 9–12 coaching', 'JEE / NEET foundation', 'Spoken English'],
    faqs: [
      { question: 'Do you have online classes?', answer: 'Yes, every batch has a live online option at the same fee.' },
      { question: 'What is the batch size?', answer: 'At most 25 students per batch.' }
    ],
    catalog: [
      { name: 'Class 10 Maths (CBSE)', aliases: ['class 10 maths', '10th maths', 'maths', 'math', 'ganit'], price: 2500, unit: 'month', note: 'Batches: Monday, Wednesday, Friday 5 to 6:30 pm, or Tuesday, Thursday, Saturday 7 to 8:30 am.' },
      { name: 'Class 10 Science (CBSE)', aliases: ['class 10 science', '10th science', 'science'], price: 2500, unit: 'month', note: 'Batches: Tuesday, Thursday, Saturday 5 to 6:30 pm.' },
      { name: 'JEE foundation (Class 9–10)', aliases: ['jee foundation', 'jee', 'iit foundation'], price: 4000, unit: 'month', note: 'Weekend batch: Saturday and Sunday 9 am to 1 pm.' },
      { name: 'NEET crash course', aliases: ['neet', 'neet crash course'], price: 35000, note: 'A 3-month course starting the first Monday of every month.' },
      { name: 'Spoken English', aliases: ['spoken english', 'english speaking', 'english'], price: 1500, unit: 'month', note: 'Evening batches daily 7 to 8 pm.' }
    ],
    records: [
      { id: 'S1024', phone: '+919876500000', name: 'Ananya', status: '₹2,500 due for November', statusLine: 'Ananya\'s fee of ₹2,500 for November is due by the 10th. You can pay at the office or by UPI.' }
    ]
  }
};
