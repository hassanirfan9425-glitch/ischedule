import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { parseMaterial } from '../services/materialParser.js';

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

router.post('/:examId', requireAuth, (req, res) => {
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

      // A fresh upload replaces any existing material for this exam — UNLESS this analysis found
      // nothing at all, in which case leave whatever's already stored untouched rather than
      // wiping out good data with an empty result.
      if (result.quizzes.length === 0 && result.questions.length === 0) {
        return res.status(422).json({
          error: 'No quizzes or questions were found in this material. Nothing was changed.',
        });
      }

      await db
        .prepare(
          `INSERT INTO exam_materials (exam_id, user_id, source, filename, original_name, periodic_code, quizzes, questions)
           VALUES (?, ?, 'ai', ?, ?, ?, ?, ?)
           ON CONFLICT(exam_id) DO UPDATE SET
             user_id = excluded.user_id,
             source = 'ai',
             filename = excluded.filename,
             original_name = excluded.original_name,
             periodic_code = excluded.periodic_code,
             quizzes = excluded.quizzes,
             questions = excluded.questions,
             uploaded_at = NOW()`
        )
        .run(
          examId,
          userId,
          req.file.filename,
          req.file.originalname,
          result.periodicCode,
          JSON.stringify(result.quizzes),
          JSON.stringify(result.questions)
        );

      res.json({
        ok: true,
        periodicCode: result.periodicCode,
        quizzes: result.quizzes,
        questions: result.questions,
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
      `INSERT INTO exam_materials (exam_id, user_id, source, filename, original_name, periodic_code, quizzes, questions)
       VALUES (?, ?, 'manual', NULL, NULL, NULL, ?, ?)
       ON CONFLICT(exam_id) DO UPDATE SET
         user_id = excluded.user_id,
         source = 'manual',
         filename = NULL,
         original_name = NULL,
         periodic_code = NULL,
         quizzes = excluded.quizzes,
         questions = excluded.questions,
         uploaded_at = NOW()`
    )
    .run(examId, userId, JSON.stringify(quizzes), JSON.stringify(questions));

  res.json({ ok: true, quizzes, questions });
});

export default router;
