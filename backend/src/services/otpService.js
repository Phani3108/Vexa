/**
 * OTP Service — phone verification for login.
 *
 * Delivery:
 *   - TWILIO_VERIFY_SERVICE_SID set → Twilio Verify (recommended for production)
 *   - else Twilio credentials set   → plain SMS from TWILIO_PHONE_NUMBER, code stored hashed
 *   - else (development only)       → code is logged and returned to the client as devCode
 */

import crypto from 'crypto';
import twilio from 'twilio';
import OtpCode from '../models/mongodb/OtpCode.js';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hash(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function twilioClient() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  return TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;
}

const isProd = () => process.env.NODE_ENV === 'production';
const useVerify = () => !!process.env.TWILIO_VERIFY_SERVICE_SID && !!twilioClient();
// Dev mode skips SMS entirely unless OTP_FORCE_SMS=true, so local testing never burns Twilio credit.
const sendsSms = () => isProd() || process.env.OTP_FORCE_SMS === 'true';

export async function requestCode(phoneNumber) {
  if (sendsSms() && useVerify()) {
    await twilioClient().verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({ to: phoneNumber, channel: 'sms' });
    return { sent: true };
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await OtpCode.deleteMany({ phoneNumber });
  await OtpCode.create({ phoneNumber, codeHash: hash(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) });

  if (sendsSms()) {
    const client = twilioClient();
    if (!client || !process.env.TWILIO_PHONE_NUMBER) throw new Error('SMS delivery is not configured');
    await client.messages.create({
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
      body: `Your Vexa code is ${code}. It expires in 10 minutes.`
    });
    return { sent: true };
  }

  console.log(`🔑 [dev] OTP for ${phoneNumber}: ${code}`);
  return { sent: true, devCode: code };
}

export async function verifyCode(phoneNumber, code) {
  if (!code || !/^\d{4,8}$/.test(String(code))) return false;

  if (sendsSms() && useVerify()) {
    const check = await twilioClient().verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: phoneNumber, code: String(code) });
    return check.status === 'approved';
  }

  const record = await OtpCode.findOne({ phoneNumber, expiresAt: { $gt: new Date() } });
  if (!record) return false;
  if (record.attempts >= MAX_ATTEMPTS) {
    await record.deleteOne();
    return false;
  }

  const ok = crypto.timingSafeEqual(Buffer.from(record.codeHash), Buffer.from(hash(code)));
  if (ok) {
    await record.deleteOne();
    return true;
  }
  record.attempts += 1;
  await record.save();
  return false;
}

export default { requestCode, verifyCode };
