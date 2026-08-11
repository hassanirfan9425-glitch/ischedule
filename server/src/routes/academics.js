import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { SUBJECT_BY_KEY, gradeWeights, isAmsSubcourse } from '../constants/subjects.js';
import { parseGrades } from '../services/gradeParser.js';
import { generateSuggestions } from '../services/suggestionGenerator.js';

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
async function determineCurrentTerm(userId, todayIso) {
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

// Weighted average for one subject's own entries, then a plain average of every subject's
// average to get the one headline number for the term — per the school's rubric.
function calculateTermSummary(entries) {
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
    return {
      subjectKey: group.subjectKey,
      subjectLabel: group.subjectLabel,
      average: weightTotal > 0 ? weightedSum / weightTotal : null,
    };
  });

  const valid = subjectAverages.filter((s) => s.average !== null);
  const overallAverage = valid.length > 0 ? valid.reduce((a, s) => a + s.average, 0) / valid.length : null;

  return { subjectAverages, overallAverage };
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
  const todayIso = (process.env.FAKE_TODAY || new Date().toISOString().slice(0, 10));
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

  const terms = [...new Set([...Object.keys(byTerm).map(Number), currentTerm])].sort((a, b) => a - b);

  const suggestionRows = await db
    .prepare('SELECT term, suggestions FROM grade_suggestions WHERE user_id = ?')
    .all(userId);
  const suggestionsByTerm = Object.fromEntries(
    suggestionRows.map((r) => [r.term, JSON.parse(r.suggestions)])
  );

  const result = terms.map((term) => {
    const entries = byTerm[term] || [];
    const rawEntries = rows.filter((r) => r.term === term);
    const { subjectAverages, overallAverage } = calculateTermSummary(rawEntries);
    return { term, entries, subjectAverages, overallAverage, suggestions: suggestionsByTerm[term] || [] };
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

  const todayIso = process.env.FAKE_TODAY || new Date().toISOString().slice(0, 10);
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

router.post('/upload', requireAuth, (req, res) => {
  upload.single('grades')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file was attached.' });
    }

    const userId = req.session.userId;
    const todayIso = process.env.FAKE_TODAY || new Date().toISOString().slice(0, 10);
    const term = await determineCurrentTerm(userId, todayIso);

    try {
      const result = await parseGrades({ filePath: req.file.path, mimeType: req.file.mimetype });
      const entries = Array.isArray(result.entries) ? result.entries : [];

      if (entries.length === 0) {
        return res.status(422).json({ error: 'No grades were found in this file. Nothing was added.' });
      }

      const insert = db.prepare(
        `INSERT INTO grade_entries (user_id, term, subject_key, subject_label, subcourse_label, week_number, grade, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ai')`
      );
      let inserted = 0;
      for (const e of entries) {
        const gradeNum = Number(e.grade);
        if (!e.subcourse || !Number.isFinite(gradeNum)) continue;
        const subjectKey = e.matchedSubjectKey && SUBJECT_BY_KEY[e.matchedSubjectKey] ? e.matchedSubjectKey : null;
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

router.delete('/', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  await db.prepare('DELETE FROM grade_entries WHERE user_id = ?').run(userId);
  await db.prepare('DELETE FROM grade_suggestions WHERE user_id = ?').run(userId);
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
