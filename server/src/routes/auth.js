import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { THEME_KEYS } from '../constants/themes.js';
import { containsProfanity } from '../utils/profanityFilter.js';

const router = Router();

const UI_STYLE_KEYS = new Set(['classic', 'technical', 'orbit']);

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    onboarded: !!row.onboarded,
    theme: row.theme || 'purple_pink',
    uiStyle: row.ui_style || 'classic',
    tutorialSeen: !!row.tutorial_seen,
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
  if (containsProfanity(username) || containsProfanity(name)) {
    return res.status(400).json({ error: 'Username and name cannot contain inappropriate language.' });
  }

  const existing = await db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  // tutorial_seen defaults to true at the column level (existing accounts skip it) — brand-new
  // signups explicitly get false so the first-time tutorial actually triggers for them.
  const info = await db
    .prepare('INSERT INTO users (username, name, password_hash, theme, tutorial_seen) VALUES (?, ?, ?, ?, ?)')
    .run(username.trim(), name.trim(), passwordHash, 'purple_pink', false);

  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
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

router.get('/me', async (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    return res.json({ user: null });
  }
  res.json({ user: publicUser(user) });
});

router.delete('/account', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  // Foreign keys are declared ON DELETE CASCADE, so this also removes the user's subjects,
  // schedule uploads, exams, and holidays.
  await db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.patch('/profile', requireAuth, async (req, res) => {
  const { username, name, theme, uiStyle } = req.body || {};
  const userId = req.session.userId;
  const current = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  const nextUsername = username !== undefined ? String(username).trim() : current.username;
  const nextName = name !== undefined ? String(name).trim() : current.name;
  const nextTheme = theme !== undefined ? theme : current.theme;
  const nextUiStyle = uiStyle !== undefined ? uiStyle : current.ui_style;

  if (nextUsername.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  }
  if (!nextName) {
    return res.status(400).json({ error: 'Name cannot be empty.' });
  }
  if (containsProfanity(nextUsername) || containsProfanity(nextName)) {
    return res.status(400).json({ error: 'Username and name cannot contain inappropriate language.' });
  }
  if (theme !== undefined && !THEME_KEYS.has(theme)) {
    return res.status(400).json({ error: `Unknown theme: ${theme}` });
  }
  if (uiStyle !== undefined && !UI_STYLE_KEYS.has(uiStyle)) {
    return res.status(400).json({ error: `Unknown UI style: ${uiStyle}` });
  }

  if (nextUsername.toLowerCase() !== current.username.toLowerCase()) {
    const clash = await db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(nextUsername, userId);
    if (clash) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }
  }

  await db.prepare('UPDATE users SET username = ?, name = ?, theme = ?, ui_style = ? WHERE id = ?').run(
    nextUsername,
    nextName,
    nextTheme,
    nextUiStyle,
    userId
  );

  const updated = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.json({ user: publicUser(updated) });
});

router.post('/tutorial-complete', requireAuth, async (req, res) => {
  await db.prepare('UPDATE users SET tutorial_seen = true WHERE id = ?').run(req.session.userId);
  const updated = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  res.json({ user: publicUser(updated) });
});

export default router;
