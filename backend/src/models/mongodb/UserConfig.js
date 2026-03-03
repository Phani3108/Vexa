/**
 * MongoDB UserConfig Model
 *
 * Stores user preferences for AI call handling.
 * callCategories drives dynamic prompt generation - the AI receives
 * per-category instructions so it knows exactly what to say/do.
 */

import mongoose from 'mongoose';

// A single call category rule
const categoryRuleSchema = new mongoose.Schema({
  id: { type: String, required: true },           // e.g. "delivery.food"
  label: { type: String, required: true },         // e.g. "Food Delivery"
  keywords: [String],                              // trigger words for detection
  action: {
    type: String,
    enum: ['follow_instructions', 'take_message', 'connect_user', 'end_call', 'ask_purpose'],
    default: 'follow_instructions'
  },
  // Verbatim instructions injected into the AI system prompt for this category
  instructions: { type: String, default: '' },
  notify: { type: Boolean, default: true },
  priority: { type: Number, default: 5 }          // 1 = highest, 10 = lowest
}, { _id: false });

const vipContactSchema = new mongoose.Schema({
  name: String,
  phoneNumber: { type: String, required: true },
  relationship: String,
  notes: String
}, { _id: false });

// Physical address — used by the AI to help delivery agents/visitors
const deliveryAddressSchema = new mongoose.Schema({
  flat:         { type: String, default: '' },   // e.g. "Flat 304"
  building:     { type: String, default: '' },   // e.g. "SMR Vinay Galaxy, Tower B"
  landmark:     { type: String, default: '' },   // e.g. "Opposite Reliance Fresh"
  street:       { type: String, default: '' },   // e.g. "Kondapur Main Road"
  city:         { type: String, default: '' },   // e.g. "Hyderabad"
  pincode:      { type: String, default: '' },   // e.g. "500084"
  // Free-text notes for common confusion or navigation issues
  // e.g. "Delivery apps often show SMR Vinay Endeavour — correct society is SMR Vinay Galaxy"
  societyNotes: { type: String, default: '' },
  // If the building has a security/gate procedure
  securityNotes: { type: String, default: '' }  // e.g. "Tell security you are delivering to Flat 304, Tower B"
}, { _id: false });

const userConfigSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, default: 'default' },
  name: { type: String, default: 'User' },
  about: { type: String, default: 'A professional who receives many calls.' },
  phoneNumber: String,
  twilioNumber: String,

  // Physical delivery address — AI uses this to guide callers
  deliveryAddress: { type: deliveryAddressSchema, default: () => ({}) },

  aiSettings: {
    voice: {
      type: String,
      enum: ['alloy', 'echo', 'shimmer', 'ash', 'ballad', 'coral', 'sage', 'verse'],
      default: 'shimmer'
    },
    tone: { type: String, default: 'professional but friendly' },
    language: { type: String, default: 'en' },
    greeting: String
  },

  // Core of the dynamic prompt system — add/edit categories freely
  callCategories: [categoryRuleSchema],

  vipContacts: [vipContactSchema],
  blockedNumbers: [String],

  unknownCallerAction: {
    type: String,
    enum: ['screen', 'take_message', 'inform_unavailable'],
    default: 'screen'
  },

  escalationKeywords: {
    type: [String],
    default: ['emergency', 'urgent', 'hospital', 'accident', 'fire', 'critical']
  },

  // Priority Time / DND Mode settings
  priorityTime: {
    enabled: { type: Boolean, default: false },
    
    // Time slots - supports multiple slots per day
    timeSlots: [{
      startTime: { type: String, required: true },  // Format: "HH:mm" (24-hour)
      endTime: { type: String, required: true },    // Format: "HH:mm" (24-hour)
      label: { type: String, default: '' }          // Optional label like "Morning Focus", "Afternoon Meetings"
    }],
    
    // Recurring schedule
    recurring: {
      enabled: { type: Boolean, default: false },
      // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      daysOfWeek: { type: [Number], default: [1, 2, 3, 4, 5] }, // Default: Monday-Friday
      excludeDates: [String]  // Array of dates to exclude (ISO format: "YYYY-MM-DD")
    },
    
    timezone: { type: String, default: 'Asia/Kolkata' }, // User's timezone
    
    message: { 
      type: String, 
      default: '{userName} is currently unavailable due to important work and cannot take calls. They will be available after {endTime}. Please leave your details and they will get back to you.'
    },
    
    // Emergency bypass - these contacts can always reach the user
    emergencyContacts: [{
      name: { type: String, required: true },
      phoneNumber: { type: String, required: true },
      relationship: String
    }],
    
    // Quick toggle - last manually enabled/disabled state
    quickToggleActive: { type: Boolean, default: false }
  },

  deviceTokens: [{
    token: String,
    platform: { type: String, enum: ['ios', 'android'] },
    addedAt: { type: Date, default: Date.now }
  }]

}, { timestamps: true });

