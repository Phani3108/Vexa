/**
 * Authentication Routes
 * Phone-number-based auth with JWT tokens.
 *
 * Flow:
 *   1. POST /api/auth/register  — creates user config + returns JWT
 *   2. POST /api/auth/login     — looks up user by phone + returns JWT
 *   3. POST /api/auth/refresh   — exchange refresh token for new access token
 *   4. GET  /api/auth/me        — current user profile (requires auth)
 */

import express from 'express';
import { generateToken, generateRefreshToken, verifyToken, authenticate } from '../middleware/auth.js';
import userConfigService from '../services/userConfigService.js';

const router = express.Router();

// ── Register ────────────────────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  try {
    const { phoneNumber, name, about } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber is required' });
    }
    if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
      return res.status(400).json({ error: 'phoneNumber must be E.164 format' });
    }

    const config = await userConfigService.setupUser(phoneNumber, { name, about });

    const token = generateToken(phoneNumber);
    const refreshToken = generateRefreshToken(phoneNumber);

    res.status(201).json({
      user: {
        userId: config.userId,
        phoneNumber: config.phoneNumber,
        name: config.name,
        isNewUser: config.isNewUser,
      },
      token,
      refreshToken,
      message: 'User registered successfully',
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── Login ───────────────────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber is required' });
    }
    if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
      return res.status(400).json({ error: 'phoneNumber must be E.164 format' });
    }

    const user = await userConfigService.getUser(phoneNumber);
    if (!user) {
      return res.status(404).json({ error: 'User not found. Register first.' });
    }

    const token = generateToken(phoneNumber);
    const refreshToken = generateRefreshToken(phoneNumber);

    res.json({
      user: {
        userId: user.userId,
        phoneNumber: user.phoneNumber,
        name: user.name,
      },
      token,
      refreshToken,
      message: 'Login successful',
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── Refresh ─────────────────────────────────────────────────────────────────

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }

    const decoded = verifyToken(refreshToken);
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const token = generateToken(decoded.userId);
    res.json({ token, expiresIn: '7d' });
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// ── Me ──────────────────────────────────────────────────────────────────────

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await userConfigService.getUser(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      user: {
        userId: user.userId,
        phoneNumber: user.phoneNumber,
        name: user.name,
        about: user.about,
        twilioNumber: user.twilioNumber,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

export default router;
