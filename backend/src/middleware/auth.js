/**
 * Authentication Middleware
 * Validates JWT token and attaches userId to request
 */

// In-memory token storage (same as auth.js)
// In production, validate JWT properly
const tokens = new Map();

export const authenticate = (req, res, next) => {
  try {
    // DEVELOPMENT MODE: phoneNumber identifies the user.
    // GET requests → ?phoneNumber=+91...  (query param)
    // POST/PUT/DELETE → { "phoneNumber": "+91..." } (request body)
    // Falls back to OWNER_PHONE_NUMBER env var if neither is provided.
    // In production this whole block is skipped and JWT is used.
    if (process.env.NODE_ENV !== 'production') {
      const phone = req.query.phoneNumber || req.body?.phoneNumber || process.env.OWNER_PHONE_NUMBER;
      if (phone) {
        req.userId = phone;
        req.user = { userId: phone };
        return next();
      }
    }
    
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const userId = tokens.get(token);

    if (!userId) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Attach userId to request object
    req.userId = userId;
    req.user = { userId };
    next();

  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Helper to share tokens between auth and middleware
// In production, use proper JWT library
export const setToken = (token, userId) => {
  tokens.set(token, userId);
};

export const deleteToken = (token) => {
  tokens.delete(token);
};

export const getTokens = () => tokens;

export default { authenticate, setToken, deleteToken, getTokens };
