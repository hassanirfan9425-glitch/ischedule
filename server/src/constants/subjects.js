// Part 1 of the quiz: every student takes these — rated directly, no selection toggle.
// `scheduleCode` documents the literal code this maps to on a SABIS-style schedule (used to
// build the parser's matching glossary) — not shown to the user.
export const CORE_SUBJECTS = [
  { key: 'core_english', label: 'English', scheduleCode: 'Eng' },
  { key: 'core_math', label: 'Math', scheduleCode: 'Math' },
  { key: 'core_mechanics', label: 'Mechanics', scheduleCode: 'Mech(M1) / Applied Math' },
  { key: 'core_chemistry', label: 'Chemistry', scheduleCode: 'Chem' },
  { key: 'core_economics', label: 'Economics', scheduleCode: 'Eco' },
  { key: 'core_physics', label: 'Physics', scheduleCode: 'AS Phys' },
];

// Also part 1, but only asked about depending on the student's answers to the Arab/Muslim
// identity questions at the start of the quiz. `appliesWhen` keys are matched against
// { arab: boolean, muslim: boolean } — omit a key to mean "doesn't matter".
export const CONDITIONAL_CORE_SUBJECTS = [
  { key: 'core_arabic', label: 'Arabic', scheduleCode: '2L', appliesWhen: { arab: true } },
  { key: 'core_islamic_1', label: 'Islamic 1', scheduleCode: 'Islamic 1', appliesWhen: { arab: true, muslim: true } },
  { key: 'core_islamic_2', label: 'Islamic 2', scheduleCode: 'Islamic 2', appliesWhen: { arab: false, muslim: true } },
];

export function applicableConditionalCoreSubjects(identity) {
  return CONDITIONAL_CORE_SUBJECTS.filter((s) =>
    Object.entries(s.appliesWhen).every(([k, v]) => identity[k] === v)
  );
}

// Automatically included for every student (administrative/school-wide blocks, not something
// students "take" or rate) — never shown in the quiz, but still matched by the schedule parser
// and shown on the dashboard (uncolored, since there's no difficulty rating for them).
export const AUTO_SUBJECTS = [
  { key: 'ams', label: 'AMS', scheduleCode: 'AMS' },
  { key: 'grid_exam', label: 'Grid Exam', scheduleCode: 'Grid / Grid Standalone' },
  // "MOES" is the literal code printed on the schedule — every student takes it regardless of
  // religion/nationality, unlike Islamic 1/2 above which already have their own separate codes.
  { key: 'moral_education', label: 'Moral Education', scheduleCode: 'MOES' },
];

// Part 2 of the quiz: optional — student selects which ones apply, then rates each.
// Order matters: AS Level, then AP, then Languages, then Other.
// Note: "A level Maths"/"A level Physics" were removed as separate electives — they're the same
// course as the mandatory core "Math"/"Physics" above, so they'd just be a duplicate rating.
// "A level Chemistry" was removed too — it's covered by "AS Chemistry" below. The rest are
// labeled "AS ..." (not "A level ...") and grouped under "AS Level" — temporary per current
// request, flip back to 'A Level' labels/category whenever that's no longer accurate.
export const SUBJECTS = [
  { key: 'a_further_maths', label: 'AS Further Maths', category: 'AS Level' },
  { key: 'a_business', label: 'AS Business', category: 'AS Level', scheduleCode: 'BST' },
  { key: 'a_economics', label: 'AS Economics', category: 'AS Level' },
  { key: 'ap_physics_c_mechanics', label: 'AP Physics C: Mechanical', category: 'AP' },
  { key: 'ap_physics_c_electricity', label: 'AP Physics C: Electricity', category: 'AP' },
  { key: 'ap_calc_ab', label: 'AP Calculus AB', category: 'AP' },
  { key: 'ap_calc_bc', label: 'AP Calculus BC', category: 'AP' },
  { key: 'ap_english', label: 'AP English', category: 'AP' },
  { key: 'ap_environmental_science', label: 'AP Environmental Science', category: 'AP' },
  { key: 'ap_psychology', label: 'AP Psychology', category: 'AP' },
  { key: 'ap_microeconomics', label: 'AP Microeconomics', category: 'AP' },
  { key: 'ap_biology', label: 'AP Biology', category: 'AP', scheduleCode: 'Bio' },
  { key: 'ap_computer_science', label: 'AP Computer Science', category: 'AP', scheduleCode: 'Comp Sci N' },
  { key: 'ap_physics_1', label: 'AP Physics 1', category: 'AP', scheduleCode: 'AP Phys 1' },
  { key: 'as_biology', label: 'AS Biology', category: 'AS Level', scheduleCode: 'AS Bio' },
  { key: 'as_chemistry', label: 'AS Chemistry', category: 'AS Level', scheduleCode: 'AS Chemistry' },
  { key: 'arabic_igcse_first', label: 'Arabic IGCSE First Language', category: 'Languages', scheduleCode: 'Arabic IGCSE First Language' },
  { key: 'arabic_igcse_foreign', label: 'Arabic IGCSE Foreign Language', category: 'Languages', scheduleCode: 'Arabic IGCSE Foreign Language' },
  { key: 'o_level_arabic', label: 'O Level Arabic', category: 'Languages', scheduleCode: "O'Level Arabic" },
];

