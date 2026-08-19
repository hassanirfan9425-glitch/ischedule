import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { SUBJECT_BY_KEY, PASSING_GRADE, DIFFICULTIES } from '../constants/subjects.js';
import { calculateTermSummary, determineCurrentTerm } from './academics.js';
import { getTodayIso } from '../utils/uaeDate.js';

const router = Router();

const RATINGS = new Set(['worse', 'expected', 'better']);
const EASY_DIFFICULTIES = new Set(['very_easy', 'easy']);
const HARD_DIFFICULTIES = new Set(['hard', 'very_hard']);
// Mirrors PASSING_GRADE's role but for the opposite direction — "doing noticeably better than a
// subject rated hard" rather than "doing noticeably worse than a subject rated easy".
const HIGH_PERFORMANCE_GRADE = 85;

function subjectIdentity(subjectKey, subjectLabel) {
  return subjectKey || `label:${subjectLabel}`;
}

const DIFFICULTY_ORDER = DIFFICULTIES.map((d) => d.key);

// Steps exactly one level in the given direction rather than jumping straight to some computed
// target — a gentle, single-step recalibration is the right amount of trust to put in an
// unconfirmed automatic change, same reasoning as the manual nudge only ever suggesting a re-rate,
// never silently deciding a final answer on the student's behalf.
function nextDifficulty(currentDifficulty, direction) {
  const index = DIFFICULTY_ORDER.indexOf(currentDifficulty);
  if (index === -1) return currentDifficulty;
  const nextIndex = direction === 'harder' ? Math.min(index + 1, DIFFICULTY_ORDER.length - 1) : Math.max(index - 1, 0);
  return DIFFICULTY_ORDER[nextIndex];
}

async function getTermAverageForSubject(userId, term, subjectKey) {
  const resolvedTerm = term ?? (await determineCurrentTerm(userId, getTodayIso()));
  const rawEntries = await db
    .prepare('SELECT * FROM grade_entries WHERE user_id = ? AND term = ?')
    .all(userId, resolvedTerm);
  const { subjectAverages } = calculateTermSummary(rawEntries);
  const label = SUBJECT_BY_KEY[subjectKey]?.label;
  const identity = subjectIdentity(subjectKey, label);
  const entry = subjectAverages.find((s) => subjectIdentity(s.subjectKey, s.subjectLabel) === identity);
  return entry?.average ?? null;
}

// Compares each un-dismissed reflection against the subject's current quiz-rated difficulty and
// its actual term average, and returns the first one that contradicts the rating. Computed fresh
// every call (no cached/stored "mismatch" flag) so it always agrees with the latest difficulty
// rating and grades — same "always fresh" contract studyPlanDays()/isPriority() already rely on.
// When `autoAdjust` is true (the user's own opt-in setting, off by default), a found mismatch is
// applied immediately (one difficulty level, in the indicated direction) instead of being returned
// for manual confirmation — the reflection is marked resolved in the same step, so the caller's
// response is the only place this particular change is ever surfaced.
async function computePendingNudge(userId, autoAdjust) {
  const reflections = await db
    .prepare(
      `SELECT * FROM exam_reflections WHERE user_id = ? AND nudge_dismissed_at IS NULL
       ORDER BY created_at DESC`
    )
    .all(userId);
  if (reflections.length === 0) return null;

  const subjectRows = await db
    .prepare('SELECT subject_key, difficulty FROM user_subjects WHERE user_id = ?')
    .all(userId);
  const difficultyByKey = Object.fromEntries(subjectRows.map((r) => [r.subject_key, r.difficulty]));

  for (const r of reflections) {
    const currentDifficulty = difficultyByKey[r.subject_key];
    const average = await getTermAverageForSubject(userId, r.term, r.subject_key);
    if (average === null) continue;

    const ratedTooEasy =
      EASY_DIFFICULTIES.has(currentDifficulty) && r.rating === 'worse' && average < PASSING_GRADE;
    const ratedTooHard =
      HARD_DIFFICULTIES.has(currentDifficulty) && r.rating === 'better' && average >= HIGH_PERFORMANCE_GRADE;

    if (ratedTooEasy || ratedTooHard) {
      const base = {
        reflectionId: r.id,
        subjectKey: r.subject_key,
        subjectLabel: SUBJECT_BY_KEY[r.subject_key]?.label ?? r.subject_key,
        currentDifficulty,
        rating: r.rating,
        termAverage: average,
        term: r.term,
      };

      if (!autoAdjust) {
        return { ...base, autoApplied: false };
      }

      const newDifficulty = nextDifficulty(currentDifficulty, ratedTooEasy ? 'harder' : 'easier');
      await db
        .prepare('UPDATE user_subjects SET difficulty = ? WHERE user_id = ? AND subject_key = ?')
        .run(newDifficulty, userId, r.subject_key);
      await db
        .prepare('UPDATE exam_reflections SET nudge_dismissed_at = NOW() WHERE id = ? AND user_id = ?')
        .run(r.id, userId);
      return { ...base, autoApplied: true, newDifficulty };
    }
  }
  return null;
}

