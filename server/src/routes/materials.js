import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { aiCallLimiter, aiCostLimiter } from '../middleware/aiRateLimit.js';

// Both material parsing and study-plan generation are a single Gemini call each.
const MATERIAL_ANALYSIS_COST = 1;
const STUDY_PLAN_COST = 1;
import { parseMaterial } from '../services/materialParser.js';
import { buildPastPaperLink } from '../utils/pastPaperLinks.js';
import { generateStudyPlan } from '../services/studyPlanGenerator.js';
import { SUBJECT_BY_KEY, studyPlanDays } from '../constants/subjects.js';
import { getTodayIso } from '../utils/uaeDate.js';

// Generating a plan is an AI call — this stops someone from mashing "Regenerate" and burning
// through the Gemini quota for no real benefit (the plan for the same exam isn't going to look
// meaningfully different a few seconds later anyway).
const STUDY_PLAN_COOLDOWN_MS = 60 * 1000;

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

router.post('/:examId', requireAuth, aiCostLimiter(MATERIAL_ANALYSIS_COST), aiCallLimiter, (req, res) => {
  upload.single('material')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file was attached.' });
    }

    const userId = req.session.userId;
    const examId = Number(req.params.examId);
    const exam = await db.prepare('SELECT * FROM exams WHERE id = ? AND user_id = ?').get(examId, userId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found.' });
    }

    try {
      const result = await parseMaterial({
        filePath: req.file.path,
        mimeType: req.file.mimetype,
        subjectLabel: exam.subject_label,
      });

      // Turn each raw {subjectCode, variant, session, year, questions} reference into a real link —
      // entries that don't build a valid link (missing/malformed data) are dropped rather than
      // stored as a broken one.
      const pastPapers = result.pastPapers
        .map((p) => {
          const link = buildPastPaperLink(p);
          return link ? { ...link, questions: p.questions } : null;
        })
        .filter(Boolean);

      // A fresh upload replaces any existing material for this exam — UNLESS this analysis found
      // nothing at all (no quizzes, no questions, no fallback details, no past papers), in which
      // case leave whatever's already stored untouched rather than wiping out good data with an
      // empty result.
      if (
        result.quizzes.length === 0 &&
        result.questions.length === 0 &&
        result.details.length === 0 &&
        pastPapers.length === 0
      ) {
        return res.status(422).json({
          error: 'No material could be found in this file. Nothing was changed.',
        });
      }

      await db
        .prepare(
          `INSERT INTO exam_materials (exam_id, user_id, source, filename, original_name, periodic_code, quizzes, questions, details, past_papers)
           VALUES (?, ?, 'ai', ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(exam_id) DO UPDATE SET
             user_id = excluded.user_id,
             source = 'ai',
             filename = excluded.filename,
             original_name = excluded.original_name,
             periodic_code = excluded.periodic_code,
             quizzes = excluded.quizzes,
             questions = excluded.questions,
             details = excluded.details,
             past_papers = excluded.past_papers,
             uploaded_at = NOW()`
        )
        .run(
          examId,
          userId,
          req.file.filename,
          req.file.originalname,
          result.periodicCode,
          JSON.stringify(result.quizzes),
          JSON.stringify(result.questions),
          JSON.stringify(result.details),
          JSON.stringify(pastPapers)
        );

      res.json({
        ok: true,
        periodicCode: result.periodicCode,
        quizzes: result.quizzes,
        questions: result.questions,
        details: result.details,
        pastPapers,
      });
    } catch (parseErr) {
      res.status(500).json({ error: `Could not analyze the material: ${parseErr.message || parseErr}` });
    }
  });
});

router.post('/:examId/manual', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const examId = Number(req.params.examId);
  const exam = await db.prepare('SELECT * FROM exams WHERE id = ? AND user_id = ?').get(examId, userId);
  if (!exam) {
    return res.status(404).json({ error: 'Exam not found.' });
  }

  const cleanList = (value) =>
    Array.isArray(value) ? value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()) : [];
  const quizzes = cleanList(req.body?.quizzes);
  const questions = cleanList(req.body?.questions);

  if (quizzes.length === 0 && questions.length === 0) {
    return res.status(400).json({ error: 'Type at least one course practice quiz or course question.' });
  }

  await db
    .prepare(
      `INSERT INTO exam_materials (exam_id, user_id, source, filename, original_name, periodic_code, quizzes, questions, details, past_papers)
       VALUES (?, ?, 'manual', NULL, NULL, NULL, ?, ?, '[]', '[]')
       ON CONFLICT(exam_id) DO UPDATE SET
         user_id = excluded.user_id,
         source = 'manual',
         filename = NULL,
         original_name = NULL,
         periodic_code = NULL,
         quizzes = excluded.quizzes,
         questions = excluded.questions,
         details = '[]',
         past_papers = '[]',
         uploaded_at = NOW()`
    )
    .run(examId, userId, JSON.stringify(quizzes), JSON.stringify(questions));

  res.json({ ok: true, quizzes, questions });
});

