import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { SUBJECT_BY_KEY } from '../constants/subjects.js';

const router = Router();

function goalIdentity(kind, subjectKey, subjectLabel) {
  return kind === 'overall' ? 'overall' : (subjectKey || `label:${subjectLabel}`);
}

// One upsert for both "set a new goal" and "edit an existing one" — same ON CONFLICT shape
// grade_suggestions already uses for its own per-(user,term) singleton rows.
router.put('/', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { term, kind, subjectKey, subjectLabel, targetAverage } = req.body || {};

  if (!Number.isInteger(term) || term < 1 || term > 6) {
    return res.status(400).json({ error: 'term must be an integer between 1 and 6.' });
  }
  if (kind !== 'overall' && kind !== 'subject') {
    return res.status(400).json({ error: `Invalid kind: ${kind}` });
  }
  const targetNum = Number(targetAverage);
  if (!Number.isFinite(targetNum) || targetNum < 0 || targetNum > 100) {
    return res.status(400).json({ error: 'targetAverage must be a number between 0 and 100.' });
  }

  let resolvedKey = null;
  let resolvedLabel = null;
  if (kind === 'subject') {
    resolvedKey = subjectKey && SUBJECT_BY_KEY[subjectKey] ? subjectKey : null;
    resolvedLabel = (resolvedKey ? SUBJECT_BY_KEY[resolvedKey].label : String(subjectLabel || '')).trim();
    if (!resolvedLabel) {
      return res.status(400).json({ error: 'A subject is required for a subject goal.' });
    }
  }

  const identity = goalIdentity(kind, resolvedKey, resolvedLabel);

  await db
    .prepare(
      `INSERT INTO grade_goals (user_id, term, goal_identity, subject_key, subject_label, target_average, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())
       ON CONFLICT (user_id, term, goal_identity) DO UPDATE SET
         target_average = excluded.target_average,
         subject_label = excluded.subject_label,
         updated_at = excluded.updated_at`
    )
    .run(userId, term, identity, resolvedKey, resolvedLabel, targetNum);

  res.json({ ok: true, goal: { term, kind, subjectKey: resolvedKey, subjectLabel: resolvedLabel, targetAverage: targetNum } });
});

router.delete('/:goalId', requireAuth, async (req, res) => {
  const info = await db
    .prepare('DELETE FROM grade_goals WHERE id = ? AND user_id = ?')
    .run(req.params.goalId, req.session.userId);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Goal not found.' });
  }
  res.json({ ok: true });
});

export default router;
