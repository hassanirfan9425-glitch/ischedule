import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { gradeWeights, subjectOverallWeight, isAmsSubcourse } from '../constants/subjects.js';
import { calculateTermSummary } from './academics.js';
import { getTodayIso } from '../utils/uaeDate.js';

const router = Router();

// Own local copy, matching the convention already used elsewhere in the codebase (GradeTable.jsx,
// reflections.js) — each module that needs subject identity resolution keeps its own tiny copy
// rather than sharing one.
function subjectIdentity(subjectKey, subjectLabel) {
  return subjectKey || `label:${subjectLabel}`;
}

// A best-case/worst-case swing (across the full 0-100 range of the solved-for subject) smaller
// than this many points means the subject barely moves the overall number — computed generically
// off the actual weight rather than hardcoded to "is this an AP subject", so it stays correct if
// subjectOverallWeight's scheme changes later (e.g. the AS boost going from 1.25 to 1.5).
const LOW_IMPACT_OVERALL_SWING = 1.0;

// Matches the grade table's own fixed week range (client's WEEKS = 1..14, see GradeTable.jsx) —
// AMS is a running weekly assessment with no calendar entry of its own anywhere in the app, so
// "how many are left" is modeled as "one per remaining week of the 14-week term" rather than
// pulled from real data (there's nothing to pull from). Periodic exams DO have real schedule data
// when the student's uploaded one, so those use the actual remaining count instead of this.
const TERM_WEEKS = 14;

// Solves "what uniform score across `count` more entries of this weight hits `targetAverage`",
// given the subject's existing weighted sum/total — the single-entry case is just count=1.
function solveNeededScore(targetAverage, weightedSum, weightTotal, weight, count) {
  const addedWeight = weight * count;
  const newWeightTotal = weightTotal + addedWeight;
  const neededScore = (targetAverage * newWeightTotal - weightedSum) / addedWeight;
  const bestPossibleAverage = (weightedSum + 100 * addedWeight) / newWeightTotal;
  const worstCaseAverage = weightedSum / newWeightTotal;
  return {
    neededScore,
    feasible: neededScore >= 0 && neededScore <= 100,
    bestPossibleAverage,
    worstCaseAverage,
    assessmentCount: count,
    assessmentWeight: weight,
  };
}

