import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { THEME_KEYS } from '../constants/themes.js';

const router = Router();

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    onboarded: !!row.onboarded,
    theme: row.theme || 'green',
  };
}

router.post('/signup', async (req, res) => {
  const { username, name, password } = req.body || {};

  if (!username || !name || !password) {
    return res.status(400).json({ error: 'Username, name, and password are all required.' });
  }
  if (username.trim().length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const info = db
    .prepare('INSERT INTO users (username, name, password_hash) VALUES (?, ?, ?)')
    .run(username.trim(), name.trim(), passwordHash);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    return res.json({ user: null });
  }
  res.json({ user: publicUser(user) });
});

router.patch('/profile', requireAuth, async (req, res) => {
  const { username, name, theme } = req.body || {};
  const userId = req.session.userId;
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  const nextUsername = username !== undefined ? String(username).trim() : current.username;
  const nextName = name !== undefined ? String(name).trim() : current.name;
  const nextTheme = theme !== undefined ? theme : current.theme;

  if (nextUsername.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  }
  if (!nextName) {
    return res.status(400).json({ error: 'Name cannot be empty.' });
  }
  if (theme !== undefined && !THEME_KEYS.has(theme)) {
    return res.status(400).json({ error: `Unknown theme: ${theme}` });
  }

  if (nextUsername.toLowerCase() !== current.username.toLowerCase()) {
    const clash = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(nextUsername, userId);
    if (clash) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }
  }

  db.prepare('UPDATE users SET username = ?, name = ?, theme = ? WHERE id = ?').run(
    nextUsername,
    nextName,
    nextTheme,
    userId
  );

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.json({ user: publicUser(updated) });
});

export default router;