// Newest not-yet-reflected-on periodic exam (finals excluded — school-wide, not a single subject's
// material, same reasoning the Study Plan Generator already uses), scoped to subjects the student
// currently rates (so AUTO_SUBJECTS like AMS/Grid never get offered for reflection).
router.get('/pending', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const todayIso = getTodayIso();
  const { auto_adjust_difficulty: autoAdjust } = await db
    .prepare('SELECT auto_adjust_difficulty FROM users WHERE id = ?')
    .get(userId);

  const row = await db
    .prepare(
      `SELECT e.* FROM exams e
       WHERE e.user_id = ? AND e.exam_type IN ('weekly', 'saturday') AND e.subject_key IS NOT NULL
         AND COALESCE(e.date, e.date_end, e.date_start) < ?
         AND EXISTS (SELECT 1 FROM user_subjects us WHERE us.user_id = e.user_id AND us.subject_key = e.subject_key)
         AND NOT EXISTS (SELECT 1 FROM exam_reflections r WHERE r.exam_id = e.id)
       ORDER BY COALESCE(e.date, e.date_end, e.date_start) DESC
       LIMIT 1`
    )
    .get(userId, todayIso);

  const examToReflect = row
    ? {
        examId: row.id,
        subjectKey: row.subject_key,
        subjectLabel: SUBJECT_BY_KEY[row.subject_key]?.label ?? row.subject_label,
        date: row.date || row.date_end || row.date_start,
        weekNumber: row.week_number,
      }
    : null;

  const nudge = await computePendingNudge(userId, autoAdjust);

  res.json({ examToReflect, nudge });
});

router.post('/', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { examId, rating } = req.body || {};

  if (!RATINGS.has(rating)) {
    return res.status(400).json({ error: `Invalid rating: ${rating}` });
  }

  const exam = await db.prepare('SELECT * FROM exams WHERE id = ? AND user_id = ?').get(examId, userId);
  if (!exam) {
    return res.status(404).json({ error: 'Exam not found.' });
  }
  if (exam.exam_type !== 'weekly' && exam.exam_type !== 'saturday') {
    return res.status(400).json({ error: 'Only periodic exams can be reflected on.' });
  }
  const examDate = exam.date || exam.date_end || exam.date_start;
  if (!examDate || examDate >= getTodayIso()) {
    return res.status(400).json({ error: "This exam hasn't happened yet." });
  }
  if (!exam.subject_key) {
    return res.status(400).json({ error: 'This exam has no subject to reflect on.' });
  }
  const isRated = await db
    .prepare('SELECT 1 FROM user_subjects WHERE user_id = ? AND subject_key = ?')
    .get(userId, exam.subject_key);
  if (!isRated) {
    return res.status(400).json({ error: 'That subject is not on your current list.' });
  }

  const existing = await db.prepare('SELECT 1 FROM exam_reflections WHERE exam_id = ?').get(examId);
  if (existing) {
    return res.status(409).json({ error: "You've already reflected on this exam." });
  }

  const info = await db
    .prepare(
      `INSERT INTO exam_reflections (exam_id, user_id, subject_key, term, rating)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(examId, userId, exam.subject_key, exam.term, rating);

  const { auto_adjust_difficulty: autoAdjust } = await db
    .prepare('SELECT auto_adjust_difficulty FROM users WHERE id = ?')
    .get(userId);
  const nudge = await computePendingNudge(userId, autoAdjust);

  res.json({ ok: true, reflectionId: info.lastInsertRowid, nudge });
});

router.patch('/:id/dismiss-nudge', requireAuth, async (req, res) => {
  const info = await db
    .prepare('UPDATE exam_reflections SET nudge_dismissed_at = NOW() WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.session.userId);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Not found.' });
  }
  res.json({ ok: true });
});

export default router;
