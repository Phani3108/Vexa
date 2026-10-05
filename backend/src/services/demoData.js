/**
 * Demo data — realistic calls for a fresh account so the dashboard can be
 * explored before a phone number is connected. Development only.
 */

import Call from '../models/mongodb/Call.js';
import Caller from '../models/mongodb/Caller.js';
import Booking from '../models/mongodb/Booking.js';

const FLOW_FOR = {
  'customer.new_inquiry': ['lead_intake', 'New customer / quote'],
  'urgent.emergency': ['emergency', 'Emergency'],
  'business.sales': ['sales_shutdown', 'Sales & spam shutdown'],
  'spam.robocall': ['sales_shutdown', 'Sales & spam shutdown'],
  'booking.appointment': ['booking', 'Book an appointment'],
  'customer.existing': ['existing_customer', 'Existing customer / support'],
  'jobs.applicant': ['job_applicant', 'Job applicant']
};

function demoRun(s) {
  const [id, name] = FLOW_FOR[s.cat[0]] || ['general_message', 'Take a message'];
  const slots = {};
  if (s.name) slots.name = s.name;
  if (s.lead?.need) slots[id === 'booking' ? 'service' : id === 'emergency' ? 'problem' : id === 'existing_customer' ? 'issue' : 'need'] = s.lead.need;
  if (s.lead?.preferredTime) slots[id === 'booking' ? 'when' : 'timing'] = s.lead.preferredTime;
  const callerTurns = s.transcript.filter(([sp]) => sp === 'caller').length;
  const actions = s.spam ? [{ type: 'tag_spam', result: { status: 'done', detail: 'Marked as spam' } }]
    : id === 'booking' ? [{ type: 'book_request', result: { status: 'done', detail: 'Booking request created' } }, { type: 'send_sms', result: { status: 'sent', detail: 'Confirmation texted' } }]
    : s.lead ? [{ type: 'create_lead', result: { status: 'done', detail: 'Added to your inbox' } }, { type: 'notify_owner', result: { status: 'done', detail: 'Notification sent' } }]
    : [];
  return {
    workflowId: id, workflowName: name,
    status: s.takenOver ? 'transferred' : 'completed',
    slots, turns: callerTurns, questionsAsked: Math.max(0, callerTurns - 1),
    slotsSkipped: Object.keys(slots).length > callerTurns ? Object.keys(slots).length - callerTurns + 1 : 1,
    durationMs: s.duration * 1000,
    risk: s.spam ? { score: s.phone.startsWith('+1888') || s.phone.startsWith('+1800') ? 82 : 64, level: 'high', reasons: ['Toll-free number (common for telemarketing)'] } : { score: 12, level: 'low', reasons: [] },
    actions, events: []
  };
}

const SAMPLES = [
  {
    phone: '+15125550142', name: 'Dana Smith', cat: ['customer.new_inquiry', 'New Customer Inquiry'], hoursAgo: 2, duration: 74,
    summary: 'Dana wants a quote to replace a 50-gallon water heater. Prefers a callback tomorrow morning.',
    lead: { isLead: true, need: 'Water heater replacement quote', preferredTime: 'Tomorrow morning', value: 'high' },
    transcript: [
      ['ai', 'Thanks for calling! This is the virtual receptionist. How can I help you today?'],
      ['caller', 'Hi, my water heater is leaking a bit and I think it needs replacing. How much would that cost?'],
      ['ai', 'Sorry to hear that. Estimates are free — may I have your name?'],
      ['caller', 'This is Dana Smith.'],
      ['ai', 'Thanks, Dana. When is the best time for the team to call you back?'],
      ['caller', 'Tomorrow morning works.'],
      ['ai', "Perfect. I've noted that and the team will call you tomorrow morning. I'm disconnecting the call now."]
    ]
  },
  {
    phone: '+15125550199', name: 'Marcus Lee', cat: ['urgent.emergency', 'Urgent / Emergency'], hoursAgo: 5, duration: 41, urgency: 'critical', takenOver: true,
    summary: 'Burst pipe flooding the kitchen. AI transferred the call to the owner immediately.',
    lead: { isLead: true, need: 'Emergency burst pipe repair', preferredTime: 'Now', value: 'high' },
    transcript: [
      ['ai', 'Thanks for calling! How can I help you today?'],
      ['caller', "It's an emergency, a pipe burst and water is everywhere in my kitchen!"],
      ['ai', "I understand, let me get someone on the line right away. Transferring you now."]
    ]
  },
  {
    phone: '+18005550123', name: null, cat: ['business.sales', 'Sales / Solicitation'], hoursAgo: 8, duration: 19, spam: true,
    summary: 'SEO agency pitching Google listing services. Declined and ended the call.',
    transcript: [
      ['ai', 'Thanks for calling! How can I help you today?'],
      ['caller', 'Hi, we can get your business to the top of Google with our SEO marketing services.'],
      ['ai', "Thanks, but we're not interested. I'm disconnecting the call now."]
    ]
  },
  {
    phone: '+15125550177', name: 'Priya Patel', cat: ['booking.appointment', 'Appointment / Booking'], hoursAgo: 26, duration: 63,
    summary: 'Priya wants to schedule annual AC maintenance next week, prefers Tuesday afternoon.',
    lead: { isLead: true, need: 'Annual AC maintenance', preferredTime: 'Tuesday afternoon', value: 'medium' },
    transcript: [
      ['ai', 'Thanks for calling! How can I help you today?'],
      ['caller', "I'd like to book my annual AC maintenance. My name's Priya Patel."],
      ['ai', 'Happy to help, Priya. You can book online, or I can note a preferred time — what works?'],
      ['caller', 'Tuesday afternoon next week would be great.'],
      ['ai', "Noted. The team will confirm your Tuesday afternoon slot. I'm disconnecting the call now."]
    ]
  },
  {
    phone: '+18885550110', name: null, cat: ['spam.robocall', 'Spam / Robocall'], hoursAgo: 30, duration: 9, spam: true,
    summary: 'Robocall about an extended car warranty. Ended immediately.',
    transcript: [['ai', 'Thanks for calling! How can I help you today?'], ['caller', 'This is your final notice about your car warranty, press 1.'], ['ai', "I'm disconnecting the call now."]]
  },
  {
    phone: '+15125550133', name: 'Tom Becker', cat: ['customer.existing', 'Existing Customer / Order Status'], hoursAgo: 50, duration: 55,
    summary: 'Tom says the faucet installed last week is dripping again and wants someone to take a look.',
    lead: { isLead: true, need: 'Follow-up on dripping faucet (warranty)', preferredTime: 'Any weekday', value: 'low' },
    transcript: [
      ['ai', 'Thanks for calling! How can I help you today?'],
      ['caller', 'Hi, this is Tom Becker, you installed a faucet for me last week and it is dripping again.'],
      ['ai', "Sorry about that, Tom. I'll make sure the team calls you back. Any time that's best?"],
      ['caller', 'Any weekday is fine.'],
      ['ai', "Got it. I'm disconnecting the call now."]
    ]
  },
  {
    phone: '+15125550188', name: 'Alex Rivera', cat: ['jobs.applicant', 'Job Applicant'], hoursAgo: 75, duration: 32,
    summary: 'Alex asked about apprentice plumber openings. Told to email a resume.',
    transcript: [['ai', 'Thanks for calling! How can I help you today?'], ['caller', "I'm Alex Rivera, are you hiring apprentice plumbers?"], ['ai', "Thanks for your interest! Please email your resume to the team. I'm disconnecting the call now."]]
  },
  {
    phone: '+15125550164', name: 'Grace Kim', cat: ['customer.new_inquiry', 'New Customer Inquiry'], hoursAgo: 120, duration: 81,
    summary: 'Grace asked whether they install tankless water heaters and wants an estimate.',
    lead: { isLead: true, need: 'Tankless water heater estimate', preferredTime: 'After 5pm', value: 'high' },
    followUp: 'done',
    transcript: [['ai', 'Thanks for calling! How can I help you today?'], ['caller', 'Do you install tankless water heaters? I would like an estimate. My name is Grace Kim.'], ['ai', "We do! When's best for a callback, Grace?"], ['caller', 'After 5pm please.'], ['ai', "Noted. I'm disconnecting the call now."]]
  }
];