export const ALL_SUBJECTS = [...CORE_SUBJECTS, ...CONDITIONAL_CORE_SUBJECTS, ...SUBJECTS, ...AUTO_SUBJECTS];
export const SUBJECT_BY_KEY = Object.fromEntries(ALL_SUBJECTS.map((s) => [s.key, s]));
export const CORE_SUBJECT_KEYS = new Set(CORE_SUBJECTS.map((s) => s.key));
export const AUTO_SUBJECT_KEYS = new Set(AUTO_SUBJECTS.map((s) => s.key));

// Known-code -> subject-key glossary for the schedule parser prompt, built from whichever
// subjects (core or elective) have a scheduleCode documented above.
export function subjectGlossaryLines() {
  return ALL_SUBJECTS.filter((s) => s.scheduleCode).map(
    (s) => `- "${s.scheduleCode}" -> key "${s.key}" (${s.label})`
  );
}

// Ordered from easiest to hardest — order matters for the color mapping below.
export const DIFFICULTIES = [
  { key: 'very_easy', label: 'Very Easy' },
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
  { key: 'very_hard', label: 'Very Difficult' },
];

export const DIFFICULTY_KEYS = new Set(DIFFICULTIES.map((d) => d.key));

export function difficultyColor(difficultyKey) {
  switch (difficultyKey) {
    case 'hard':
    case 'very_hard':
      return 'red';
    case 'medium':
      return 'orange';
    case 'easy':
    case 'very_easy':
      return 'green';
    default:
      return 'gray';
  }
}

// Lower rank = higher priority. Used to sort exam lists so hard subjects surface first even if
// their date is further away than an easier one's.
export function difficultyRank(difficultyKey) {
  switch (difficultyKey) {
    case 'very_hard':
      return 0;
    case 'hard':
      return 1;
    case 'medium':
      return 2;
    case 'easy':
      return 3;
    case 'very_easy':
      return 4;
    default:
      return 5; // unmatched / unrated subject
  }
}

// How close an exam needs to be before it's flagged "Priority" — harder subjects get flagged
// further out, easier ones only once they're actually imminent.
export function priorityWindowDays(difficultyKey) {
  switch (difficultyKey) {
    case 'hard':
    case 'very_hard':
      return 14;
    case 'medium':
      return 7;
    case 'easy':
    case 'very_easy':
      return 4;
    default:
      return null; // unmatched/unrated subject — never flagged
  }
}

// How many days out a study plan should start, by difficulty — a subject rated harder gets a
// longer runway. Doesn't reuse priorityWindowDays' groupings since a plan's length needs finer
// granularity between very_easy and easy than that function cares about.
export function studyPlanDays(difficultyKey) {
  switch (difficultyKey) {
    case 'very_hard':
      return 14;
    case 'hard':
      return 7;
    case 'medium':
      return 5;
    case 'easy':
      return 4;
    case 'very_easy':
      return 3;
    default:
      return 5; // unrated subject — a reasonable middle-ground default
  }
}

export function isPriority(difficultyKey, daysUntil) {
  const window = priorityWindowDays(difficultyKey);
  if (window === null || daysUntil === null) return false;
  return daysUntil <= window;
}

