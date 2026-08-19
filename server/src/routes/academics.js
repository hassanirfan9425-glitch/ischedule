import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { aiCallLimiter, aiCostLimiter, tryConsumeAiBudget } from '../middleware/aiRateLimit.js';

// Grade parsing is a single Gemini call per upload.
const GRADE_UPLOAD_COST = 1;
import { SUBJECT_BY_KEY, gradeWeights, subjectOverallWeight, isAmsSubcourse, isPassingGrade } from '../constants/subjects.js';
import { parseGrades } from '../services/gradeParser.js';
import { generateSuggestions } from '../services/suggestionGenerator.js';
import { getTodayIso } from '../utils/uaeDate.js';

// How much the overall average has to move (in either direction) since the last generated batch
// of suggestions before it's worth spending an AI call on fresh ones.
const SUGGESTION_CHANGE_THRESHOLD = 2.5;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Only PDF, PNG, JPEG, WEBP, or GIF files are supported.'));
    }
    cb(null, true);
  },
});

const router = Router();

function daysBetween(isoA, isoB) {
  const a = new Date(`${isoA}T00:00:00Z`);
  const b = new Date(`${isoB}T00:00:00Z`);
  return Math.abs(Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

// Figures out "what term is it right now" from the student's own schedule (date range each
// term's exams span) plus today's date — used to tag new grade entries with the right term
// without asking the student to pick one. Falls back to the nearest term if today lands in a
// gap (e.g. a holiday between terms), and to term 1 if there's no schedule at all yet.
export async function determineCurrentTerm(userId, todayIso) {
  const rows = await db
    .prepare(
      `SELECT term, COALESCE(date, date_start) AS d1, COALESCE(date, date_end, date_start) AS d2
       FROM exams WHERE user_id = ? AND term IS NOT NULL`
    )
    .all(userId);
  if (rows.length === 0) return 1;

  const ranges = {};
  for (const r of rows) {
    if (!r.d1 || !r.d2) continue;
    if (!ranges[r.term]) ranges[r.term] = { min: r.d1, max: r.d2 };
    if (r.d1 < ranges[r.term].min) ranges[r.term].min = r.d1;
    if (r.d2 > ranges[r.term].max) ranges[r.term].max = r.d2;
  }

  const terms = Object.keys(ranges).map(Number).sort((a, b) => a - b);
  if (terms.length === 0) return 1;

  for (const t of terms) {
    if (todayIso >= ranges[t].min && todayIso <= ranges[t].max) return t;
  }

  let closest = terms[0];
  let closestDist = Infinity;
  for (const t of terms) {
    const dist =
      todayIso < ranges[t].min
        ? daysBetween(todayIso, ranges[t].min)
        : daysBetween(ranges[t].max, todayIso);
    if (dist < closestDist) {
      closestDist = dist;
      closest = t;
    }
  }
  return closest;
}

// AMS-only, not periodic — this is meant to reward keeping up with the routine weekly work, not
// exam performance (which already has its own priority/pass-fail treatment elsewhere). Needs at
// least 2 back-to-back 90+ entries before it counts as a "streak" worth showing at all; a single
// good week isn't a streak.
const STREAK_GRADE_FLOOR = 90;
const STREAK_MIN_LENGTH = 2;

// A single below-90 week doesn't kill an established streak outright — it goes "at risk" (shown
// greyed out, count preserved) for exactly one more week. A 90+ right after recovers it (back to
// active, count continues climbing); a SECOND dip in a row while already at risk means the grace
// wasn't used in time and the streak actually breaks back to zero.
function calculateAmsStreakInfo(entries) {
  const amsEntries = entries
    .filter((e) => isAmsSubcourse(e.subcourse_label))
    .slice()
    .sort((a, b) => (a.week_number ?? -1) - (b.week_number ?? -1));

  let streak = 0;
  let status = 'none'; // 'active' | 'atRisk' | 'none'

  for (const e of amsEntries) {
    if (e.grade >= STREAK_GRADE_FLOOR) {
      if (status === 'active' || status === 'atRisk') {
        streak += 1;
      } else {
        streak = 1;
      }
      status = 'active';
    } else if (status === 'active' && streak >= STREAK_MIN_LENGTH) {
      status = 'atRisk';
    } else {
      streak = 0;
      status = 'none';
    }
  }

  if (streak < STREAK_MIN_LENGTH) return { streak: 0, status: 'none' };
  return { streak, status };
}

// Weighted average for one subject's own entries, then a WEIGHTED average of every subject's
// average to get the one headline number for the term (per the school's rubric) — most subjects
// count equally, but subjectOverallWeight() lets a subject (currently: every AP elective) count
// for almost nothing toward this overall number without changing how that subject's own average
// is computed.
export function calculateTermSummary(entries) {
  const bySubject = {};
  for (const e of entries) {
    const key = e.subject_key || `label:${e.subject_label}`;
    if (!bySubject[key]) bySubject[key] = { subjectKey: e.subject_key, subjectLabel: e.subject_label, entries: [] };
    bySubject[key].entries.push(e);
  }

  const subjectAverages = Object.values(bySubject).map((group) => {
    const weights = gradeWeights(group.subjectKey);
    let weightedSum = 0;
    let weightTotal = 0;
    for (const e of group.entries) {
      const w = isAmsSubcourse(e.subcourse_label) ? weights.ams : weights.periodic;
      weightedSum += e.grade * w;
      weightTotal += w;
    }
    const average = weightTotal > 0 ? weightedSum / weightTotal : null;
    const { streak: amsStreak, status: amsStreakStatus } = calculateAmsStreakInfo(group.entries);
    return {
      subjectKey: group.subjectKey,
      subjectLabel: group.subjectLabel,
      average,
      passing: average !== null ? isPassingGrade(average) : null,
      amsStreak,
      amsStreakStatus,
    };
  });

  const valid = subjectAverages.filter((s) => s.average !== null);
  let overallAverage = null;
  if (valid.length > 0) {
    let overallWeightedSum = 0;
    let overallWeightTotal = 0;
    for (const s of valid) {
      const w = subjectOverallWeight(s.subjectKey);
      overallWeightedSum += s.average * w;
      overallWeightTotal += w;
    }
    overallAverage = overallWeightTotal > 0 ? overallWeightedSum / overallWeightTotal : null;
  }
  const overallPassing = overallAverage !== null ? isPassingGrade(overallAverage) : null;

  return { subjectAverages, overallAverage, overallPassing };
}

// Regenerates suggestions the first time a term ever has entries, or whenever the overall average
// has moved by SUGGESTION_CHANGE_THRESHOLD points (up or down) since the last batch — not on every
// single edit, so this doesn't burn an AI call per keystroke. Failure here shouldn't break whatever
// grade action triggered it, so errors are swallowed (logged only).
async function maybeRegenerateSuggestions(userId, term) {
  try {
    const rawEntries = await db.prepare('SELECT * FROM grade_entries WHERE user_id = ? AND term = ?').all(userId, term);

    if (rawEntries.length === 0) {
      await db.prepare('DELETE FROM grade_suggestions WHERE user_id = ? AND term = ?').run(userId, term);
      return;
    }

    const { subjectAverages, overallAverage } = calculateTermSummary(rawEntries);
    const validAverages = subjectAverages.filter((s) => s.average !== null);
    if (validAverages.length === 0 || overallAverage === null) return;

    const existing = await db
      .prepare('SELECT * FROM grade_suggestions WHERE user_id = ? AND term = ?')
      .get(userId, term);

    const shouldRegenerate =
      !existing || Math.abs(overallAverage - existing.baseline_average) >= SUGGESTION_CHANGE_THRESHOLD;
    if (!shouldRegenerate) return;

    // This is the one place across all four call sites (manual entry, upload, term move, delete)
    // that actually reaches Gemini — checked here, not at the route level, so routes that end up
    // not needing a regeneration (the common case) never touch the shared AI budget at all.
    if (!tryConsumeAiBudget(1)) return;

    const difficultyByKey = Object.fromEntries(
      (await db.prepare('SELECT subject_key, difficulty FROM user_subjects WHERE user_id = ?').all(userId)).map(
        (r) => [r.subject_key, r.difficulty]
      )
    );

    const suggestions = await generateSuggestions({ subjectAverages: validAverages, difficultyByKey });

    await db
      .prepare(
        `INSERT INTO grade_suggestions (user_id, term, suggestions, baseline_average, generated_at)
         VALUES (?, ?, ?, ?, NOW())
         ON CONFLICT(user_id, term) DO UPDATE SET
           suggestions = excluded.suggestions,
           baseline_average = excluded.baseline_average,
           generated_at = excluded.generated_at`
      )
      .run(userId, term, JSON.stringify(suggestions), overallAverage);
  } catch (err) {
    console.error('Suggestion generation failed:', err.message || err);
  }
}

router.get('/', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const todayIso = getTodayIso();
  const currentTerm = await determineCurrentTerm(userId, todayIso);

  const rows = await db
    .prepare('SELECT * FROM grade_entries WHERE user_id = ? ORDER BY term ASC, subject_label ASC, week_number ASC')
    .all(userId);

  const byTerm = {};
  for (const row of rows) {
    if (!byTerm[row.term]) byTerm[row.term] = [];
    byTerm[row.term].push({
      id: row.id,
      subjectKey: row.subject_key,
      subjectLabel: row.subject_label,
      subcourseLabel: row.subcourse_label,
      weekNumber: row.week_number,
      grade: row.grade,
      source: row.source,
    });
  }

  // Only show tables for terms that actually have entries — once a term is empty (nothing ever
  // added, or everything moved out via the term-change control), it drops off the list. Before
  // the student has entered anything at all, default to a single empty Term 1 table.
  const termsWithEntries = [...new Set(rows.map((r) => r.term))].sort((a, b) => a - b);
  const terms = termsWithEntries.length > 0 ? termsWithEntries : [1];

  const suggestionRows = await db
    .prepare('SELECT term, suggestions FROM grade_suggestions WHERE user_id = ?')
    .all(userId);
  const suggestionsByTerm = Object.fromEntries(
    suggestionRows.map((r) => [r.term, JSON.parse(r.suggestions)])
  );

  const goalRows = await db.prepare('SELECT * FROM grade_goals WHERE user_id = ?').all(userId);
  const goalsByTerm = {};
  for (const g of goalRows) {
    if (!goalsByTerm[g.term]) goalsByTerm[g.term] = { overall: null, subjects: {} };
    if (g.goal_identity === 'overall') {
      goalsByTerm[g.term].overall = { id: g.id, targetAverage: g.target_average };
    } else {
      goalsByTerm[g.term].subjects[g.goal_identity] = {
        id: g.id,
        targetAverage: g.target_average,
        subjectKey: g.subject_key,
        subjectLabel: g.subject_label,
      };
    }
  }

  const result = terms.map((term) => {
    const entries = byTerm[term] || [];
    const rawEntries = rows.filter((r) => r.term === term);
    const { subjectAverages, overallAverage, overallPassing } = calculateTermSummary(rawEntries);
    return {
      term,
      entries,
      subjectAverages,
      overallAverage,
      overallPassing,
      suggestions: suggestionsByTerm[term] || [],
      goals: goalsByTerm[term] || { overall: null, subjects: {} },
    };
  });

  res.json({ terms: result, currentTerm });
});

router.post('/manual', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { subjectKey, subjectLabel, subcourseLabel, weekNumber, grade, term } = req.body || {};

  const resolvedLabel = subjectKey && SUBJECT_BY_KEY[subjectKey] ? SUBJECT_BY_KEY[subjectKey].label : subjectLabel;
  if (!resolvedLabel || typeof resolvedLabel !== 'string' || !resolvedLabel.trim()) {
    return res.status(400).json({ error: 'A subject name is required.' });
  }
  if (!subcourseLabel || typeof subcourseLabel !== 'string' || !subcourseLabel.trim()) {
    return res.status(400).json({ error: 'A subcourse name is required.' });
  }
  const gradeNum = Number(grade);
  if (!Number.isFinite(gradeNum) || gradeNum < 0 || gradeNum > 100) {
    return res.status(400).json({ error: 'Grade must be a number between 0 and 100.' });
  }

  const todayIso = getTodayIso();
  const resolvedTerm = Number.isInteger(term) ? term : await determineCurrentTerm(userId, todayIso);

  const info = await db
    .prepare(
      `INSERT INTO grade_entries (user_id, term, subject_key, subject_label, subcourse_label, week_number, grade, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')`
    )
    .run(
      userId,
      resolvedTerm,
      subjectKey && SUBJECT_BY_KEY[subjectKey] ? subjectKey : null,
      resolvedLabel.trim(),
      subcourseLabel.trim(),
      Number.isInteger(weekNumber) ? weekNumber : null,
      gradeNum
    );

  await maybeRegenerateSuggestions(userId, resolvedTerm);

  res.json({ ok: true, id: info.lastInsertRowid, term: resolvedTerm });
});

