/**
 * Industry templates for SME accounts.
 *
 * Each template seeds call-handling categories, sample services and FAQs so a
 * business gets a working AI receptionist in under a minute. Everything is
 * editable afterwards in the dashboard.
 */

const BASE_BUSINESS_CATEGORIES = [
  {
    id: 'urgent.emergency',
    label: 'Urgent / Emergency',
    keywords: ['emergency', 'urgent', 'asap', 'right now', 'flooding', 'leak', 'broken down', 'accident'],
    action: 'connect_user',
    instructions: 'Stay calm and reassuring. Get their name and the address or nature of the problem in one sentence, then transfer.',
    notify: true,
    priority: 1
  },
  {
    id: 'customer.new_inquiry',
    label: 'New Customer Inquiry',
    keywords: ['price', 'pricing', 'quote', 'estimate', 'how much', 'do you offer', 'services', 'interested', 'available'],
    action: 'take_message',
    instructions: 'Answer their questions using the business information and FAQs. Then collect their name, what they need, and the best time to call back. Confirm the callback number they are calling from is the best one.',
    notify: true,
    priority: 2
  },
  {
    id: 'booking.appointment',
    label: 'Appointment / Booking',
    keywords: ['appointment', 'book', 'booking', 'schedule', 'reschedule', 'cancel', 'reservation', 'availability'],
    action: 'take_message',
    instructions: 'If a booking link is available, tell them they can book online and offer to note their preferred date and time as well. Collect name, service wanted, and preferred date/time. Never confirm a specific slot yourself.',
    notify: true,
    priority: 2
  },
  {
    id: 'customer.existing',
    label: 'Existing Customer / Order Status',
    keywords: ['my order', 'invoice', 'follow up', 'following up', 'my appointment', 'already booked', 'last week', 'refund', 'complaint'],
    action: 'take_message',
    instructions: 'Apologise for any inconvenience. Collect their name, order or job reference if they have one, and what they need. Promise a callback.',
    notify: true,
    priority: 3
  },
  {
    id: 'business.vendor',
    label: 'Vendor / Supplier / Partner',
    keywords: ['supplier', 'vendor', 'delivery for the shop', 'invoice from', 'partnership', 'wholesale'],
    action: 'take_message',
    instructions: 'Take their name, company, and the purpose of the call.',
    notify: true,
    priority: 4
  },
  {
    id: 'jobs.applicant',
    label: 'Job Applicant',
    keywords: ['job', 'hiring', 'position', 'resume', 'vacancy', 'apply', 'work for you'],
    action: 'follow_instructions',
    instructions: 'Thank them for their interest. Ask them to email their resume to the business email if one is listed, otherwise take their name and the role they want.',
    notify: false,
    priority: 5
  },
  {
    id: 'business.sales',
    label: 'Sales / Solicitation',
    keywords: ['seo', 'marketing services', 'google listing', 'merchant services', 'business loan', 'funding', 'credit card processing', 'advertising'],
    action: 'end_call',
    instructions: 'Politely say the business is not interested and they can send details by email. End the call.',
    notify: false,
    priority: 6
  },
  {
    id: 'spam.robocall',
    label: 'Spam / Robocall',
    keywords: ['warranty', 'you have won', 'prize', 'irs', 'social security', 'press 1', 'final notice'],
    action: 'end_call',
    instructions: 'Decline and end the call immediately.',
    notify: false,
    priority: 7
  }
];

const DEFAULT_WEEK = [0, 1, 2, 3, 4, 5, 6].map(day => ({
  day,
  open: '09:00',
  close: '17:00',
  closed: day === 0 || day === 6
}));

