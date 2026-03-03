/**
 * User Model
 * Represents a user in the AI Caller system
 */

export class User {
  constructor(data) {
    this.id = data.id;
    this.email = data.email;
    this.name = data.name;
    this.phoneNumber = data.phoneNumber;
    this.forwardingNumber = data.forwardingNumber; // Twilio number assigned to user
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  // Convert to JSON (remove sensitive fields)
  toJSON() {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      phoneNumber: this.phoneNumber,
      forwardingNumber: this.forwardingNumber,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * User Preferences Model
 * Stores screening rules and preferences
 */
export class UserPreferences {
  constructor(data) {
    this.userId = data.userId;
    this.screenUnknownNumbers = data.screenUnknownNumbers ?? true;
    this.allowContacts = data.allowContacts ?? true;
    this.autoRejectSpam = data.autoRejectSpam ?? true;
    this.vipContactIds = data.vipContactIds || []; // Array of contact IDs
    this.blockedNumbers = data.blockedNumbers || []; // Array of phone numbers
    this.doNotDisturbEnabled = data.doNotDisturbEnabled ?? false;
    this.doNotDisturbSchedule = data.doNotDisturbSchedule || null;
  }
}

export default { User, UserPreferences };