router.delete('/:examId', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const examId = Number(req.params.examId);
  const info = await db.prepare('DELETE FROM exam_materials WHERE exam_id = ? AND user_id = ?').run(examId, userId);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'No material found for that exam.' });
  }
  res.json({ ok: true });
});

// Every saved plan across every exam — lets the Home page show a live preview (e.g. the next
// task due) without the user having to open the picker first, and lets the picker show which
// exams already have one.
router.get('/study-plans', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const rows = await db
    .prepare(
      `SELECT sp.exam_id, sp.plan, sp.generated_at, e.subject_key, e.subject_label
       FROM study_plans sp
       JOIN exams e ON e.id = sp.exam_id
       WHERE sp.user_id = ?`
    )
    .all(userId);
  const plans = rows.map((row) => ({
    examId: row.exam_id,
    subjectLabel: row.subject_key ? SUBJECT_BY_KEY[row.subject_key]?.label ?? row.subject_label : row.subject_label,
    plan: JSON.parse(row.plan),
    generatedAt: row.generated_at,
  }));
  res.json({ plans });
});

router.get('/:examId/study-plan', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const examId = Number(req.params.examId);
  const row = await db
    .prepare('SELECT plan, generated_at FROM study_plans WHERE exam_id = ? AND user_id = ?')
    .get(examId, userId);
  if (!row) return res.json({ plan: null });
  res.json({ plan: JSON.parse(row.plan), generatedAt: row.generated_at });
});

router.post('/:examId/study-plan', requireAuth, aiCostLimiter(STUDY_PLAN_COST), aiCallLimiter, async (req, res) => {
  const userId = req.session.userId;
  const examId = Number(req.params.examId);
  const { daysUntil } = req.body || {};
  if (!Number.isFinite(daysUntil)) {
    return res.status(400).json({ error: 'daysUntil is required.' });
  }

  const exam = await db.prepare('SELECT * FROM exams WHERE id = ? AND user_id = ?').get(examId, userId);
  if (!exam) {
    return res.status(404).json({ error: 'Exam not found.' });
  }

  const existingPlan = await db.prepare('SELECT generated_at FROM study_plans WHERE exam_id = ? AND user_id = ?').get(examId, userId);
  if (existingPlan) {
    const elapsedMs = Date.now() - new Date(existingPlan.generated_at).getTime();
    if (elapsedMs < STUDY_PLAN_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((STUDY_PLAN_COOLDOWN_MS - elapsedMs) / 1000);
      return res.status(429).json({ error: `Please wait ${waitSeconds}s before regenerating this plan.` });
    }
  }

  const material = await db
    .prepare('SELECT quizzes, questions, details FROM exam_materials WHERE exam_id = ?')
    .get(examId);
  // A plan built on nothing but a subject name and difficulty rating isn't worth much — material
  // gives it something concrete to actually schedule, so it's required, not just optional context.
  if (!material) {
    return res.status(400).json({ error: 'Add material for this exam before generating a study plan.' });
  }
  const difficultyRow = exam.subject_key
    ? await db.prepare('SELECT difficulty FROM user_subjects WHERE user_id = ? AND subject_key = ?').get(userId, exam.subject_key)
    : null;

  const subjectLabel = exam.subject_key ? SUBJECT_BY_KEY[exam.subject_key]?.label ?? exam.subject_label : exam.subject_label;
  const clampedDaysUntil = Math.max(0, Math.round(daysUntil));
  // How far out the plan starts is driven by the subject's own difficulty rating, not a flat
  // number — very easy only needs a few days, very hard gets a couple weeks. Still can't plan for
  // days before "now" though, so this never exceeds how many days are actually left.
  const targetDays = studyPlanDays(difficultyRow?.difficulty || null);
  const planDays = Math.max(1, Math.min(targetDays, clampedDaysUntil || 1));

  const todayIso = getTodayIso();
  const examDate = new Date(`${todayIso}T00:00:00Z`);
  examDate.setUTCDate(examDate.getUTCDate() + clampedDaysUntil);

  try {
    const rawPlan = await generateStudyPlan({
      subjectLabel,
      difficulty: difficultyRow?.difficulty || null,
      planDays,
      quizzes: material ? JSON.parse(material.quizzes) : [],
      questions: material ? JSON.parse(material.questions) : [],
      details: material ? JSON.parse(material.details) : [],
    });

    // Each entry only carries "N days before the exam" from the model — turn that into an actual
    // calendar date here so the client can show something concrete without redoing this math.
    const plan = rawPlan.map((day) => {
      const d = new Date(examDate);
      d.setUTCDate(d.getUTCDate() - day.daysBeforeExam);
      return { ...day, date: d.toISOString().slice(0, 10) };
    });

    await db
      .prepare(
        `INSERT INTO study_plans (exam_id, user_id, plan, generated_at) VALUES (?, ?, ?, NOW())
         ON CONFLICT(exam_id) DO UPDATE SET user_id = excluded.user_id, plan = excluded.plan, generated_at = NOW()`
      )
      .run(examId, userId, JSON.stringify(plan));

    res.json({ ok: true, plan });
  } catch (err) {
    res.status(500).json({ error: `Could not generate a study plan: ${err.message || err}` });
  }
});

export default router;