// Mode (a): given a target subject average, what do you need on what's left this term? Answers
// for both Periodic and AMS at once (no picking required) — Periodic uses the actual count of
// still-upcoming periodic exams from the student's own uploaded schedule when one exists for this
// subject/term, since that's real data the app already has; AMS has no such schedule (it's a
// running weekly assessment, never part of an uploaded exam timetable), so it's always "your next
// one AMS entry," same as Periodic falls back to when no schedule covers this subject.
router.post('/subject-target', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { term, subjectKey, subjectLabel, targetAverage } = req.body || {};

  if (!Number.isInteger(term)) {
    return res.status(400).json({ error: 'term is required.' });
  }
  const resolvedLabel = typeof subjectLabel === 'string' ? subjectLabel.trim() : '';
  if (!resolvedLabel) {
    return res.status(400).json({ error: 'A subject is required.' });
  }
  const targetNum = Number(targetAverage);
  if (!Number.isFinite(targetNum) || targetNum < 0 || targetNum > 100) {
    return res.status(400).json({ error: 'targetAverage must be between 0 and 100.' });
  }

  const resolvedKey = subjectKey || null;
  const identity = subjectIdentity(resolvedKey, resolvedLabel);

  const rawEntries = await db.prepare('SELECT * FROM grade_entries WHERE user_id = ? AND term = ?').all(userId, term);
  const subjectEntries = rawEntries.filter((e) => subjectIdentity(e.subject_key, e.subject_label) === identity);

  const weights = gradeWeights(resolvedKey);
  let weightedSum = 0;
  let weightTotal = 0;
  // "Remaining AMS" is driven by the latest WEEK NUMBER an AMS entry exists for, not how many AMS
  // entries exist — a student who's only logged weeks 1, 3, 5, 7 (4 entries, gaps and all) still
  // has weeks 8-14 left, not 10. Weeks before the latest one are treated as already accounted for
  // even if some were skipped, since this is about what's still coming, not what's missing.
  let latestAmsWeek = 0;
  for (const e of subjectEntries) {
    const isAms = isAmsSubcourse(e.subcourse_label);
    const w = isAms ? weights.ams : weights.periodic;
    weightedSum += e.grade * w;
    weightTotal += w;
    if (isAms && Number.isInteger(e.week_number) && e.week_number > latestAmsWeek) {
      latestAmsWeek = e.week_number;
    }
  }
  const currentAverage = weightTotal > 0 ? weightedSum / weightTotal : null;

  // Remaining scheduled periodic exams for this subject/term: weekly/saturday exam rows (that's
  // this app's two periodic exam types — see dashboard.js) not yet passed. A subject the schedule
  // never covered (no rows at all) falls back to the same "next one entry" framing AMS always uses.
  const todayIso = getTodayIso();
  const scheduleRows = await db
    .prepare(
      `SELECT * FROM exams WHERE user_id = ? AND term = ? AND exam_type IN ('weekly', 'saturday')`
    )
    .all(userId, term);
  const subjectScheduleRows = scheduleRows.filter((e) => subjectIdentity(e.subject_key, e.subject_label) === identity);
  const remainingScheduled = subjectScheduleRows.filter((e) => {
    const d = e.date || e.date_end || e.date_start;
    return d && d >= todayIso;
  });
  const hasSchedule = subjectScheduleRows.length > 0;
  const periodicCount = remainingScheduled.length > 0 ? remainingScheduled.length : 1;

  // AMS never happens during a Final Exam week — the school-wide schedule for this term already
  // says exactly which week finals start (the "final" exam row's own weekNumber, set to that
  // block's first row — see scheduleParser.js), so the real ceiling on "how many more weeks of
  // AMS are even possible" is one week before that, not a flat assumption of the full term.
  // Undefined (no schedule uploaded, or an older upload from before this was captured) falls back
  // to the previous full-term assumption.
  const finalExamRow = await db
    .prepare("SELECT week_number FROM exams WHERE user_id = ? AND term = ? AND exam_type = 'final'")
    .get(userId, term);
  const termAmsCeiling =
    finalExamRow?.week_number != null ? Math.max(0, finalExamRow.week_number - 1) : TERM_WEEKS;
  const amsCount = Math.max(1, termAmsCeiling - latestAmsWeek);

  const periodic = solveNeededScore(targetNum, weightedSum, weightTotal, weights.periodic, periodicCount);
  const ams = solveNeededScore(targetNum, weightedSum, weightTotal, weights.ams, amsCount);

  // Combined, realistic scenario: both types are still coming, not just one — assume the AMS side
  // (the larger and easier-to-stack pool, being weekly) gets maxed out, and solve for what's
  // actually needed on the periodic side given that. If maxing AMS alone already clears the
  // target, note that instead of a periodic score below 0.
  const amsMaxedSum = weightedSum + 100 * amsCount * weights.ams;
  const amsMaxedWeight = weightTotal + amsCount * weights.ams;
  const combinedSolved = solveNeededScore(targetNum, amsMaxedSum, amsMaxedWeight, weights.periodic, periodicCount);
  const combined = {
    amsCount,
    amsScore: 100,
    periodicCount,
    neededPeriodicScore: combinedSolved.neededScore,
    feasible: combinedSolved.feasible,
    alreadyMetByAmsAlone: combinedSolved.neededScore <= 0,
    bestPossibleAverage: combinedSolved.bestPossibleAverage,
    usedSchedule: remainingScheduled.length > 0,
    hasSchedule,
  };

  res.json({
    currentAverage,
    existingWeightTotal: weightTotal,
    periodic: { ...periodic, usedSchedule: remainingScheduled.length > 0, hasSchedule },
    ams: { ...ams, everyWeekCount: amsCount },
    combined,
  });
});

