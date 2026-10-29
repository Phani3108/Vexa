/** Kirana / hardware store: stock and price, home-delivery orders with a UPI payment link, order status. */
import { NAME, INDIA, hours, statusFlow } from './common.js';

export default {
  id: 'kirana',
  name: 'Kirana & hardware store',
  industry: 'retail',
  icon: 'store',
  description: 'Checks stock and price, takes home-delivery orders with an exact total, texts a UPI payment link, and tells customers where their order is.',
  guardrails: { refuse: [] },
  flows: [
    {
      id: 'home_order',
      name: 'Home delivery order',
      description: 'Several items, exact total, delivery address, then a UPI payment link (or cash on delivery).',
      icon: 'truck',
      priority: 2,
      maxTurns: 14,
      trigger: { keywords: ['home delivery', 'deliver', 'delivery', 'bhej do', 'bhejo', 'bhej dijiye', 'send', 'ghar pe', 'pampandi', 'pampinchandi', 'anuppunga', 'ayachu tharu', 'pathva', 'mokli do', 'order'] },
      slots: [
        { key: 'items', label: 'Order', type: 'order', prompt: 'Sure! What would you like delivered?' },
        { key: 'address', label: 'Delivery address', type: 'address', prompt: 'What\'s the delivery address?' },
        NAME
      ],
      steps: [
        { id: 's1', type: 'collect', slot: 'items' },
        { id: 's2', type: 'say', text: '{{orderNote}}' },
        { id: 's3', type: 'collect', slot: 'address' },
        { id: 's4', type: 'collect', slot: 'name' },
        { id: 's5', type: 'confirm', text: 'That\'s {{orderSummary}} — {{orderTotal}} in total, delivered to {{address}}. Shall I place the order?', recollect: ['items', 'address'] },
        { id: 's6', type: 'action', action: 'create_lead', params: { kind: 'order' } },
        { id: 's7', type: 'branch', when: { cond: 'has_upi' }, then: 's8', else: 's10' },
        { id: 's8', type: 'action', action: 'pay_link', params: { amount: '{{orderTotalValue}}', note: 'Order from {{biz}}' } },
        { id: 's9', type: 'end', text: 'Order placed, {{firstName}}! I\'ve texted a UPI payment link for {{orderTotal}} — or pay cash on delivery. It will reach you within two hours. I\'m disconnecting the call now.' },
        { id: 's10', type: 'end', text: 'Order placed, {{firstName}}! {{orderTotal}}, cash on delivery, within two hours. I\'m disconnecting the call now.' }
      ]
    },
    statusFlow({ id: 'order_status', name: 'Order status', description: 'Where is my order? Answered from your order list — only to the phone number on the order.', keywords: ['my order', 'order status', 'where is my order', 'order kab', 'kab aayega', 'kab ayega', 'delivery kab', 'track', 'not received', 'abhi tak nahi aaya'], label: 'order', prompt: 'Sure. What is the order number?' })
  ],
  sample: {
    ...INDIA,
    businessName: 'Sri Lakshmi Kirana & Hardware',
    description: 'Groceries, household and electrical items in Kondapur; home delivery within 3 km.',
    address: 'Shop 4, Main Road, Kondapur, Hyderabad',
    directions: 'Next to the Kondapur Ganesh temple.',
    upiId: 'srilakshmikirana@ybl',
    upiName: 'Sri Lakshmi Kirana',
    hours: hours([[0, '07:00', '13:00'], [1, '07:00', '22:00'], [2, '07:00', '22:00'], [3, '07:00', '22:00'], [4, '07:00', '22:00'], [5, '07:00', '22:00'], [6, '07:00', '22:00']]),
    services: ['Groceries', 'Household and electrical items', 'Home delivery within 3 km'],
    faqs: [
      { question: 'Do you deliver?', answer: 'Yes, free home delivery within 3 km for orders above ₹300, usually within two hours.' },
      { question: 'Do you accept UPI?', answer: 'Yes — UPI, cards and cash.' }
    ],
    catalog: [
      { name: '9W LED bulb', aliases: ['led bulb', 'bulb', 'bulbs'], price: 99, stock: 120 },
      { name: '1200mm ceiling fan', aliases: ['ceiling fan', 'fan', 'pankha'], price: 2450, stock: 8 },
      { name: 'Toor dal (1 kg)', aliases: ['toor dal', 'arhar dal', 'dal', 'kandi pappu', 'tuvaram paruppu'], price: 160, stock: 40 },
      { name: 'Sona masoori rice (5 kg)', aliases: ['rice', 'chawal', 'biyyam', 'arisi', 'sona masoori'], price: 420, stock: 25 },
      { name: 'Sunflower oil (1 L)', aliases: ['sunflower oil', 'oil', 'tel', 'nune', 'ennai'], price: 150, stock: 30 },
      { name: 'Wheat atta (5 kg)', aliases: ['atta', 'wheat flour', 'godhuma pindi'], price: 280, stock: 20 },
      { name: 'Sugar (1 kg)', aliases: ['sugar', 'cheeni', 'chakkera', 'sakkarai'], price: 48, stock: 50 },
      { name: 'Milk (500 ml)', aliases: ['milk', 'doodh', 'paalu', 'paal'], price: 30, stock: 0 }
    ],
    records: [
      { id: 'K221', phone: '+919876500000', name: 'Ravi', status: 'out for delivery', eta: 'by 6 pm today' }
    ]
  }
};
