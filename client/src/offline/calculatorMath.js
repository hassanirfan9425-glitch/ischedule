// Offline port of server/src/routes/calculator.js's math, so GradeCalculatorPopup keeps working
// with zero network dependency once /academics, /dashboard and /subjects have been cached once
// (see api.js's calculateSubjectTarget/calculateOverallTarget). Every function here mirrors its
// server counterpart line-for-line — if the server file's math or weighting rules change, mirror
// the change here too.

function subjectIdentity(subjectKey, subjectLabel) {
  return subjectKey || `label:${subjectLabel}`;
}

// Same two hardcoded exception sets as server/src/constants/subjects.js's gradeWeights() — unlike
// subjectOverallWeight below, these aren't derivable from the cached subject catalog's
// category/weightCategory fields, so they're duplicated here directly. Keep in sync by hand.
const EQUAL_WEIGHT_SUBJECT_KEYS = new Set(['core_islamic_1', 'core_islamic_2', 'moral_education']);
const BOOSTED_WEIGHT_SUBJECT_KEYS = new Set(['a_chemistry', 'a_biology']);

function gradeWeights(subjectKey) {
  if (BOOSTED_WEIGHT_SUBJECT_KEYS.has(subjectKey)) return { ams: 1.5, periodic: 2.5 };
  if (EQUAL_WEIGHT_SUBJECT_KEYS.has(subjectKey)) return { ams: 1, periodic: 1 };
  return { ams: 1, periodic: 2 };
}

const BOOSTED_OVERALL_WEIGHT = 1.25;

// Unlike gradeWeights, this DOES derive from the cached subject catalog (the /subjects response's
// `subjects` array) instead of a hardcoded key list, matching subjectOverallWeight()'s own
// weightCategoryOf(subject) = subject.weightCategory || subject.category derivation server-side —
// so a newly added AP/A-Level elective is picked up automatically without touching this file.
function subjectOverallWeight(subjectKey, subjectCatalog) {
  const subject = subjectCatalog.find((s) => s.key === subjectKey);
  if (!subject) return 1; // core/conditional-core/auto subjects never appear in the elective catalog
  const weightCategory = subject.weightCategory || subject.category;
  if (weightCategory === 'AP') return 0.05;
  if (weightCategory === 'A Level') return BOOSTED_OVERALL_WEIGHT;
  return 1;
}

function isAmsSubcourse(subcourseLabel) {
  return typeof subcourseLabel === 'string' && subcourseLabel.trim().toUpperCase() === 'AMS';
}

const LOW_IMPACT_OVERALL_SWING = 1.0;
const TERM_WEEKS = 14;

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

