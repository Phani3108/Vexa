/** Restaurant: takeaway / delivery orders with an exact read-back total, and table reservations. */
import { NAME, INDIA, hours } from './common.js';

export default {
  id: 'restaurant',
  name: 'Restaurant & cloud kitchen',
  industry: 'restaurant',
  icon: 'utensils',
  replaces: ['product_inquiry'],
  description: 'Takes takeaway and delivery orders item by item with an exact total read back, books tables, and says what\'s sold out today.',
  guardrails: {
    refuse: [{
      id: 'allergen_guarantee',
      description: 'guaranteeing a dish is free of an allergen (nuts, gluten, dairy, egg)',
      keywords: ['nut free', 'gluten free', 'dairy free', 'egg free', 'peanut', 'allergy', 'allergic', 'lactose'],
      say: 'I can\'t promise anything about allergens over the phone — I\'ll ask the kitchen to call you back about that.'
    }]
  },
  flows: [
    {
      id: 'takeaway_order',
      name: 'Takeaway & delivery order',
      description: 'Item by item, with sold-out items flagged, an exact total read back, pickup or delivery.',
      icon: 'shopping-bag',
      priority: 2,
      maxTurns: 14,
      trigger: { keywords: ['order', 'parcel', 'takeaway', 'take away', 'pack', 'home delivery', 'deliver', 'delivery', 'khana', 'food', 'menu'] },
      slots: [
        { key: 'items', label: 'Order', type: 'order', prompt: 'What would you like to order?' },
        { key: 'mode', label: 'Pickup or delivery', type: 'choice', prompt: 'Is that for pickup or home delivery?', options: [
          { value: 'pickup', label: 'pickup', synonyms: ['pickup', 'pick up', 'collect', 'takeaway', 'take away', 'parcel', 'i will come', 'aake le', 'vachi teesukunta'] },
          { value: 'delivery', label: 'home delivery', synonyms: ['delivery', 'deliver', 'home delivery', 'bhej do', 'send it', 'ghar pe'] }
        ] },
        { key: 'address', label: 'Delivery address', type: 'address', prompt: 'What\'s the delivery address?' },
        { key: 'when', label: 'Ready by', type: 'datetime', prompt: 'What time should it be ready?' },
        NAME
      ],
      steps: [
        { id: 's1', type: 'collect', slot: 'items' },
        { id: 's2', type: 'say', text: '{{orderNote}}' },
        { id: 's3', type: 'collect', slot: 'mode' },
        { id: 's4', type: 'collect', slot: 'address', when: { slot: 'mode', is: 'delivery' } },
        { id: 's5', type: 'collect', slot: 'when' },
        { id: 's6', type: 'collect', slot: 'name' },
        { id: 's7', type: 'branch', when: { slot: 'mode', is: 'delivery' }, then: 's7d', else: 's7p' },
        { id: 's7d', type: 'confirm', text: 'So that\'s {{orderSummary}} — {{orderTotal}} in total, delivered to {{address}} {{when}}, for {{name}}. Shall I place the order?', recollect: ['items', 'address', 'when'] },
        { id: 's7g', type: 'goto', to: 's8' },
        { id: 's7p', type: 'confirm', text: 'So that\'s {{orderSummary}} — {{orderTotal}} in total, for pickup {{when}}, for {{name}}. Shall I place the order?', recollect: ['items', 'when'] },
        { id: 's8', type: 'action', action: 'create_lead', params: { kind: 'order' } },
        { id: 's9', type: 'action', action: 'notify_owner' },
        { id: 's10', type: 'end', text: 'Order placed, {{firstName}}! {{orderTotal}}, ready {{when}}. You can pay at the counter or on delivery. I\'m disconnecting the call now.' }
      ]
    },
    {
      id: 'booking',
      name: 'Table reservation',
      description: 'Party size, time and name — the restaurant confirms with one tap.',
      icon: 'calendar',
      priority: 2,
      trigger: { categories: ['booking.appointment'], keywords: ['table', 'reserve', 'reservation', 'book a table', 'booking', 'dinner for', 'lunch for', 'party of'] },
      slots: [
        { key: 'partySize', label: 'People', type: 'number', unit: 'people|persons|pax|log|members|guests', unitBefore: 'table for|party of|booking for|reservation for|dinner for|lunch for', prompt: 'Sure! For how many people?' },
        { key: 'when', label: 'Time', type: 'datetime', prompt: 'What day and time?' },
        NAME
      ],
      steps: [
        { id: 's1', type: 'collect', slot: 'partySize' },
        { id: 's2', type: 'collect', slot: 'when' },
        { id: 's3', type: 'collect', slot: 'name' },
        { id: 's4', type: 'confirm', text: 'A table for {{partySize}}, {{when}}, under {{name}} — shall I book it?', recollect: ['partySize', 'when'] },
        { id: 's5', type: 'action', action: 'book_request', params: { service: 'Table for {{partySize}}' } },
        { id: 's6', type: 'end', text: 'Done, {{firstName}} — table for {{partySize}}, {{when}}. The restaurant will confirm by text. I\'m disconnecting the call now.' }
      ]
    }
  ],
  sample: {
    ...INDIA,
    businessName: 'Spice Route Kitchen',
    description: 'North Indian restaurant and takeaway in Gachibowli.',
    address: 'Shop 7, DLF Road, Gachibowli, Hyderabad',
    directions: 'On DLF Road, opposite the petrol bunk. Free parking for two-wheelers.',
    upiId: 'spiceroute@okaxis',
    upiName: 'Spice Route Kitchen',
    hours: hours([[0, '12:00', '23:00'], [1, '12:00', '23:00'], [2, '12:00', '23:00'], [3, '12:00', '23:00'], [4, '12:00', '23:00'], [5, '12:00', '23:30'], [6, '12:00', '23:30']]),
    services: ['Dine-in', 'Takeaway', 'Home delivery within 5 km'],
    faqs: [
      { question: 'Do you deliver?', answer: 'Yes, home delivery within 5 km; free above ₹500.' },
      { question: 'Do you have Jain food?', answer: 'Yes, most curries can be made Jain on request.' }
    ],
    catalog: [
      { name: 'Paneer tikka', aliases: ['paneer tikka'], price: 240, veg: true, category: 'Starters', note: 'Contains dairy.' },
      { name: 'Chicken biryani', aliases: ['chicken biryani', 'biryani'], price: 320, veg: false, category: 'Mains' },
      { name: 'Veg biryani', aliases: ['veg biryani'], price: 260, veg: true, category: 'Mains' },
      { name: 'Dal makhani', aliases: ['dal makhani', 'dal'], price: 220, veg: true, category: 'Mains', note: 'Contains dairy.' },
      { name: 'Butter naan', aliases: ['butter naan', 'naan'], price: 60, veg: true, category: 'Breads' },
      { name: 'Tandoori roti', aliases: ['tandoori roti', 'roti', 'rotis'], price: 30, veg: true, category: 'Breads' },
      { name: 'Gulab jamun (2 pcs)', aliases: ['gulab jamun', 'jamun'], price: 90, veg: true, category: 'Desserts', note: 'Contains dairy and gluten.' },
      { name: 'Sweet lassi', aliases: ['lassi', 'sweet lassi'], price: 80, veg: true, category: 'Drinks' },
      { name: 'Mutton rogan josh', aliases: ['mutton rogan josh', 'rogan josh', 'mutton'], price: 380, veg: false, stock: 0, category: 'Mains' }
    ]
  }
};
