import { Router } from 'express';
import { db, transaction } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  CORE_SUBJECTS,
  CONDITIONAL_CORE_SUBJECTS,
  SUBJECTS,
  AUTO_SUBJECTS,
  ALL_SUBJECTS,
  CORE_SUBJECT_KEYS,
  DIFFICULTY_KEYS,
  DIFFICULTIES,
  WEEKDAYS,
  WEEKDAY_OFFSET_BY_KEY,
} from '../constants/subjects.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    coreSubjects: CORE_SUBJECTS,
    conditionalCoreSubjects: CONDITIONAL_CORE_SUBJECTS,
    subjects: SUBJECTS,
    autoSubjects: AUTO_SUBJECTS,
    difficulties: DIFFICULTIES,
    weekdays: WEEKDAYS,
  });
});

router.get('/mine', requireAuth, async (req, res) => {
  const rows = await db
    .prepare('SELECT subject_key, difficulty FROM user_subjects WHERE user_id = ?')
    .all(req.session.userId);
  const user = await db.prepare('SELECT periodic_day FROM users WHERE id = ?').get(req.session.userId);
  res.json({ subjects: rows, periodicDay: user?.periodic_day ?? null });
});

router.post('/mine', requireAuth, async (req, res) => {
  const { subjects, periodicDay } = req.body || {};
  if (!Array.isArray(subjects)) {
    return res.status(400).json({ error: 'subjects must be an array.' });
  }
  if (!periodicDay || !(periodicDay in WEEKDAY_OFFSET_BY_KEY)) {
    return res.status(400).json({ error: 'periodicDay must be one of monday..friday.' });
  }

  const validKeys = new Set(ALL_SUBJECTS.map((s) => s.key));
  const submittedKeys = new Set();
  for (const entry of subjects) {
    if (!validKeys.has(entry.subjectKey)) {
      return res.status(400).json({ error: `Unknown subject: ${entry.subjectKey}` });
    }
    if (!DIFFICULTY_KEYS.has(entry.difficulty)) {
      return res.status(400).json({ error: `Invalid difficulty: ${entry.difficulty}` });
    }
    submittedKeys.add(entry.subjectKey);
  }

  for (const coreKey of CORE_SUBJECT_KEYS) {
    if (!submittedKeys.has(coreKey)) {
      return res.status(400).json({ error: 'Every core subject needs a difficulty rating.' });
    }
  }

  const userId = req.session.userId;
  const replaceAll = transaction(async (entries) => {
    await db.prepare('DELETE FROM user_subjects WHERE user_id = ?').run(userId);
    const insert = db.prepare(
      'INSERT INTO user_subjects (user_id, subject_key, difficulty) VALUES (?, ?, ?)'
    );
    for (const entry of entries) {
      await insert.run(userId, entry.subjectKey, entry.difficulty);
    }
    // The quiz is the only mandatory onboarding step now — schedule/academics are both optional,
    // reachable via their own "+" prompts once the student's in the app.
    await db.prepare('UPDATE users SET periodic_day = ?, onboarded = 1 WHERE id = ?').run(periodicDay, userId);
  });
  await replaceAll(subjects);

  res.json({ ok: true });
});

export default router;
