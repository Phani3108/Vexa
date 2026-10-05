/**
 * Authentication Routes — phone number + one-time code.
 *
 * Flow:
 *   1. POST /api/auth/otp/request  { phoneNumber }                → { sent, devCode? }
 *   2. POST /api/auth/otp/verify   { phoneNumber, code, name?,
 *                                    accountType?, industry?, timezone? }
 *                                  → { user, token, refreshToken } (creates the account on first login)
 *   3. POST /api/auth/refresh      { refreshToken }               → { token, refreshToken }
 *   4. GET  /api/auth/me                                           (requires auth)
 *
 * The old /login and /register endpoints issued a JWT for ANY phone number
 * without proof of ownership — they have been removed.
 */

import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { generateToken, generateRefreshToken, verifyToken, authenticate } from '../middleware/auth.js';
import userConfigService from '../services/userConfigService.js';
import otpService from '../services/otpService.js';
import { isValidE164 } from '../lib/phone.js';

const router = express.Router();

// Per-IP + per-number throttles so codes can't be brute-forced or used to spam SMS
const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${req.body?.phoneNumber || ''}`,
  message: { error: 'Too many code requests. Try again in a few minutes.' },
});
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts. Try again later.' },
});

function sessionResponse(user, isNewUser) {
  return {
    user: {
      userId: user.userId,
      phoneNumber: user.phoneNumber,
      name: user.name,
      accountType: user.accountType,
      onboardingCompleted: !!user.onboardingCompleted,
      isNewUser
    },
    token: generateToken(user.userId),
    refreshToken: generateRefreshToken(user.userId),
  };
}

router.post('/otp/request', otpRequestLimiter, async (req, res) => {
  const { phoneNumber } = req.body || {};
  if (!isValidE164(phoneNumber)) {
    return res.status(400).json({ error: 'Enter your number in international format, e.g. +14155551234' });
  }
  try {
    const result = await otpService.requestCode(phoneNumber);
    res.json(result);
  } catch (err) {
    console.error('OTP request error:', err.message);
    res.status(502).json({ error: 'Could not send the verification code. Please try again.' });
  }
});

router.post('/otp/verify', otpVerifyLimiter, async (req, res) => {
  const { phoneNumber, code, name, accountType, industry, timezone } = req.body || {};
  if (!isValidE164(phoneNumber)) return res.status(400).json({ error: 'Invalid phone number' });

  try {
    const ok = await otpService.verifyCode(phoneNumber, code);
    if (!ok) return res.status(401).json({ error: 'That code is incorrect or has expired' });

    const user = await userConfigService.setupUser(phoneNumber, { name, accountType, industry, timezone });
    res.json(sessionResponse(user, user.isNewUser));
  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required' });

  try {
    const decoded = verifyToken(refreshToken);
    if (decoded.type !== 'refresh') return res.status(401).json({ error: 'Invalid refresh token' });

    const user = await userConfigService.getUser(decoded.userId);
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });

    res.json({
      token: generateToken(decoded.userId),
      refreshToken: generateRefreshToken(decoded.userId),
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  const user = await userConfigService.getUser(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    user: {
      userId: user.userId,
      phoneNumber: user.phoneNumber,
      name: user.name,
      about: user.about,
      accountType: user.accountType,
      onboardingCompleted: !!user.onboardingCompleted,
      twilioNumber: user.twilioNumber,
      businessName: user.businessProfile?.businessName || ''
    },
  });
});

export default router;
