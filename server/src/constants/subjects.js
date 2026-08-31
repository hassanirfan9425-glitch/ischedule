// Part 1 of the quiz: every student takes these — rated directly, no selection toggle.
// `scheduleCode` documents the literal code this maps to on a SABIS-style schedule (used to
// build the parser's matching glossary) — not shown to the user.
// Updated for the new academic year (2026-08): Mechanics/Chemistry/Economics dropped as core
// (their AP/A-Level variants now live as electives below instead), Statistics added as core.
// Moral Education moved here from AUTO_SUBJECTS below — it's now rated like any other core
// subject instead of being an uncolored administrative block. Kept its original key
// ('moral_education', not 'core_'-prefixed) so existing students' already-stored grades/exams
// under that key don't silently become unmatched.
export const CORE_SUBJECTS = [
  { key: 'core_english', label: 'English', scheduleCode: 'Eng' },
  { key: 'core_math', label: 'Math', scheduleCode: 'Math' },
  // No scheduleCode yet — Statistics is new this year and hasn't been matched against a real
  // schedule sample. The AI parser just won't auto-match it onto a calendar upload until either a
  // real timetable sample shows what it's actually printed as, or the code is added here directly.
  { key: 'core_statistics', label: 'Statistics' },
  { key: 'core_physics', label: 'Physics', scheduleCode: 'AS Phys' },
  { key: 'moral_education', label: 'Moral Education', scheduleCode: 'MOES' },
];

// Also part 1, but only asked about depending on the student's answers to the Arab/Muslim
// identity questions at the start of the quiz. `appliesWhen` keys are matched against
// { arab: boolean, muslim: boolean } — omit a key to mean "doesn't matter". Unchanged this year.
export const CONDITIONAL_CORE_SUBJECTS = [
  { key: 'core_arabic', label: 'Arabic', scheduleCode: '2L', appliesWhen: { arab: true } },
  { key: 'core_islamic_1', label: 'Islamic 1', scheduleCode: 'Islamic 1', appliesWhen: { arab: true, muslim: true } },
  { key: 'core_islamic_2', label: 'Islamic 2', scheduleCode: 'Islamic 2', appliesWhen: { arab: false, muslim: true } },
];

// Also part 1, but opt-out instead of always-on: enough students take general Chemistry/Economics
// that burying them in the Part 2 elective picker (alongside AP Chemistry/AP Macroeconomics below,
// which are the distinct AP course variants) made them easy to miss. These show pre-checked next to
// the true core subjects, with a toggle to uncheck for students who don't take them. Added 2026-08.
// scheduleCode confirmed 2026-08 against the 2026-2027 Grade 12S UAE calendar: the bare "Chem"/"Eco"
// periodic codes are these general courses, distinct from the "Sat: A Level Chem"/"Sat: AP Micro-Eco"
// Saturday elective sessions (a_chemistry/ap_microeconomics below).
export const OPTIONAL_CORE_SUBJECTS = [
  { key: 'core_chemistry', label: 'Chemistry', scheduleCode: 'Chem' },
  { key: 'core_economics', label: 'Economics', scheduleCode: 'Eco' },
];

// Automatically included for every student (administrative/school-wide blocks, not something
// students "take" or rate) — never shown in the quiz, but still matched by the schedule parser
// and shown on the dashboard (uncolored, since there's no difficulty rating for them). Moral
// Education used to live here — see the CORE_SUBJECTS comment above for why it moved.
export const AUTO_SUBJECTS = [
  { key: 'ams', label: 'AMS', scheduleCode: 'AMS' },
  { key: 'grid_exam', label: 'Grid Exam', scheduleCode: 'Grid / Grid Standalone' },
];

