/**
 * Authentication Middleware
 * Validates a JWT Bearer token and attaches userId to the request.
 *
 * userId is the account owner's phone number (E.164). Tokens are only issued
 * after OTP verification (see routes/auth.js), so possession of a token proves
 * control of that phone number.
 */

import jwt from 'jsonwebtoken';

const DEV_SECRET = 'vexa-dev-secret-change-me';

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEV_SECRET)) {
  throw new Error('JWT_SECRET must be set to a strong secret in production');
}

const JWT_SECRET = process.env.JWT_SECRET || DEV_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

// ── Token helpers ──────────────────────────────────────────────────────────

export function generateToken(userId, expiresIn = JWT_EXPIRES_IN) {
  return jwt.sign({ userId, type: 'access' }, JWT_SECRET, { expiresIn });
}

export function generateRefreshToken(userId) {
  return jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/** Verify an access token; returns userId or throws. Refresh tokens are rejected. */
export function verifyAccessToken(token) {
  const decoded = verifyToken(token);
  if (decoded.type === 'refresh') throw new Error('Refresh token cannot be used for API access');
  return decoded.userId;
}

// ── Middleware ──────────────────────────────────────────────────────────────

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const userId = verifyAccessToken(authHeader.substring(7));
    req.userId = userId;
    req.user = { userId };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export default { authenticate, generateToken, generateRefreshToken, verifyToken, verifyAccessToken };
