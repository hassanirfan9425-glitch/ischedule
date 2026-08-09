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
  { key: 'moes', label: 'MOES', scheduleCode: 'MOES' },
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