// Part 2 of the quiz: optional — student selects which ones apply, then rates each.
// Order matters: A Level, then AP, then Languages.
// Updated for the new academic year (2026-08), replacing the previous list entirely. Flipped
// "AS ..." labels/category back to "A Level ..." per the note that used to live here — kept each
// renamed subject's original scheduleCode where one existed (e.g. 'AS Chemistry', 'AS Bio'):
// scheduleCode documents what's literally printed on the real school schedule, which is
// independent of what we choose to label the subject internally, so the rename alone doesn't
// make the old code wrong. `weightCategory` is separate from `category` — `category` only
// controls which quiz section a subject displays under, `weightCategory` (falls back to
// `category` when unset) controls the grade-weighting behavior in subjectOverallWeight() below.
// AP French needs both: displays under Languages, but should still count for almost nothing
// toward the overall average like every other AP subject.
export const SUBJECTS = [
  { key: 'a_math', label: 'A Level Math', category: 'A Level', scheduleCode: 'AL Math' },
  { key: 'a_further_maths', label: 'A Level Further Math', category: 'A Level' },
  { key: 'a_business', label: 'A Level Business', category: 'A Level', scheduleCode: 'BST' },
  { key: 'a_chemistry', label: 'A Level Chemistry', category: 'A Level', scheduleCode: 'AS Chemistry' },
  { key: 'a_biology', label: 'A Level Biology', category: 'A Level', scheduleCode: 'AS Bio' },
  { key: 'ap_physics_2', label: 'AP Physics 2', category: 'AP' },
  { key: 'ap_physics_c_mechanics', label: 'AP Physics C: Mechanics', category: 'AP' },
  { key: 'ap_physics_c_electricity', label: 'AP Physics C: Electricity and Magnetism', category: 'AP' },
  { key: 'ap_calc_bc', label: 'AP Calculus BC', category: 'AP' },
  { key: 'ap_statistics', label: 'AP Statistics', category: 'AP' },
  { key: 'ap_chemistry', label: 'AP Chemistry', category: 'AP' },
  { key: 'ap_biology', label: 'AP Biology', category: 'AP', scheduleCode: 'Bio' },
  { key: 'ap_computer_science', label: 'AP Computer Science', category: 'AP', scheduleCode: 'Comp Sci N' },
  { key: 'ap_environmental_science', label: 'AP Environmental Science', category: 'AP' },
  { key: 'ap_psychology', label: 'AP Psychology', category: 'AP' },
  { key: 'ap_human_geography', label: 'AP Human Geography', category: 'AP' },
  { key: 'ap_microeconomics', label: 'AP Microeconomics', category: 'AP' },
  { key: 'ap_macroeconomics', label: 'AP Macroeconomics', category: 'AP' },
  // scheduleCode confirmed 2026-08 against the 2026-2027 calendar: "Sat: A Level Arabic" is this
  // year's wording for the same elective, not a separate untracked course.
  { key: 'arabic_2', label: 'Arabic 2', category: 'Languages', scheduleCode: 'A Level Arabic' },
  { key: 'ap_french', label: 'AP French', category: 'Languages', weightCategory: 'AP' },
];

export const ALL_SUBJECTS = [
  ...CORE_SUBJECTS,
  ...CONDITIONAL_CORE_SUBJECTS,
  ...OPTIONAL_CORE_SUBJECTS,
  ...SUBJECTS,
  ...AUTO_SUBJECTS,
];
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
function priorityWindowDays(difficultyKey) {
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
const BOOSTED_WEIGHT_SUBJECT_KEYS = new Set(['a_chemistry', 'a_biology']);

export function gradeWeights(subjectKey) {
  if (BOOSTED_WEIGHT_SUBJECT_KEYS.has(subjectKey)) return { ams: 1.5, periodic: 2.5 };
  if (EQUAL_WEIGHT_SUBJECT_KEYS.has(subjectKey)) return { ams: 1, periodic: 1 };
  return { ams: 1, periodic: 2 };
}

// Separate from gradeWeights() above: this controls how much a SUBJECT'S OWN average counts
// toward the overall term average, not how AMS vs periodic count within that one subject's
// average. Every elective AP subject (never a core subject — nothing core is AP) counts for
// almost nothing toward the overall term number. Derived from each subject's `weightCategory`
// (falling back to `category` when unset) rather than a hardcoded key list, so a newly added AP
// elective picks this up automatically even if it displays under a different quiz section (see
// AP French, which shows under Languages but still weights as AP). Not literally 0: a true zero
// weight would make a term's average NaN if every subject with a grade that term happened to be
// AP-only.
// NOTE: setting gradeWeights() itself to a small-but-EQUAL {ams, periodic} pair (tried first, see
// academics.js's calculateTermSummary) does NOT achieve "negligible" — a weighted average only
// depends on the RATIO between weights, so {0.05, 0.05} computes identically to {1, 1}. The actual
// lever has to be this subject-level weight, applied when averaging subject averages together.
function weightCategoryOf(subject) {
  return subject.weightCategory || subject.category;
}
const NEGLIGIBLE_OVERALL_WEIGHT_SUBJECT_KEYS = new Set(SUBJECTS.filter((s) => weightCategoryOf(s) === 'AP').map((s) => s.key));

// A-Level subjects count for MORE than a normal subject toward the overall term average (opposite
// direction from the AP negligible weight above) — the school treats these as a heavier academic
// load. Currently 1.25x; bump this one constant to 1.5 (already requested as a likely next step)
// whenever asked, nothing else needs to change.
const BOOSTED_OVERALL_WEIGHT_SUBJECT_KEYS = new Set(SUBJECTS.filter((s) => weightCategoryOf(s) === 'A Level').map((s) => s.key));
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
