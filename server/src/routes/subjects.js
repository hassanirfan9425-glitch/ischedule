import { Router } from 'express';
import { db, transaction } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  CORE_SUBJECTS,
  CONDITIONAL_CORE_SUBJECTS,
  OPTIONAL_CORE_SUBJECTS,
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
    optionalCoreSubjects: OPTIONAL_CORE_SUBJECTS,
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

// Targeted single-subject update — unlike POST /mine (a full replace of every subject), this
// works for the "re-rate this one subject" nudge without touching anything else the student rated,
// and unlike Electives.jsx (electives only) or the Quiz retake flow (core only, full re-do), it
// works uniformly for core and elective subjects alike.
router.patch('/mine/:subjectKey', requireAuth, async (req, res) => {
  const { difficulty } = req.body || {};
  if (!DIFFICULTY_KEYS.has(difficulty)) {
    return res.status(400).json({ error: `Invalid difficulty: ${difficulty}` });
  }
  const info = await db
    .prepare('UPDATE user_subjects SET difficulty = ? WHERE user_id = ? AND subject_key = ?')
    .run(difficulty, req.session.userId, req.params.subjectKey);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'You are not currently rating that subject.' });
  }
  res.json({ ok: true });
});

export default router;