router.post('/upload', requireAuth, aiCostLimiter(GRADE_UPLOAD_COST), aiCallLimiter, (req, res) => {
  upload.single('grades')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file was attached.' });
    }

    const userId = req.session.userId;

    try {
      const result = await parseGrades({ filePath: req.file.path, mimeType: req.file.mimetype });
      const entries = Array.isArray(result.entries) ? result.entries : [];

      if (entries.length === 0) {
        return res.status(422).json({ error: 'No grades were found in this file. Nothing was added.' });
      }

      // Prefer the term printed on the report itself — only fall back to inferring it from the
      // schedule when the report doesn't clearly show one. The user can always correct it after.
      let term;
      if (Number.isInteger(result.term) && result.term >= 1 && result.term <= 6) {
        term = result.term;
      } else {
        const todayIso = getTodayIso();
        term = await determineCurrentTerm(userId, todayIso);
      }

      // The AI has no way to know whether "Islamic Education" on a report means Islamic 1 (Arab)
      // or Islamic 2 (non-Arab) — that's determined by the student's own arab/muslim quiz answers,
      // not anything printed on the report. Whichever of the two is actually in their subject list
      // is the ground truth, so any Islamic match gets forced to that one regardless of what the
      // AI guessed from the report text.
      const islamicRow = await db
        .prepare("SELECT subject_key FROM user_subjects WHERE user_id = ? AND subject_key IN ('core_islamic_1', 'core_islamic_2')")
        .get(userId);
      const correctIslamicKey = islamicRow?.subject_key || null;

      const insert = db.prepare(
        `INSERT INTO grade_entries (user_id, term, subject_key, subject_label, subcourse_label, week_number, grade, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ai')`
      );
      let inserted = 0;
      for (const e of entries) {
        const gradeNum = Number(e.grade);
        if (!e.subcourse || !Number.isFinite(gradeNum)) continue;
        let subjectKey = e.matchedSubjectKey && SUBJECT_BY_KEY[e.matchedSubjectKey] ? e.matchedSubjectKey : null;
        if (correctIslamicKey && (subjectKey === 'core_islamic_1' || subjectKey === 'core_islamic_2')) {
          subjectKey = correctIslamicKey;
        }
        const subjectLabel = subjectKey ? SUBJECT_BY_KEY[subjectKey].label : e.course || 'Unknown Subject';
        await insert.run(
          userId,
          term,
          subjectKey,
          subjectLabel,
          String(e.subcourse).trim(),
          Number.isInteger(e.week) ? e.week : null,
          gradeNum
        );
        inserted += 1;
      }

      if (inserted === 0) {
        return res.status(422).json({ error: 'No valid grades were found in this file. Nothing was added.' });
      }

      await maybeRegenerateSuggestions(userId, term);

      res.json({ ok: true, inserted, term });
    } catch (parseErr) {
      res.status(500).json({ error: `Could not analyze the grades: ${parseErr.message || parseErr}` });
    }
  });
});