export async function seedDemoCalls(userId) {
  await Call.deleteMany({ userId, callId: /^demo_/ });
  const now = Date.now();
  const docs = SAMPLES.map((s, i) => {
    const created = new Date(now - s.hoursAgo * 3600 * 1000);
    return {
      callId: `demo_${i}_${userId.replace(/\D/g, '')}`,
      userId,
      phoneNumber: s.phone,
      direction: 'incoming',
      status: 'completed',
      duration: s.duration,
      takenOver: !!s.takenOver,
      transcript: s.transcript.map(([speaker, text], j) => ({ speaker, text, timestamp: new Date(created.getTime() + j * 8000) })),
      analysis: {
        categoryId: s.cat[0],
        categoryLabel: s.cat[1],
        confidence: 0.9,
        summary: s.summary,
        sentiment: s.spam ? 'neutral' : 'positive',
        callerName: s.name,
        urgency: s.urgency || 'normal',
        actionRequired: !!s.lead,
        actionItems: s.lead ? [`Call back ${s.name}`] : [],
        isSpam: !!s.spam,
        lead: s.lead ? { ...s.lead, name: s.name, callbackNumber: s.phone } : { isLead: false }
      },
      followUp: { status: s.followUp || (s.lead ? 'new' : 'none'), updatedAt: created },
      workflowRun: demoRun(s),
      startedAt: created,
      endedAt: new Date(created.getTime() + s.duration * 1000),
      createdAt: created,
      updatedAt: created
    };
  });
  // insertMany with explicit createdAt (timestamps option respects provided values)
  await Call.insertMany(docs);

  for (const s of SAMPLES) {
    await Caller.findOneAndUpdate(
      { userId, phoneNumber: s.phone },
      { $set: { callerName: s.name || 'Unknown', lastCategoryId: s.cat[0], lastCategoryLabel: s.cat[1], contextSummary: s.summary, lastCallAt: new Date(now - s.hoursAgo * 3600 * 1000) }, $inc: { totalCalls: 1 } },
      { upsert: true }
    );
  }
  await Booking.deleteMany({ userId, callId: /^demo_/ });
  await Booking.create([
    { userId, callId: docs[3].callId, kind: 'new', status: 'requested', customerName: 'Priya Patel', phoneNumber: '+15125550177', service: 'Annual AC maintenance', requestedTime: 'Tuesday afternoon' },
    { userId, callId: `demo_b_${userId.replace(/\D/g, '')}`, kind: 'new', status: 'confirmed', customerName: 'Grace Kim', phoneNumber: '+15125550164', service: 'Tankless water heater estimate', requestedTime: 'Thursday 5pm', confirmedTime: 'Thursday 5:30pm' }
  ]);
  return docs.length;
}