userConfigSchema.index({ twilioNumber: 1 });
userConfigSchema.index({ phoneNumber: 1 });

export const DEFAULT_CATEGORIES = [
  {
    id: 'delivery.food',
    label: 'Food Delivery',
    keywords: ['swiggy', 'zomato', 'food delivery', 'food order', 'restaurant order', 'doordash', 'ubereats'],
    action: 'follow_instructions',
    instructions: 'Ask them to leave the food at the main door and ring the bell once. Give them the delivery address if they ask for it.',
    notify: true,
    priority: 3
  },
  {
    id: 'delivery.package',
    label: 'Package / Courier',
    keywords: ['amazon', 'flipkart', 'courier', 'package', 'parcel', 'delhivery', 'bluedart', 'fedex', 'ups', 'dhl'],
    action: 'follow_instructions',
    instructions: 'Ask them to leave the package at the door. If a signature is required, ask them to attempt delivery again in 30 minutes or at a time convenient to them.',
    notify: true,
    priority: 3
  },
  {
    id: 'delivery.grocery',
    label: 'Grocery Delivery',
    keywords: ['bigbasket', 'blinkit', 'instamart', 'grocery', 'zepto', 'dunzo'],
    action: 'follow_instructions',
    instructions: 'Ask them to leave the groceries at the door. Give them the delivery address if they are lost.',
    notify: true,
    priority: 3
  },
  {
    id: 'service.maintenance',
    label: 'Maintenance / Repair',
    keywords: ['plumber', 'electrician', 'maintenance', 'repair', 'technician', 'carpenter', 'ac service'],
    action: 'ask_purpose',
    instructions: 'Ask if they have a scheduled appointment. If yes, welcome them and let them know someone will be with them shortly. If no appointment, politely ask them to schedule one first and take their contact details.',
    notify: true,
    priority: 4
  },
  {
    id: 'service.visitor',
    label: 'Visitor / Guest',
    keywords: ['visitor', 'guest', 'here to meet', 'came to see'],
    action: 'ask_purpose',
    instructions: 'Ask for their name and purpose of the visit. Take a message and let them know the owner will be informed.',
    notify: true,
    priority: 4
  },
  {
    id: 'business.sales',
    label: 'Sales / Marketing',
    keywords: ['offer', 'discount', 'scheme', 'credit card', 'loan', 'insurance', 'promotional'],
    action: 'end_call',
    instructions: 'Politely say the owner is not interested and prefers to be contacted by email if needed. End the call.',
    notify: false,
    priority: 6
  },
  {
    id: 'spam.telemarketing',
    label: 'Spam / Telemarketing',
    keywords: ['survey', 'feedback', 'prize', 'won', 'lottery', 'otp'],
    action: 'end_call',
    instructions: 'Politely decline and end the call immediately.',
    notify: false,
    priority: 7
  },
  {
    id: 'personal.unknown',
    label: 'Unknown Personal',
    keywords: [],
    action: 'take_message',
    instructions: 'Ask for their name and the purpose of their call. Take a message and assure them the owner will get back to them.',
    notify: true,
    priority: 8
  }
];

export default mongoose.model('UserConfig', userConfigSchema);
