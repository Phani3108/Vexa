/**
 * Authentication Middleware
 * Validates JWT token and attaches userId to request.
 *
 * In dev mode (NODE_ENV !== 'production') a phoneNumber in the query/body
 * is accepted as identity — convenient for local testing. In production
 * a valid JWT Bearer token is required on every request.
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'vexa-dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

// ── Token helpers ──────────────────────────────────────────────────────────

export function generateToken(userId, expiresIn = JWT_EXPIRES_IN) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn });
}

export function generateRefreshToken(userId) {
  return jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// ── Middleware ──────────────────────────────────────────────────────────────

export const authenticate = (req, res, next) => {
  try {
    // --- DEV-MODE shortcut: identify user by phoneNumber ----------------
    if (process.env.NODE_ENV !== 'production') {
      const phone =
        req.query.phoneNumber ||
        req.body?.phoneNumber ||
        process.env.OWNER_PHONE_NUMBER;
      if (phone) {
        req.userId = phone;
        req.user = { userId: phone };
        return next();
      }
    }

    // --- PRODUCTION: JWT Bearer token -----------------------------------
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = verifyToken(token);
      req.userId = decoded.userId;
      req.user = { userId: decoded.userId };
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

export default { authenticate, generateToken, generateRefreshToken, verifyToken };
