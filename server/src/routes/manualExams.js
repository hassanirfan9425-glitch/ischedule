import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { SUBJECT_BY_KEY, CORE_SUBJECT_KEYS, AUTO_SUBJECT_KEYS } from '../constants/subjects.js';

const router = Router();
const EXAM_TYPES = new Set(['weekly', 'saturday', 'final']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Generous ceiling just to stop runaway/abusive input — a full year of manual entries for every
// subject wouldn't come close to this.
const MAX_MANUAL_EXAMS = 150;

router.get('/', requireAuth, async (req, res) => {
  const rows = await db
    .prepare("SELECT * FROM exams WHERE user_id = ? AND source = 'manual' ORDER BY date ASC")
    .all(req.session.userId);
  res.json({
    exams: rows.map((row) => ({
      id: row.id,
      subjectKey: row.subject_key,
      subjectLabel: SUBJECT_BY_KEY[row.subject_key]?.label ?? row.subject_label,
      examType: row.exam_type,
      date: row.date,
      time: row.time,
      notes: row.notes,
    })),
  });
});

router.post('/', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { subjectKey, examType, date, time, notes } = req.body || {};

  if (!SUBJECT_BY_KEY[subjectKey]) {
    return res.status(400).json({ error: `Unknown subject: ${subjectKey}` });
  }
  if (!EXAM_TYPES.has(examType)) {
    return res.status(400).json({ error: `Invalid exam type: ${examType}` });
  }
  if (!DATE_RE.test(date || '')) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format.' });
  }

  // Must be a subject this student actually takes: a fixed core subject, an auto-included one, or
  // something they rated in the quiz (covers conditional-core and electives alike).
  const isRated = !!(await db
    .prepare('SELECT 1 FROM user_subjects WHERE user_id = ? AND subject_key = ?')
    .get(userId, subjectKey));
  if (!CORE_SUBJECT_KEYS.has(subjectKey) && !AUTO_SUBJECT_KEYS.has(subjectKey) && !isRated) {
    return res.status(400).json({ error: 'That subject is not on your current list.' });
  }

  const { count } = await db
    .prepare("SELECT COUNT(*) as count FROM exams WHERE user_id = ? AND source = 'manual'")
    .get(userId);
  if (count >= MAX_MANUAL_EXAMS) {
    return res.status(400).json({ error: `You've reached the ${MAX_MANUAL_EXAMS}-entry manual limit.` });
  }

  const duplicate = await db
    .prepare("SELECT 1 FROM exams WHERE user_id = ? AND source = 'manual' AND subject_key = ? AND date = ?")
    .get(userId, subjectKey, date);
  if (duplicate) {
    return res.status(409).json({ error: 'You already added an exam for that subject on that date.' });
  }

  const info = await db
    .prepare(
      `INSERT INTO exams (user_id, subject_key, subject_label, exam_type, date, time, notes, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')`
    )
    .run(userId, subjectKey, SUBJECT_BY_KEY[subjectKey].label, examType, date, time || null, notes || null);

  res.json({ id: info.lastInsertRowid });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const info = await db
    .prepare("DELETE FROM exams WHERE id = ? AND user_id = ? AND source = 'manual'")
    .run(req.params.id, req.session.userId);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Not found.' });
  }
  res.json({ ok: true });
});

// Marks the account onboarded — used when manual entry is the path taken instead of (or after) an
// AI schedule upload, so the student can reach the dashboard the first time too.
router.post('/finish', requireAuth, async (req, res) => {
  await db.prepare('UPDATE users SET onboarded = 1 WHERE id = ?').run(req.session.userId);
  res.json({ ok: true });
});

export default router;