// Mirrors POST /calculator/subject-target. `entries` is the matching term's `terms[].entries` from
// the cached GET /academics response; `upcomingExams` is the cached GET /dashboard response's
// `allUpcomingExams`. Note: since allUpcomingExams only contains future exams, `hasSchedule` here
// only reflects whether a FUTURE scheduled exam exists for this subject — unlike the live server,
// which also counts past ones. A subject whose only periodic exam already happened will read as
// "no schedule" offline even though one existed; a reasonable, documented degradation for an
// offline fallback, not something worth caching the full historical exam list to avoid.
export function subjectTargetOffline({ term, subjectKey, subjectLabel, targetAverage, entries, upcomingExams }) {
  const identity = subjectIdentity(subjectKey, subjectLabel);
  const subjectEntries = entries.filter((e) => subjectIdentity(e.subjectKey, e.subjectLabel) === identity);

  const weights = gradeWeights(subjectKey);
  let weightedSum = 0;
  let weightTotal = 0;
  let latestAmsWeek = 0;
  for (const e of subjectEntries) {
    const isAms = isAmsSubcourse(e.subcourseLabel);
    const w = isAms ? weights.ams : weights.periodic;
    weightedSum += e.grade * w;
    weightTotal += w;
    if (isAms && Number.isInteger(e.weekNumber) && e.weekNumber > latestAmsWeek) {
      latestAmsWeek = e.weekNumber;
    }
  }
  const currentAverage = weightTotal > 0 ? weightedSum / weightTotal : null;

  const subjectScheduleRows = upcomingExams.filter(
    (e) =>
      (e.examType === 'weekly' || e.examType === 'saturday') &&
      e.term === term &&
      subjectIdentity(e.subjectKey, e.subjectLabel) === identity
  );
  const hasSchedule = subjectScheduleRows.length > 0;
  const periodicCount = subjectScheduleRows.length > 0 ? subjectScheduleRows.length : 1;

  const finalWeekNumbers = upcomingExams
    .filter((e) => e.examType === 'final' && e.term === term && Number.isInteger(e.weekNumber))
    .map((e) => e.weekNumber);
  const termAmsCeiling = finalWeekNumbers.length > 0 ? Math.max(0, Math.min(...finalWeekNumbers) - 1) : TERM_WEEKS;
  const amsCount = Math.max(1, termAmsCeiling - latestAmsWeek);

  const periodic = solveNeededScore(targetAverage, weightedSum, weightTotal, weights.periodic, periodicCount);
  const ams = solveNeededScore(targetAverage, weightedSum, weightTotal, weights.ams, amsCount);

  const amsMaxedSum = weightedSum + 100 * amsCount * weights.ams;
  const amsMaxedWeight = weightTotal + amsCount * weights.ams;
  const combinedSolved = solveNeededScore(targetAverage, amsMaxedSum, amsMaxedWeight, weights.periodic, periodicCount);
  const combined = {
    amsCount,
    amsScore: 100,
    periodicCount,
    neededPeriodicScore: combinedSolved.neededScore,
    feasible: combinedSolved.feasible,
    alreadyMetByAmsAlone: combinedSolved.neededScore <= 0,
    bestPossibleAverage: combinedSolved.bestPossibleAverage,
    usedSchedule: subjectScheduleRows.length > 0,
    hasSchedule,
  };

  return {
    currentAverage,
    existingWeightTotal: weightTotal,
    periodic: { ...periodic, usedSchedule: subjectScheduleRows.length > 0, hasSchedule },
    ams: { ...ams, everyWeekCount: amsCount },
    combined,
  };
}

// Mirrors POST /calculator/overall-target. `subjectAverages` and `currentOverallAverage` come
// straight from the matching term's cached GET /academics response — that response already ran
// calculateTermSummary server-side, so there's no need to recompute per-subject weighted averages
// here at all. `subjectCatalog` is the cached GET /subjects response's `subjects` array.
export function overallTargetOffline({ term, subjects, targetOverallAverage, subjectAverages, currentOverallAverage, subjectCatalog }) {
  const requested = subjects.map((s) => ({
    subjectKey: s.subjectKey || null,
    subjectLabel: typeof s.subjectLabel === 'string' ? s.subjectLabel.trim() : '',
    identity: subjectIdentity(s.subjectKey || null, s.subjectLabel),
  }));

  const valid = subjectAverages.filter((s) => s.average !== null);
  const validByIdentity = new Map(valid.map((s) => [subjectIdentity(s.subjectKey, s.subjectLabel), s]));

  const missing = requested.filter((s) => !validByIdentity.has(s.identity));
  if (missing.length > 0) {
    return {
      error: `${missing.map((s) => s.subjectLabel).join(', ')} ${
        missing.length === 1 ? "doesn't" : "don't"
      } have any grades yet this term, so ${
        missing.length === 1 ? "it isn't" : "they aren't"
      } counted in your overall average yet. Add at least one grade before solving for ${
        missing.length === 1 ? 'it' : 'them'
      } here.`,
    };
  }

  const requestedIdentities = new Set(requested.map((s) => s.identity));
  const selected = requested.map((s) => {
    const v = validByIdentity.get(s.identity);
    return { ...s, currentAverage: v.average, weight: subjectOverallWeight(v.subjectKey, subjectCatalog) };
  });

  let sumFixed = 0;
  let weightFixed = 0;
  for (const s of valid) {
    if (requestedIdentities.has(subjectIdentity(s.subjectKey, s.subjectLabel))) continue;
    const w = subjectOverallWeight(s.subjectKey, subjectCatalog);
    sumFixed += s.average * w;
    weightFixed += w;
  }
  const weightSelectedTotal = selected.reduce((sum, s) => sum + s.weight, 0);
  const weightTotal = weightFixed + weightSelectedTotal;
  const neededWeightedSum = targetOverallAverage * weightTotal - sumFixed;

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
      const neededForSpotlight = (targetOverallAverage * weightTotal - othersMaxedSum) / spotlight.weight;
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

  return {
    currentOverallAverage,
    target: targetOverallAverage,
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
  };
}
