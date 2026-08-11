import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  SUBJECT_BY_KEY,
  AUTO_SUBJECT_KEYS,
  difficultyColor,
  difficultyRank,
  isPriority,
  WEEKDAY_OFFSET_BY_KEY,
} from '../constants/subjects.js';

const router = Router();

function daysUntil(dateStr, today) {
  const target = new Date(`${dateStr}T00:00:00Z`);
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function addDays(dateIso, days) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Show all of the current term's exams for a bucket; if that leaves it empty (e.g. no Saturday
// sessions this term), fall back to just the single nearest one so the section is never blank.
// Manually-entered exams have no term (nothing to infer it from) — always include those, the
// student explicitly added them.
function scopeToCurrentTerm(examsOfType, currentTerm) {
  const manual = examsOfType.filter((e) => e.source === 'manual');
  const aiOnly = examsOfType.filter((e) => e.source !== 'manual');
  const inTerm = aiOnly.filter((e) => e.term === currentTerm);
  if (inTerm.length > 0) return [...inTerm, ...manual];
  return [...aiOnly.slice(0, 1), ...manual];
}

// Priority-flagged exams first (hardest-rated of those first), then everything else in date order.
function sortByPriority(list) {
  return [...list].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    if (a.priority) {
      const rankDiff = difficultyRank(a.difficulty) - difficultyRank(b.difficulty);
      if (rankDiff !== 0) return rankDiff;
    }
    return (a.daysUntil ?? 0) - (b.daysUntil ?? 0);
  });
}

router.get('/', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  // Testing-only override — set FAKE_TODAY=YYYY-MM-DD in server/.env to pretend "today" is a
  // different date (e.g. to test against a schedule for a year that hasn't started yet). Remove
  // the env var to go back to the real date.
  const today = process.env.FAKE_TODAY ? new Date(`${process.env.FAKE_TODAY}T00:00:00Z`) : new Date();
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const todayIso = todayUtc.toISOString().slice(0, 10);

  const user = await db.prepare('SELECT periodic_day FROM users WHERE id = ?').get(userId);
  const periodicOffset = user?.periodic_day ? WEEKDAY_OFFSET_BY_KEY[user.periodic_day] : null;

  const difficultyByKey = Object.fromEntries(
    (await db.prepare('SELECT subject_key, difficulty FROM user_subjects WHERE user_id = ?').all(userId)).map(
      (r) => [r.subject_key, r.difficulty]
    )
  );

  const examRows = await db
    .prepare(
      `SELECT * FROM exams WHERE user_id = ? AND COALESCE(date, date_end, date_start) >= ?
       ORDER BY COALESCE(date, date_start) ASC`
    )
    .all(userId, todayIso);

  const materialByExamId = Object.fromEntries(
    (await db.prepare('SELECT exam_id, periodic_code, quizzes, questions FROM exam_materials WHERE user_id = ?').all(userId)).map(
      (r) => [
        r.exam_id,
        { periodicCode: r.periodic_code, quizzes: JSON.parse(r.quizzes), questions: JSON.parse(r.questions) },
      ]
    )
  );

  const allExams = examRows
    .map((row) => {
      const difficulty = row.subject_key ? difficultyByKey[row.subject_key] : null;

      // Weekly assessments only carry a week range from the schedule — if the student told us
      // which weekday their periodics land on, pin it to an exact date instead of the range.
      let exactDate = row.date;
      if (row.exam_type === 'weekly' && periodicOffset !== null && row.date_start) {
        exactDate = addDays(row.date_start, periodicOffset);
      }

      const effectiveDate = exactDate || row.date_start;
      let examDaysUntil = effectiveDate ? daysUntil(effectiveDate, todayUtc) : null;

      // A date range (final exams) that's already started but hasn't ended yet is "happening
      // now", not "in the past" — clamp instead of showing a confusing negative countdown.
      if (!exactDate && examDaysUntil !== null && examDaysUntil < 0 && row.date_end && row.date_end >= todayIso) {
        examDaysUntil = 0;
      }

      return {
        id: row.id,
        subjectKey: row.subject_key,
        subjectLabel: row.subject_key ? SUBJECT_BY_KEY[row.subject_key]?.label ?? row.subject_label : row.subject_label,
        examType: row.exam_type,
        source: row.source,
        term: row.term,
        weekNumber: row.week_number,
        date: exactDate,
        dateStart: exactDate ? null : row.date_start,
        dateEnd: exactDate ? null : row.date_end,
        time: row.time,
        notes: row.notes,
        daysUntil: examDaysUntil,
        difficulty: difficulty || null,
        color: difficultyColor(difficulty),
        priority: isPriority(difficulty, examDaysUntil),
        isExactDate: !!exactDate,
        material: materialByExamId[row.id] || null,
      };
    })
    // A weekly exam pinned to an exact date that's already passed this week is done — drop it.
    .filter((e) => e.daysUntil === null || e.daysUntil >= 0);

  // Some weeks list the same subject in both Periodic 1 and Periodic 2 — once pinned to an exact
  // date those collapse to the same day, so drop the duplicate bubble.
  const seenWeekly = new Set();
  const dedupedExams = allExams.filter((e) => {
    if (e.examType !== 'weekly') return true;
    const dedupeKey = `${e.subjectKey}|${e.date}`;
    if (seenWeekly.has(dedupeKey)) return false;
    seenWeekly.add(dedupeKey);
    return true;
  });

  // "Current term" = the term of the soonest upcoming exam overall.
  const currentTerm = dedupedExams.find((e) => e.term != null)?.term ?? null;

  // Periodic exams are per-subject — only show ones matched to a subject the student *currently*
  // takes (checked against their latest quiz answers, not just whatever matched at upload time —
  // retaking the quiz and dropping a subject should hide it immediately) or an auto-included one
  // like MOES/AMS/Grid. Finals aren't subject-specific, so they're exempt and stay school-wide.
  // "Weekly" and "Saturday" are both just periodic exams from the student's point of view — one
  // combined section, not two.
  const isCurrentlyTracked = (subjectKey) =>
    !!subjectKey && (subjectKey in difficultyByKey || AUTO_SUBJECT_KEYS.has(subjectKey));

  const periodicExams = sortByPriority(
    scopeToCurrentTerm(
      dedupedExams.filter(
        (e) => (e.examType === 'weekly' || e.examType === 'saturday') && isCurrentlyTracked(e.subjectKey)
      ),
      currentTerm
    )
  );
  const finalExams = sortByPriority(
    scopeToCurrentTerm(dedupedExams.filter((e) => e.examType === 'final'), currentTerm)
  );

  // Unlike the sections above, this isn't scoped to the current term — it's every future exam
  // across all terms, for students who want to plan further ahead. Plain chronological order (not
  // priority-sorted) since the point here is "what's coming up over time", not "what's urgent now".
  const allUpcomingExams = [...dedupedExams]
    .filter((e) => e.examType === 'final' || isCurrentlyTracked(e.subjectKey))
    .sort((a, b) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0));

  const holidayRows = await db
    .prepare('SELECT * FROM holidays WHERE user_id = ? AND date_end >= ? ORDER BY date_start ASC')
    .all(userId, todayIso);

  const holidays = holidayRows.map((row) => ({
    id: row.id,
    label: row.label || 'Holiday Break',
    dateStart: row.date_start,
    dateEnd: row.date_end,
    term: row.term,
    weekNumber: row.week_number,
    daysUntil: daysUntil(row.date_start, todayUtc),
  }));

  res.json({ periodicExams, finalExams, allUpcomingExams, holidays, today: todayIso });
});

export default router;
