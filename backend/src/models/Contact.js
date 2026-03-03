/**
 * Contact Model
 * Represents a contact from user's phone
 */

export class Contact {
  constructor(data) {
    this.id = data.id;
    this.userId = data.userId;
    this.phoneNumber = data.phoneNumber;
    this.name = data.name;
    this.isVIP = data.isVIP || false;
    this.isBlocked = data.isBlocked || false;
    this.relationship = data.relationship || null; // 'family', 'friend', 'work', etc.
    this.lastCallDate = data.lastCallDate || null;
    this.callCount = data.callCount || 0;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      phoneNumber: this.phoneNumber,
      name: this.name,
      isVIP: this.isVIP,
      isBlocked: this.isBlocked,
      relationship: this.relationship,
      lastCallDate: this.lastCallDate,
      callCount: this.callCount,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

export default Contact;
