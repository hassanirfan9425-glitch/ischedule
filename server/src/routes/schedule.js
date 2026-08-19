import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { db, transaction } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { aiCallLimiter, aiCostLimiter } from '../middleware/aiRateLimit.js';

// Worst case per hit: 1 classify call + up to 6 turns for a general-calendar parse (the final-exam
// path is cheaper, at 1 + 3, but the cost is charged before the route knows which one this is).
const SCHEDULE_UPLOAD_COST = 7;
import { SUBJECT_BY_KEY, AUTO_SUBJECTS } from '../constants/subjects.js';
import { parseSchedule } from '../services/scheduleParser.js';
import { classifyScheduleDocument } from '../services/scheduleClassifier.js';
import { parseFinalExamSchedule } from '../services/finalExamParser.js';
import { shiftScheduleDate } from '../utils/scheduleYearShift.js';

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

// The AI pipeline below can take minutes (classify + up to 6 parsing turns), which is well past
// Netlify's ~30s proxy timeout in production. So this only does the fast part (save the file,
// create the upload record) before responding — the actual parsing runs after the response is
// sent, and the frontend polls GET /status instead of waiting on this request.
async function processScheduleUpload({ userId, uploadId, file }) {
  try {
    const ratedSubjects = (
      await db.prepare('SELECT subject_key FROM user_subjects WHERE user_id = ?').all(userId)
    )
      .map((row) => SUBJECT_BY_KEY[row.subject_key])
      .filter(Boolean);
    // AMS/Grid/MOES apply to every student automatically — always offer them as matching
    // candidates even though nobody rates them in the quiz.
    const selectedSubjects = [...ratedSubjects, ...AUTO_SUBJECTS];

    // Same "+" upload accepts either document — a cheap triage call decides which pipeline runs,
    // so the student never has to pick a document type themselves. "unknown" falls back to the
    // general-calendar pipeline, since that's the only document type this app accepted before
    // final-exam-timetable support existed.
    const docType = await classifyScheduleDocument({
      filePath: file.path,
      mimeType: file.mimetype,
    });

    if (docType === 'final_exam_timetable') {
      const result = await parseFinalExamSchedule({
        filePath: file.path,
        mimeType: file.mimetype,
        selectedSubjects,
      });

      const term = Number.isInteger(result.term) ? result.term : null;
      if (term === null) {
        throw new Error(
          "Couldn't confidently tell which term this final exam timetable is for. Make sure the title showing the term is clearly visible and try again."
        );
      }

      const exams = Array.isArray(result.exams) ? result.exams : [];

      const persistFinals = transaction(async () => {
        // Additive relative to the rest of the schedule: only this term's final exams are
        // replaced — periodic exams, holidays, and every other term's finals are untouched.
        await db
          .prepare("DELETE FROM exams WHERE user_id = ? AND exam_type = 'final' AND term = ?")
          .run(userId, term);

        const insertExam = db.prepare(`
          INSERT INTO exams (user_id, upload_id, subject_key, subject_label, exam_type, term, date, time, notes)
          VALUES (?, ?, ?, ?, 'final', ?, ?, ?, ?)
        `);
        for (const e of exams) {
          if (!e.subjectLabel || !e.date) continue;
          const subjectKey = e.matchedSubjectKey && SUBJECT_BY_KEY[e.matchedSubjectKey] ? e.matchedSubjectKey : null;
          await insertExam.run(userId, uploadId, subjectKey, e.subjectLabel, term, shiftScheduleDate(e.date), e.time ?? null, e.notes ?? null);
        }

        await db.prepare('UPDATE schedule_uploads SET status = ? WHERE id = ?').run('done', uploadId);
      });
      await persistFinals();
      return;
    }

    const result = await parseSchedule({
      filePath: file.path,
      mimeType: file.mimetype,
      selectedSubjects,
    });

    const holidays = Array.isArray(result.holidays) ? result.holidays : [];
    const exams = Array.isArray(result.exams) ? result.exams : [];

    // The calendar PDF literally prints "AMS" for Term 1's very first assessment week, but
    // every other term's first week prints as "Grid" — that week actually runs as a Grid Exam
    // at this school despite what the calendar says, so relabel it to match reality.
    for (const e of exams) {
      if (e.term === 1 && e.weekNumber === 1 && e.matchedSubjectKey === 'ams') {
        e.matchedSubjectKey = 'grid_exam';
        e.subjectLabel = 'Grid Exam';
      }
    }

    const persist = transaction(async () => {
      // A fresh upload replaces the previous one's extracted data entirely.
      await db.prepare('DELETE FROM exams WHERE user_id = ?').run(userId);
      await db.prepare('DELETE FROM holidays WHERE user_id = ?').run(userId);

      const insertHoliday = db.prepare(`
        INSERT INTO holidays (user_id, upload_id, label, date_start, date_end, term, week_number)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const h of holidays) {
        if (!h.dateStart || !h.dateEnd) continue;
        await insertHoliday.run(
          userId,
          uploadId,
          h.label ?? null,
          shiftScheduleDate(h.dateStart),
          shiftScheduleDate(h.dateEnd),
          h.term ?? null,
          h.weekNumber ?? null
        );
      }

      const insertExam = db.prepare(`
        INSERT INTO exams (user_id, upload_id, subject_key, subject_label, exam_type, term, week_number, date, date_start, date_end, time, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const e of exams) {
        if (!e.subjectLabel) continue;
        const subjectKey = e.matchedSubjectKey && SUBJECT_BY_KEY[e.matchedSubjectKey] ? e.matchedSubjectKey : null;
        const examType = EXAM_TYPES.has(e.examType) ? e.examType : 'weekly';
        await insertExam.run(
          userId,
          uploadId,
          subjectKey,
          e.subjectLabel,
          examType,
          e.term ?? null,
          e.weekNumber ?? null,
          shiftScheduleDate(e.date ?? null),
          shiftScheduleDate(e.dateStart ?? null),
          shiftScheduleDate(e.dateEnd ?? null),
          e.time ?? null,
          e.notes ?? null
        );
      }

      await db.prepare('UPDATE schedule_uploads SET status = ? WHERE id = ?').run('done', uploadId);
      await db.prepare('UPDATE users SET onboarded = 1 WHERE id = ?').run(userId);
    });
    await persist();
  } catch (parseErr) {
    await db.prepare('UPDATE schedule_uploads SET status = ?, error = ? WHERE id = ?').run(
      'error',
      String(parseErr.message || parseErr),
      uploadId
    );
  }
}

router.post('/upload', requireAuth, aiCostLimiter(SCHEDULE_UPLOAD_COST), aiCallLimiter, (req, res) => {
  upload.single('schedule')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file was attached.' });
    }

    const userId = req.session.userId;
    const uploadInfo = await db
      .prepare(
        'INSERT INTO schedule_uploads (user_id, filename, original_name, status) VALUES (?, ?, ?, ?)'
      )
      .run(userId, req.file.filename, req.file.originalname, 'processing');
    const uploadId = uploadInfo.lastInsertRowid;

    res.json({ ok: true, uploadId });
    processScheduleUpload({ userId, uploadId, file: req.file });
  });
});

router.get('/status', requireAuth, async (req, res) => {
  const latest = await db
    .prepare('SELECT * FROM schedule_uploads WHERE user_id = ? ORDER BY id DESC LIMIT 1')
    .get(req.session.userId);
  res.json({ upload: latest || null });
});

// Wipes the whole schedule (both AI-parsed and manually-entered exams, plus holidays) back to
// empty — exam_materials cascade-delete with their exams. Doesn't touch onboarded/quiz answers.
router.delete('/', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const deleteAll = transaction(async () => {
    await db.prepare('DELETE FROM exams WHERE user_id = ?').run(userId);
    await db.prepare('DELETE FROM holidays WHERE user_id = ?').run(userId);
  });
  await deleteAll();
  res.json({ ok: true });
});

// Removes only final exam entries (every term) — periodic exams, holidays, and manually-entered
// non-final exams are untouched. Lets a student clear out a final exam timetable (e.g. re-added
// via the Final Exam Timetable upload) without wiping the rest of their schedule.
router.delete('/final', requireAuth, async (req, res) => {
  await db.prepare("DELETE FROM exams WHERE user_id = ? AND exam_type = 'final'").run(req.session.userId);
  res.json({ ok: true });
});

export default router;
