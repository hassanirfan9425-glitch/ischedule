import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { db, transaction } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { SUBJECT_BY_KEY, AUTO_SUBJECTS } from '../constants/subjects.js';
import { parseSchedule } from '../services/scheduleParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const EXAM_TYPES = new Set(['weekly', 'saturday', 'final']);

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

router.post('/upload', requireAuth, (req, res) => {
  upload.single('schedule')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file was attached.' });
    }

    const userId = req.session.userId;
    const uploadInfo = db
      .prepare(
        'INSERT INTO schedule_uploads (user_id, filename, original_name, status) VALUES (?, ?, ?, ?)'
      )
      .run(userId, req.file.filename, req.file.originalname, 'processing');
    const uploadId = uploadInfo.lastInsertRowid;

    try {
      const ratedSubjects = db
        .prepare('SELECT subject_key FROM user_subjects WHERE user_id = ?')
        .all(userId)
        .map((row) => SUBJECT_BY_KEY[row.subject_key])
        .filter(Boolean);
      // AMS/Grid/MOES apply to every student automatically — always offer them as matching
      // candidates even though nobody rates them in the quiz.
      const selectedSubjects = [...ratedSubjects, ...AUTO_SUBJECTS];

      const result = await parseSchedule({
        filePath: req.file.path,
        mimeType: req.file.mimetype,
        selectedSubjects,
      });

      const holidays = Array.isArray(result.holidays) ? result.holidays : [];
      const exams = Array.isArray(result.exams) ? result.exams : [];

      const persist = transaction(() => {
        // A fresh upload replaces the previous one's extracted data entirely.
        db.prepare('DELETE FROM exams WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM holidays WHERE user_id = ?').run(userId);

        const insertHoliday = db.prepare(`
          INSERT INTO holidays (user_id, upload_id, label, date_start, date_end, term, week_number)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const h of holidays) {
          if (!h.dateStart || !h.dateEnd) continue;
          insertHoliday.run(userId, uploadId, h.label ?? null, h.dateStart, h.dateEnd, h.term ?? null, h.weekNumber ?? null);
        }

        const insertExam = db.prepare(`
          INSERT INTO exams (user_id, upload_id, subject_key, subject_label, exam_type, term, week_number, date, date_start, date_end, time, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const e of exams) {
          if (!e.subjectLabel) continue;
          const subjectKey = e.matchedSubjectKey && SUBJECT_BY_KEY[e.matchedSubjectKey] ? e.matchedSubjectKey : null;
          const examType = EXAM_TYPES.has(e.examType) ? e.examType : 'weekly';
          insertExam.run(
            userId,
            uploadId,
            subjectKey,
            e.subjectLabel,
            examType,
            e.term ?? null,
            e.weekNumber ?? null,
            e.date ?? null,
            e.dateStart ?? null,
            e.dateEnd ?? null,
            e.time ?? null,
            e.notes ?? null
          );
        }

        db.prepare('UPDATE schedule_uploads SET status = ? WHERE id = ?').run('done', uploadId);
        db.prepare('UPDATE users SET onboarded = 1 WHERE id = ?').run(userId);
      });
      persist();

      res.json({
        ok: true,
        academicYearLabel: result.academicYearLabel ?? null,
        holidaysFound: holidays.length,
        examsFound: exams.length,
      });
    } catch (parseErr) {
      db.prepare('UPDATE schedule_uploads SET status = ?, error = ? WHERE id = ?').run(
        'error',
        String(parseErr.message || parseErr),
        uploadId
      );
      res.status(500).json({ error: `Could not analyze the schedule: ${parseErr.message || parseErr}` });
    }
  });
});

router.get('/status', requireAuth, (req, res) => {
  const latest = db
    .prepare('SELECT * FROM schedule_uploads WHERE user_id = ? ORDER BY id DESC LIMIT 1')
    .get(req.session.userId);
  res.json({ upload: latest || null });
});

export default router;
