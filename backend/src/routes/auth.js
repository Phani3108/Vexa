/**
 * Authentication Routes
 * Handles user registration, login, and token management
 */

import express from 'express';

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user
 * 
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "password": "securepassword",
 *   "name": "John Doe",
 *   "phoneNumber": "+14155551234"
 * }
 * 
 * Response:
 * {
 *   "user": { ... },
 *   "token": "jwt-token",
 *   "forwardingNumber": "+14155559999"
 * }
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phoneNumber } = req.body;

    // TODO: Validate input
    if (!email || !password || !name || !phoneNumber) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    // TODO (Week 3): 
    // - Check if user already exists
    // - Hash password (bcrypt)
    // - Assign Twilio forwarding number
    // - Save to database
    // - Generate JWT token

    // Mock response for now
    res.status(201).json({
      user: {
        id: 'user-123',
        email,
        name,
        phoneNumber,
        forwardingNumber: '+14155559999', // Twilio number (assigned in Week 3)
        createdAt: new Date()
      },
      token: 'mock-jwt-token-replace-in-week-3',
      message: 'User registered successfully'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * User login
 * 
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "password": "securepassword"
 * }
 * 
 * Response:
 * {
 *   "user": { ... },
 *   "token": "jwt-token"
 * }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password required'
      });
    }

    // TODO (Week 3):
    // - Find user by email
    // - Verify password hash
    // - Generate JWT token

    // Mock response
    res.json({
      user: {
        id: 'user-123',
        email,
        name: 'John Doe',
        phoneNumber: '+14155551234',
        forwardingNumber: '+14155559999'
      },
      token: 'mock-jwt-token',
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh expired JWT token
 * 
 * Headers: Authorization: Bearer <old-token>
 * 
 * Response:
 * {
 *   "token": "new-jwt-token"
 * }
 */
router.post('/refresh', async (req, res) => {
  try {
    // TODO (Week 3):
    // - Verify old token
    // - Generate new token

    res.json({
      token: 'new-mock-jwt-token',
      expiresIn: '24h'
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 * 
 * Headers: Authorization: Bearer <token>
 * 
 * Response:
 * {
 *   "user": { ... }
 * }
 */
router.get('/me', async (req, res) => {
  try {
    // TODO (Week 3):
    // - Verify JWT token from Authorization header
    // - Get user from database
    // - Return user profile

    // Mock response
    res.json({
      user: {
        id: 'user-123',
        email: 'user@example.com',
        name: 'John Doe',
        phoneNumber: '+14155551234',
        forwardingNumber: '+14155559999',
        createdAt: new Date('2026-02-01')
      }
    });
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

export default router;