// The day of the week a student's weekly "Periodic" assessments actually fall on — the schedule
// only gives week-level granularity, so this quiz answer lets the dashboard show an exact date.
export const WEEKDAYS = [
  { key: 'monday', label: 'Monday', offset: 0 },
  { key: 'tuesday', label: 'Tuesday', offset: 1 },
  { key: 'wednesday', label: 'Wednesday', offset: 2 },
  { key: 'thursday', label: 'Thursday', offset: 3 },
  { key: 'friday', label: 'Friday', offset: 4 },
];

export const WEEKDAY_OFFSET_BY_KEY = Object.fromEntries(WEEKDAYS.map((w) => [w.key, w.offset]));

// Academics grade weighting — how much an AMS (weekly assessment) vs a periodic exam grade
// counts toward a subject's average. Most subjects weight periodics 2x an AMS; a few exceptions
// per the school's actual rubric (confirmed 2026-08, subject to trial-and-error refinement).
const EQUAL_WEIGHT_SUBJECT_KEYS = new Set(['core_islamic_1', 'core_islamic_2', 'moral_education']);
const BOOSTED_WEIGHT_SUBJECT_KEYS = new Set(['as_chemistry', 'as_biology']);

export function gradeWeights(subjectKey) {
  if (BOOSTED_WEIGHT_SUBJECT_KEYS.has(subjectKey)) return { ams: 1.5, periodic: 2.5 };
  if (EQUAL_WEIGHT_SUBJECT_KEYS.has(subjectKey)) return { ams: 1, periodic: 1 };
  return { ams: 1, periodic: 2 };
}

// Separate from gradeWeights() above: this controls how much a SUBJECT'S OWN average counts
// toward the overall term average, not how AMS vs periodic count within that one subject's
// average. Every elective AP subject (never a core subject — nothing core is AP) counts for
// almost nothing toward the overall term number. Derived from SUBJECTS' own category tag rather
// than a hardcoded key list, so a newly added AP elective picks this up automatically. Not
// literally 0: a true zero weight would make a term's average NaN if every subject with a grade
// that term happened to be AP-only.
// NOTE: setting gradeWeights() itself to a small-but-EQUAL {ams, periodic} pair (tried first, see
// academics.js's calculateTermSummary) does NOT achieve "negligible" — a weighted average only
// depends on the RATIO between weights, so {0.05, 0.05} computes identically to {1, 1}. The actual
// lever has to be this subject-level weight, applied when averaging subject averages together.
const NEGLIGIBLE_OVERALL_WEIGHT_SUBJECT_KEYS = new Set(SUBJECTS.filter((s) => s.category === 'AP').map((s) => s.key));

// AS subjects and A-Level externals in general count for MORE than a normal subject toward the
// overall term average (opposite direction from the AP negligible weight above) — the school
// treats these as a heavier academic load. Currently 1.25x; bump this one constant to 1.5 (already
// requested as a likely next step) whenever asked, nothing else needs to change.
const BOOSTED_OVERALL_WEIGHT_SUBJECT_KEYS = new Set(SUBJECTS.filter((s) => s.category === 'AS Level').map((s) => s.key));
const BOOSTED_OVERALL_WEIGHT = 1.25;

export function subjectOverallWeight(subjectKey) {
  if (NEGLIGIBLE_OVERALL_WEIGHT_SUBJECT_KEYS.has(subjectKey)) return 0.05;
  if (BOOSTED_OVERALL_WEIGHT_SUBJECT_KEYS.has(subjectKey)) return BOOSTED_OVERALL_WEIGHT;
  return 1;
}

// A subcourse row is an AMS (weekly) entry if it's literally labeled "AMS" — anything else
// (e.g. "Composition", "Pure Mathematics", "Chemistry") is a periodic exam entry for that subject.
export function isAmsSubcourse(subcourseLabel) {
  return typeof subcourseLabel === 'string' && subcourseLabel.trim().toUpperCase() === 'AMS';
}

// The school's actual pass/fail line: 60 and above passes, anything below fails.
export const PASSING_GRADE = 60;

export function isPassingGrade(average) {
  return typeof average === 'number' && average >= PASSING_GRADE;
}