// Lets the student correct the term a whole table's entries got tagged with — e.g. the AI missed
// a term number on the report, or inferred the wrong one from the schedule.
router.patch('/term', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { fromTerm, toTerm } = req.body || {};

  if (!Number.isInteger(fromTerm) || !Number.isInteger(toTerm) || toTerm < 1 || toTerm > 6) {
    return res.status(400).json({ error: 'toTerm must be an integer between 1 and 6.' });
  }
  if (fromTerm === toTerm) {
    return res.json({ ok: true });
  }

  await db.prepare('UPDATE grade_entries SET term = ? WHERE user_id = ? AND term = ?').run(toTerm, userId, fromTerm);
  // The moved-to term's suggestions are now stale (different entries feed into it) — drop both
  // and let the next grade action regenerate fresh ones for the merged term.
  await db.prepare('DELETE FROM grade_suggestions WHERE user_id = ? AND term IN (?, ?)').run(userId, fromTerm, toTerm);
  await maybeRegenerateSuggestions(userId, toTerm);

  res.json({ ok: true });
});

router.delete('/term/:term', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const term = Number(req.params.term);
  if (!Number.isInteger(term)) {
    return res.status(400).json({ error: 'Invalid term.' });
  }
  await db.prepare('DELETE FROM grade_entries WHERE user_id = ? AND term = ?').run(userId, term);
  await db.prepare('DELETE FROM grade_suggestions WHERE user_id = ? AND term = ?').run(userId, term);
  res.json({ ok: true });
});

router.delete('/:entryId', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const entryId = Number(req.params.entryId);
  const entry = await db.prepare('SELECT term FROM grade_entries WHERE id = ? AND user_id = ?').get(entryId, userId);
  if (!entry) {
    return res.status(404).json({ error: 'Grade entry not found.' });
  }
  await db.prepare('DELETE FROM grade_entries WHERE id = ? AND user_id = ?').run(entryId, userId);
  await maybeRegenerateSuggestions(userId, entry.term);
  res.json({ ok: true });
});

export default router;