// Mode (b): hold every subject NOT selected fixed at its current average, and solve for what the
// selected subject(s) need to hit a target overall term average. With one selected subject this is
// a single linear equation, one unknown — a direct solve. With several selected at once, it's one
// equation with several unknowns (infinitely many combinations reach the same overall average), so
// instead of picking one arbitrary combination, this returns a few genuinely useful ones:
//   - "balanced": every selected subject moves to the same average.
//   - one "spotlight" scenario per selected subject (only when 2+ are selected): every OTHER
//     selected subject is maxed at 100, and this endpoint solves for what the remaining one alone
//     needs — the highest/lowest "swap it around" pairing for two subjects generalizes cleanly to
//     "max everyone else in the selection, solve for this one" for any number of subjects.
router.post('/overall-target', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { term, subjects, targetOverallAverage } = req.body || {};

  if (!Number.isInteger(term)) {
    return res.status(400).json({ error: 'term is required.' });
  }
  if (!Array.isArray(subjects) || subjects.length === 0) {
    return res.status(400).json({ error: 'At least one subject is required.' });
  }
  const targetNum = Number(targetOverallAverage);
  if (!Number.isFinite(targetNum) || targetNum < 0 || targetNum > 100) {
    return res.status(400).json({ error: 'targetOverallAverage must be between 0 and 100.' });
  }

  const requested = subjects.map((s) => ({
    subjectKey: s.subjectKey || null,
    subjectLabel: typeof s.subjectLabel === 'string' ? s.subjectLabel.trim() : '',
    identity: subjectIdentity(s.subjectKey || null, s.subjectLabel),
  }));
  if (requested.some((s) => !s.subjectLabel)) {
    return res.status(400).json({ error: 'Every subject needs a name.' });
  }

  const rawEntries = await db.prepare('SELECT * FROM grade_entries WHERE user_id = ? AND term = ?').all(userId, term);
  const { subjectAverages, overallAverage: currentOverallAverage } = calculateTermSummary(rawEntries);
  const valid = subjectAverages.filter((s) => s.average !== null);
  const validByIdentity = new Map(valid.map((s) => [subjectIdentity(s.subjectKey, s.subjectLabel), s]));

  const missing = requested.filter((s) => !validByIdentity.has(s.identity));
  if (missing.length > 0) {
    return res.status(422).json({
      error: `${missing.map((s) => s.subjectLabel).join(', ')} ${
        missing.length === 1 ? "doesn't" : "don't"
      } have any grades yet this term, so ${
        missing.length === 1 ? "it isn't" : "they aren't"
      } counted in your overall average yet. Add at least one grade before solving for ${
        missing.length === 1 ? 'it' : 'them'
      } here.`,
    });
  }

  const requestedIdentities = new Set(requested.map((s) => s.identity));
  const selected = requested.map((s) => {
    const v = validByIdentity.get(s.identity);
    return { ...s, currentAverage: v.average, weight: subjectOverallWeight(v.subjectKey) };
  });

  let sumFixed = 0;
  let weightFixed = 0;
  for (const s of valid) {
    if (requestedIdentities.has(subjectIdentity(s.subjectKey, s.subjectLabel))) continue;
    const w = subjectOverallWeight(s.subjectKey);
    sumFixed += s.average * w;
    weightFixed += w;
  }
  const weightSelectedTotal = selected.reduce((sum, s) => sum + s.weight, 0);
  const weightTotal = weightFixed + weightSelectedTotal;
  // The combined weighted contribution every selected subject must supply together to land the
  // overall average exactly on target, everything else held at its current value.
  const neededWeightedSum = targetNum * weightTotal - sumFixed;

  const balancedAverage = neededWeightedSum / weightSelectedTotal;
  const bestPossibleOverall = (sumFixed + 100 * weightSelectedTotal) / weightTotal;
  const worstPossibleOverall = sumFixed / weightTotal;
  const swing = bestPossibleOverall - worstPossibleOverall;
  const lowImpact = swing < LOW_IMPACT_OVERALL_SWING;

  const scenarios = [
    {
      name: 'balanced',
      label: selected.length === 1 ? `${selected[0].subjectLabel}'s needed average` : 'Split evenly across all of them',
      values: Object.fromEntries(selected.map((s) => [s.identity, balancedAverage])),
      feasible: balancedAverage >= 0 && balancedAverage <= 100,
    },
  ];

  if (selected.length >= 2) {
    for (const spotlight of selected) {
      const others = selected.filter((s) => s.identity !== spotlight.identity);
      const othersMaxedSum = sumFixed + 100 * others.reduce((sum, s) => sum + s.weight, 0);
      const neededForSpotlight = (targetNum * weightTotal - othersMaxedSum) / spotlight.weight;
      const otherNames = others.map((s) => s.subjectLabel);
      const namesJoined =
        otherNames.length === 1 ? otherNames[0] : `${otherNames.slice(0, -1).join(', ')} and ${otherNames[otherNames.length - 1]}`;
      const verb = otherNames.length === 1 ? 'gets' : 'get';
      scenarios.push({
        name: `spotlight:${spotlight.identity}`,
        label: `If ${namesJoined} ${verb} a perfect 100, ${spotlight.subjectLabel} needs`,
        values: {
          ...Object.fromEntries(others.map((s) => [s.identity, 100])),
          [spotlight.identity]: neededForSpotlight,
        },
        feasible: neededForSpotlight >= 0 && neededForSpotlight <= 100,
      });
    }
  }

  res.json({
    currentOverallAverage,
    target: targetNum,
    subjects: selected.map((s) => ({
      subjectKey: s.subjectKey,
      subjectLabel: s.subjectLabel,
      identity: s.identity,
      currentAverage: s.currentAverage,
      weight: s.weight,
    })),
    scenarios,
    bestPossibleOverall,
    worstPossibleOverall,
    lowImpact,
    lowImpactMessage: lowImpact
      ? `${selected.map((s) => s.subjectLabel).join(' and ')} barely affect${
          selected.length === 1 ? 's' : ''
        } your overall average. Even a perfect 100 across ${
          selected.length === 1 ? 'it' : 'all of them'
        } would only bring your overall to ${bestPossibleOverall.toFixed(1)} (a swing of just ${swing.toFixed(
          1
        )} points). Hitting a specific target here won't meaningfully move your overall average.`
      : null,
  });
});

export default router;
