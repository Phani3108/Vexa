/** Real estate: qualify the buyer, match listings, book a site visit — never filter by religion, caste or diet. */
import { NAME, INDIA, hours } from './common.js';

const AREAS = ['Gachibowli', 'Kondapur', 'Kokapet', 'Narsingi', 'Nallagandla', 'Financial District', 'Miyapur', 'Tellapur'];

export default {
  id: 'real_estate',
  name: 'Real estate',
  industry: 'real_estate',
  icon: 'building',
  replaces: ['product_inquiry'],
  description: 'Qualifies buyers by size, budget and area, reads out the matching listings, and books site visits — and refuses discriminatory requests.',
  guardrails: {
    refuse: [{
      id: 'discriminatory_filter',
      description: 'filtering homes or neighbours by religion, caste, community, diet or similar',
      keywords: ['only hindu', 'only hindus', 'hindu only', 'only muslim', 'only muslims', 'muslim only', 'no muslims', 'no muslim', 'hindu society', 'hindu area', 'muslim area', 'muslim society', 'christian area', 'christian only', 'jain only', 'jain society', 'caste', 'same community', 'our community', 'community only', 'brahmin', 'brahmins', 'veg only', 'veg only society', 'vegetarian only', 'vegetarians only', 'only vegetarians', 'only veg families', 'no non veg', 'no non-veg', 'no non vegetarians'],
      say: 'I\'m sorry, we don\'t filter homes by religion, caste, community or diet. I\'m happy to match by budget, size and area.'
    }]
  },
  flows: [
    {
      id: 'property_enquiry',
      name: 'Property enquiry & site visit',
      description: 'Bedrooms, budget and area, matching listings read out, then a site visit booking.',
      icon: 'building',
      priority: 2,
      trigger: { categories: ['customer.new_inquiry'], keywords: ['flat', 'flats', 'apartment', 'bhk', '1bhk', '2bhk', '3bhk', 'villa', 'plot', 'property', 'buy', 'site visit', 'ghar', 'makaan', 'illu', 'veedu', 'listing'] },
      slots: [
        { key: 'bhk', label: 'Bedrooms', type: 'number', unit: 'bhk|bedroom|bedrooms|bed', prompt: 'Sure! How many bedrooms are you looking for?' },
        { key: 'budget', label: 'Budget', type: 'amount', prompt: 'And what\'s your budget?' },
        { key: 'area', label: 'Area', type: 'choice', prompt: 'Any preferred area — Gachibowli, Kondapur, Kokapet, or anywhere nearby?', required: false, options: [
          ...AREAS.map(a => ({ value: a, synonyms: [a.toLowerCase()] })),
          { value: 'anywhere', label: 'Anywhere', synonyms: ['anywhere', 'any area', 'no preference', 'kahin bhi', 'ekkadaina'] }
        ] },
        { key: 'visit', label: 'Site visit', type: 'yesno', prompt: 'Would you like to book a site visit?' },
        { key: 'when', label: 'Visit time', type: 'datetime', prompt: 'Which day suits you for the visit?' },
        NAME
      ],
      steps: [
        { id: 's1', type: 'collect', slot: 'bhk' },
        { id: 's2', type: 'collect', slot: 'budget' },
        { id: 's3', type: 'collect', slot: 'area' },
        { id: 's4', type: 'lookup', source: 'listings', match: { bhk: 'bhk', budget: 'budget', area: 'area' } },
        { id: 's5', type: 'say', text: '{{matchesLine}}' },
        { id: 's6', type: 'branch', when: { cond: 'has_matches' }, then: 's7', else: 's12' },
        { id: 's7', type: 'collect', slot: 'visit' },
        { id: 's8', type: 'branch', when: { slot: 'visit', is: true }, then: 's9', else: 's12' },
        { id: 's9', type: 'collect', slot: 'when' },
        { id: 's10', type: 'collect', slot: 'name' },
        { id: 's11', type: 'action', action: 'book_request', params: { service: 'Site visit: {{matchIds}}' } },
        { id: 's11b', type: 'end', text: 'Booked, {{firstName}} — a site visit {{when}}. Our agent will call to confirm. I\'m disconnecting the call now.' },
        { id: 's12', type: 'action', action: 'create_lead', params: { kind: 'buyer' } },
        { id: 's13', type: 'end', text: 'Thanks! Our agent will call you with more options. I\'m disconnecting the call now.' }
      ]
    }
  ],
  sample: {
    ...INDIA,
    businessName: 'Skyline Homes Realty',
    description: 'Resale and new apartments in west Hyderabad.',
    address: 'Office 5, Skyview Towers, Gachibowli, Hyderabad',
    directions: 'Ground floor of Skyview Towers, next to the Gachibowli flyover.',
    hours: hours([[0, '10:00', '18:00'], [1, '10:00', '19:00'], [2, '10:00', '19:00'], [3, '10:00', '19:00'], [4, '10:00', '19:00'], [5, '10:00', '19:00'], [6, '10:00', '19:00']]),
    services: ['Resale apartments', 'New launches', 'Home loan help'],
    faqs: [
      { question: 'Are your projects RERA registered?', answer: 'Yes, every new project we list is RERA registered, and we share the number on request.' },
      { question: 'Do you help with home loans?', answer: 'Yes, we work with SBI, HDFC and ICICI for home loans.' }
    ],
    listings: [
      { id: 'L1', title: '2BHK at Lakeview Residency', area: 'Nallagandla', bhk: 2, price: 7800000 },
      { id: 'L2', title: '2BHK resale at Palm Grove Towers', area: 'Gachibowli', bhk: 2, price: 8400000 },
      { id: 'L3', title: '2BHK at Sunrise Heights', area: 'Narsingi', bhk: 2, price: 9200000 },
      { id: 'L4', title: '3BHK at Orchid Enclave', area: 'Kokapet', bhk: 3, price: 16500000 },
      { id: 'L5', title: '1BHK at Green Leaf Apartments', area: 'Kondapur', bhk: 1, price: 4800000 }
    ]
  }
};