export const INDUSTRIES = {
  home_services: {
    label: 'Home services (plumbing, HVAC, electrical, cleaning)',
    services: ['Emergency repairs', 'Installations', 'Maintenance plans', 'Free estimates'],
    faqs: [
      { question: 'Do you offer free estimates?', answer: 'Yes, estimates are free. We just need your address and a short description of the job.' },
      { question: 'What areas do you serve?', answer: 'We serve the city and surrounding areas — tell us your zip code and we will confirm.' },
      { question: 'Are you licensed and insured?', answer: 'Yes, we are fully licensed and insured.' }
    ],
    extraKeywords: { 'urgent.emergency': ['no heat', 'no hot water', 'burst pipe', 'sparking', 'gas smell'], 'customer.new_inquiry': ['estimate', 'install', 'repair'] }
  },
  clinic: {
    label: 'Clinic / dental / wellness',
    services: ['New patient visits', 'Check-ups and cleanings', 'Follow-up appointments'],
    faqs: [
      { question: 'Are you accepting new patients?', answer: 'Yes, we are accepting new patients.' },
      { question: 'Which insurance do you accept?', answer: 'We accept most major insurance plans. Share your provider and we will confirm.' }
    ],
    overrides: {
      'urgent.emergency': {
        label: 'Medical Emergency',
        action: 'follow_instructions',
        instructions: 'If this is a medical emergency, tell them to hang up and call 911 (or the local emergency number) immediately. Do not give medical advice.'
      }
    },
    extraCategories: [
      {
        id: 'patient.prescription',
        label: 'Prescription / Results',
        keywords: ['prescription', 'refill', 'test results', 'lab results', 'medication'],
        action: 'take_message',
        instructions: 'Never share medical information. Take their full name, date of birth, and what they need, and let them know the care team will call back.',
        notify: true,
        priority: 2
      }
    ]
  },
  salon: {
    label: 'Salon / spa / beauty',
    services: ['Haircuts', 'Colour', 'Nails', 'Massage'],
    faqs: [
      { question: 'Do you take walk-ins?', answer: 'Walk-ins are welcome when we have availability, but booking ahead is recommended.' },
      { question: 'What is your cancellation policy?', answer: 'Please give us at least 24 hours notice to cancel or reschedule.' }
    ]
  },
  restaurant: {
    label: 'Restaurant / cafe',
    services: ['Dine-in', 'Takeout', 'Catering', 'Private events'],
    faqs: [
      { question: 'Do you take reservations?', answer: 'Yes, we take reservations. Tell me your name, party size, date and time and we will confirm.' },
      { question: 'Do you have vegetarian options?', answer: 'Yes, we have several vegetarian dishes on the menu.' }
    ],
    extraCategories: [
      {
        id: 'orders.takeout',
        label: 'Takeout / Catering Order',
        keywords: ['order', 'takeout', 'pickup', 'catering', 'to go'],
        action: 'take_message',
        instructions: 'Let them know orders are confirmed by staff. Take their name, the order or catering request, and pickup time.',
        notify: true,
        priority: 2
      }
    ]
  },
  professional: {
    label: 'Professional services (legal, accounting, consulting)',
    services: ['Initial consultation', 'Ongoing advisory', 'Document preparation'],
    faqs: [
      { question: 'Do you offer a free consultation?', answer: 'We offer an initial consultation — I can take your details so the team can schedule it.' }
    ],
    overrides: {
      'customer.new_inquiry': {
        label: 'New Client Intake',
        instructions: 'Collect their name, a one-line summary of their matter, and the best time to call back. Do not give legal, tax or financial advice.'
      }
    }
  },
  real_estate: {
    label: 'Real estate / property management',
    services: ['Buying', 'Selling', 'Rentals', 'Property management'],
    faqs: [
      { question: 'Is the property still available?', answer: 'I will note the property you are asking about and an agent will confirm availability.' }
    ],
    extraCategories: [
      {
        id: 'tenant.maintenance',
        label: 'Tenant Maintenance Request',
        keywords: ['tenant', 'landlord', 'maintenance request', 'unit', 'apartment'],
        action: 'take_message',
        instructions: 'Collect the tenant name, unit/address, and the issue. If it is an emergency such as flooding, fire or no heat, transfer immediately.',
        notify: true,
        priority: 2
      }
    ]
  },
  auto: {
    label: 'Auto repair / dealership',
    services: ['Oil change', 'Diagnostics', 'Brakes', 'Tires'],
    faqs: [
      { question: 'Is my car ready?', answer: 'I will take your name and vehicle and the service desk will call you with an update.' }
    ]
  },
  retail: {
    label: 'Retail / e-commerce',
    services: ['In-store shopping', 'Online orders', 'Returns and exchanges'],
    faqs: [
      { question: 'What is your return policy?', answer: 'Returns are accepted within 30 days with a receipt.' }
    ]
  },
  other: {
    label: 'Other',
    services: [],
    faqs: []
  }
};

export function industryList() {
  return Object.entries(INDUSTRIES).map(([id, t]) => ({ id, label: t.label }));
}

/**
 * Build the seeded profile + categories for an industry.
 */
export function buildIndustryTemplate(industryId = 'other') {
  const t = INDUSTRIES[industryId] || INDUSTRIES.other;

  const categories = BASE_BUSINESS_CATEGORIES.map(base => {
    const override = t.overrides?.[base.id] || {};
    const extra = t.extraKeywords?.[base.id] || [];
    return { ...base, ...override, keywords: [...base.keywords, ...extra] };
  });
  for (const extra of t.extraCategories || []) categories.push({ ...extra });

  return {
    callCategories: categories,
    businessProfile: {
      industry: INDUSTRIES[industryId] ? industryId : 'other',
      services: [...t.services],
      faqs: t.faqs.map(f => ({ ...f })),
      hours: DEFAULT_WEEK.map(h => ({ ...h }))
    }
  };
}
