/** Salon / spa: book one or more services with a stylist, with prices and the total. */
import { NAME, INDIA, hours } from './common.js';

export default {
  id: 'salon',
  name: 'Salon & spa',
  industry: 'salon',
  icon: 'scissors',
  replaces: ['product_inquiry'],
  description: 'Books haircuts, colour, facials and more with the stylist of choice, quotes each price and the total, and handles reschedules.',
  guardrails: {
    refuse: [{
      id: 'treatment_safety',
      description: 'judging whether a treatment is safe for an allergy, skin condition or pregnancy',
      keywords: ['allergy', 'allergic', 'rash', 'pregnant', 'pregnancy', 'skin problem', 'is it safe', 'side effect', 'side effects'],
      say: 'For allergies, skin conditions or pregnancy we always do a free patch test first, and the stylist will advise you in person.'
    }]
  },
  flows: [
    {
      id: 'booking',
      name: 'Book services',
      description: 'One or more services, an optional stylist, a time — read back with the total.',
      icon: 'calendar',
      priority: 2,
      trigger: { categories: ['booking.appointment'], keywords: ['appointment', 'book', 'booking', 'haircut', 'hair cut', 'facial', 'colour', 'color', 'beard', 'massage', 'spa', 'slot', 'baal'] },
      slots: [
        { key: 'service', label: 'Services', type: 'order', prompt: 'Which services would you like to book — for example a haircut, beard trim, colour or facial?' },
        { key: 'stylist', label: 'Stylist', type: 'choice', prompt: 'Any stylist you prefer — Rahul, Priya or Imran? Or whoever is free?', required: false, options: [
          { value: 'Rahul', synonyms: ['rahul'] }, { value: 'Priya', synonyms: ['priya'] }, { value: 'Imran', synonyms: ['imran'] },
          { value: 'any stylist', label: 'Any stylist', synonyms: ['anyone', 'any', 'whoever', 'no preference', 'koi bhi', 'evarina', 'yaaraavathu'] }
        ] },
        { key: 'when', label: 'Preferred time', type: 'datetime', prompt: 'What day and time works for you?' },
        NAME
      ],
      steps: [
        { id: 's1', type: 'collect', slot: 'service' },
        { id: 's2', type: 'collect', slot: 'stylist' },
        { id: 's3', type: 'collect', slot: 'when' },
        { id: 's4', type: 'collect', slot: 'name' },
        { id: 's5', type: 'confirm', text: '{{orderSummary}} with {{stylist}}, {{when}}, for {{name}} — {{orderTotal}} in total. Shall I book it?', recollect: ['service', 'when'] },
        { id: 's6', type: 'action', action: 'book_request', params: { service: '{{orderSummary}} with {{stylist}} ({{orderTotal}})' } },
        { id: 's7', type: 'end', text: 'Booked, {{firstName}}! See you {{when}}. The salon will confirm by text. I\'m disconnecting the call now.' }
      ]
    }
  ],
  sample: {
    ...INDIA,
    businessName: 'Glow Studio Unisex Salon',
    description: 'Unisex salon in Madhapur: haircuts, colour, beard, facials and head massage.',
    address: '2nd floor, Cyber Plaza, Madhapur, Hyderabad',
    directions: 'Next to the Madhapur metro station, exit C. Parking in the basement.',
    upiId: 'glowstudio@ybl',
    upiName: 'Glow Studio',
    hours: hours([[1, '10:00', '21:00'], [2, '10:00', '21:00'], [3, '10:00', '21:00'], [4, '10:00', '21:00'], [5, '10:00', '21:00'], [6, '09:00', '22:00'], [0, '09:00', '22:00']]),
    services: ['Haircut — from ₹300', 'Beard trim — ₹150', 'Hair colour — ₹1,500', 'Facial — ₹1,200', 'Head massage — ₹400'],
    faqs: [
      { question: 'Do you take walk-ins?', answer: 'Yes, but weekends get busy, so booking is best.' },
      { question: 'Do you have a women\'s section?', answer: 'Yes, we have a separate women\'s section with women stylists.' }
    ],
    catalog: [
      { name: 'Haircut (men)', aliases: ['haircut', 'hair cut', 'cutting', 'baal katna', 'men haircut'], price: 300, duration: 30 },
      { name: 'Haircut (women)', aliases: ['ladies haircut', 'women haircut', 'women\'s haircut'], price: 600, duration: 45 },
      { name: 'Beard trim', aliases: ['beard', 'beard trim', 'dadhi', 'shave'], price: 150, duration: 15 },
      { name: 'Hair colour', aliases: ['colour', 'color', 'hair color', 'hair colour', 'global colour'], price: 1500, duration: 90 },
      { name: 'Facial', aliases: ['facial', 'cleanup', 'clean up'], price: 1200, duration: 60 },
      { name: 'Head massage', aliases: ['head massage', 'champi', 'oil massage'], price: 400, duration: 30 }
    ]
  }
};
