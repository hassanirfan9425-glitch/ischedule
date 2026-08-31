import fs from 'node:fs/promises';
import { subjectGlossaryLines } from '../constants/subjects.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const API_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const SYSTEM_PROMPT = `You are an expert academic-calendar analyst. You will be shown a school schedule
(an image or PDF) that lays out an entire academic year as a grid, and you extract structured data from
it across several reasoning turns before producing a final answer.

This specific school's schedule is organized as ONE ROW PER WEEK (not one column per week). Ground rules:

- On the far left there are two numbering columns: a term-relative week number and a running overall
  week number for the year. A "Term I / Term II / Term III" label spans a block of consecutive rows.
- Next to those are seven day-of-month columns, Monday through Sunday, showing the calendar date for
  each day of that week. Month labels appear at both the very left and very right of this date block,
  since a week can span two months.
- The Saturday and Sunday columns are shaded ORANGE on every row — that always means WEEKEND, not a
  holiday.
- Some entire rows have BLUE shading across the Monday-Friday cells AND have their week-number column
  left BLANK — these are holiday/break weeks (not a counted teaching week). The Saturday/Sunday cells in
  that same row are still shaded orange as usual.
- After the date columns there is an "Academic Milestones" column with free-text notes. A note reading
  "Final Exam" (usually orange/red text) marks a final-exams period for that row. A note reading
  "Revision in school" is NOT an exam — ignore it. Notes about English/second-language "Compo Final",
  "Direct Writing Compo Final", "SAT MOCK", or "IELTS" are NOT to be extracted as exams — ignore them
  entirely, they are out of scope.
- Next are two columns, "Periodic 1" and "Periodic 2". Each cell names a subject code (text color varies
  by subject) meaning that subject has its weekly "Periodic" assessment during that week. A cell may
  instead say "Grid" or "Grid Standalone" (an administrative block, still treat as its own trackable
  item), or be highlighted green and say "MOES" (a different administrative/ministry block, also
  trackable), or say "Finals" during a Final Exam week (that's just a placeholder, not a subject).
- Finally there is an unlabeled rightmost column listing specific Saturday exam sessions with exact
  times, formatted like "Sat: <Subject> (<start time>-<end time>)", often in red/orange text. These are
  separate standalone board-exam sessions (AP / IGCSE / O-Level etc.) held on the Saturday of that row.
  A cell can list multiple such lines for the same week.

Known subject-code glossary — when you see one of these exact codes (or an obvious variant/abbreviation
of it) on the schedule, map it to the given key:
${subjectGlossaryLines().join('\n')}

Physics periodic cells specifically say "Phys (Mech)" or "Phys (Elect)" (mechanics vs electricity unit) —
both map to matchedSubjectKey "core_physics" as usual, but set subjectLabel to "Physics (Mech)" or
"Physics (Elec)" respectively (not just "Physics"), so the student can tell which unit's exam it is.

Only ever set matchedSubjectKey to one of the keys above, or null if genuinely nothing matches. Work
carefully and take your time — precision on dates and week alignment matters far more than speed. Think
step by step at each turn. Do not skip ahead to JSON until explicitly asked.`;

function buildFilePart(base64, mimeType) {
  return { inline_data: { mime_type: mimeType, data: base64 } };
}

async function callGemini(contents) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY is not set on the server. Add it to server/.env before uploading a schedule.'
    );
  }

  const res = await fetch(`${API_URL(MODEL)}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: { maxOutputTokens: 32768, temperature: 0.2 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 500)}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error(`Gemini returned no candidates: ${JSON.stringify(data).slice(0, 500)}`);
  }
  if (candidate.finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini response was cut off (hit max output tokens). Try a smaller/clearer file.');
  }

  return (candidate.content?.parts || []).map((p) => p.text || '').join('\n');
}

async function askTurn(contents, filePart, instruction) {
  contents.push({ role: 'user', parts: [filePart, { text: instruction }] });
  const text = await callGemini(contents);
  contents.push({ role: 'model', parts: [{ text }] });
  return text;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('Could not find a JSON object in the model response.');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Runs a multi-step agentic pipeline over the uploaded schedule: structural read, holiday
 * extraction, weekly/Saturday/final exam extraction, then a self-review pass that outputs final
 * structured JSON. Uses Google's Gemini API (free tier) for vision + reasoning.
 */
export async function parseSchedule({ filePath, mimeType, selectedSubjects }) {
  const fileBuffer = await fs.readFile(filePath);
  const base64 = fileBuffer.toString('base64');
  const filePart = buildFilePart(base64, mimeType);

  const subjectList = selectedSubjects.length
    ? selectedSubjects.map((s) => `- ${s.label} (key: ${s.key})`).join('\n')
    : '(the student has not selected any subjects yet — leave matchedSubjectKey null for everything)';

  const contents = [];

  await askTurn(
    contents,
    filePart,
    `Before extracting anything, describe this schedule's structure in detail:
- How many week-rows are there, and what calendar date range (start date to end date) does the whole
  grid span?
- Confirm the term number and week number columns on the far left, and note where the term boundaries
  (Term I / II / III) fall.
- Confirm which rows have orange Saturday/Sunday shading (every row) versus which rows have blue
  Monday-Friday shading with a blank week number (holiday weeks) — list the date ranges of every holiday
  row you can find.
- Describe what appears in the "Academic Milestones", "Periodic 1", "Periodic 2", and the rightmost
  Saturday-sessions column for a few sample rows, so you're confident you understand each column.
- Note any ambiguous, faint, or hard-to-read areas you'll need to reason carefully about later.
Respond with your structural analysis only, in plain text — no JSON yet.`
  );

  await askTurn(
    contents,
    filePart,
    `Now extract every HOLIDAY week: a row with blue Monday-Friday shading and a blank week-number cell
(weekends shaded orange on a normal teaching week are NOT holidays — do not list those). For each holiday
give its start date (that row's Monday) and end date (that row's Friday, or Sunday if the shading extends
through the weekend). Every single holiday's label must be the literal text "Holiday Break" — always,
with no exceptions. Do NOT write "Winter Break", "Spring Break", "Eid Break", "Summer Break", or any other
specific name, even if it seems obvious from the time of year — use "Holiday Break" every time, verbatim.
Group adjacent holiday rows into a single range if they're clearly one continuous break.

IMPORTANT: go through Term I, Term II, and Term III separately and explicitly, one at a time, checking
every row in each term from start to end — including any rows between the numbered weeks (e.g. between
week 9 and week 10) and any unnumbered rows at the very start or very end of a term. Holiday breaks
commonly appear: between terms, around the middle of a term, and sometimes right at a term's start or
end. Don't stop after finding one or two — a typical year has 3-5 separate holiday breaks in total. State
clearly which holiday rows you found in each of the three terms before moving on.
Respond with your holiday findings only, in plain list form — no JSON yet.`
  );

  await askTurn(
    contents,
    filePart,
    `Now go row by row through every normal teaching week (has a week number, is not a holiday row, and is
not a "Final Exam" row) and read the "Periodic 1" and "Periodic 2" columns. For each non-empty cell, note:
the subject code text exactly as written, which row/week it's in (with that week's Monday-Sunday date
range), and which of the known subject-code glossary keys it matches (or null if nothing matches — only
match against subjects the student actually takes, listed below). Skip a cell if it's genuinely empty.

Student's subjects (only match against these):
${subjectList}

Respond with your weekly-assessment findings only, in plain list form — no JSON yet.`
  );

  await askTurn(
    contents,
    filePart,
    `Now read the rightmost, unlabeled column on every row and extract every Saturday exam session listed
there (format like "Sat: <Subject> (<start>-<end>)"). For each one, give: the subject text exactly as
written, the exact Saturday date (from that row's Saturday column), the time range exactly as written,
and which of the known subject-code glossary keys it matches (or null — only match against the student's
subjects listed above). Ignore any note here that isn't a "Sat: <subject> (<time>)" style exam session
(e.g. scheduling notes like "Chemistry Periodic instead of CA" are not exam sessions — skip those).
Respond with your Saturday-exam findings only, in plain list form — no JSON yet.`
  );

  await askTurn(
    contents,
    filePart,
    `Now find every "Final Exam" period. The ONLY valid signal is the Academic Milestones column literally
containing the text "Final Exam" (usually in orange/red). Some rows have "Finals" written in the Periodic
1 / Periodic 2 columns WITHOUT "Final Exam" in the Academic Milestones column for that same row — that is
NOT a Final Exam period on its own, do not include rows like that; the Academic Milestones column is the
only thing that counts.

Merge consecutive rows that both have "Final Exam" in the Academic Milestones column, within the same
term, into a SINGLE block (do not report them as two separate entries). For each block, give: the term
number, the start date (Monday of the first row in the block), the end date (Sunday of the last row in the
block), AND the term-relative week number of that block's FIRST row (read from the left-hand week-number
column described earlier) — this tells the rest of the app which week regular weekly assessments (Periodic
and AMS) stop for that term, since none of those happen during a Final Exam week. Do NOT create separate entries for the
English/second-language composition finals, "SAT MOCK", or "IELTS" milestones — those are explicitly out
of scope, skip them entirely.

IMPORTANT: go through Term I, Term II, and Term III separately and explicitly, one at a time — each term
typically has exactly one "Final Exam" block near the end of the term, usually spanning 2 consecutive
rows that you must merge into one. Don't stop after finding the first one or two blocks; scan every term's
rows all the way through before concluding. State clearly, for each of the three terms, the single merged
Final Exam block you found in it.
Respond with your final-exam findings only, in plain list form — no JSON yet.`
  );

  const finalText = await askTurn(
    contents,
    filePart,
    `Self-review pass: re-examine the image/PDF once more against everything extracted so far. Specifically
check for:
- Weeks or dates out of chronological order, or outside the academic year you identified
- A holiday row accidentally treated as a normal teaching week, or vice versa
- Duplicate entries, or entries that should have been merged/split
- Subject-matching mistakes against the student's subject list
- Any composition-final / SAT-mock / IELTS / "Revision in school" entries that slipped in — remove them
- A missing Final Exam block: confirm you have one for EACH of Term I, Term II, and Term III. If any term
  doesn't have one in your list yet, go back and look at that term's rows again — it's there.
- A missing week number on a Final Exam block: confirm each one has the term-relative week number of its
  first row set, not left null.
- Missing holidays: scroll through the whole image one more time looking specifically for blue-shaded,
  blank-week-number rows you might have skipped, especially near the start/end of a term or between
  numbered weeks. It's common to miss one on the first pass — double check all three terms again now.

Correct any mistakes you find, then output ONLY a single JSON object — no markdown code fence, no
commentary, no leading or trailing text — with this exact shape:

{
  "academicYearLabel": string or null,
  "holidays": [
    { "label": "Holiday Break", "dateStart": "YYYY-MM-DD", "dateEnd": "YYYY-MM-DD", "term": number or null, "weekNumber": number or null }
  ],
  "exams": [
    {
      "subjectLabel": string,
      "matchedSubjectKey": string or null,
      "examType": "weekly" or "saturday" or "final",
      "term": number or null,
      "weekNumber": number or null,
      "date": "YYYY-MM-DD" or null,
      "dateStart": "YYYY-MM-DD" or null,
      "dateEnd": "YYYY-MM-DD" or null,
      "time": string or null,
      "notes": string or null
    }
  ]
}

Rules for each examType:
- "weekly": set dateStart/dateEnd to that week's Monday/Sunday, leave date and time null.
- "saturday": set date to the exact Saturday date, set time to the time range text, leave dateStart/dateEnd null.
- "final": there must be EXACTLY ONE "final" entry per term that has one (so at most 3 total, one each for
  Term I / II / III) — merge multi-row blocks into that single entry, never emit more than one "final" per
  term. Set dateStart/dateEnd to the whole block's Monday/Sunday range, subjectLabel "Final Exams",
  matchedSubjectKey null, leave date and time null. Set weekNumber to the term-relative week number of the
  block's FIRST row — do not leave this null for a "final" entry, it's needed elsewhere in the app (unlike
  every other examType, where weekNumber may be null if not applicable).

Every date must be a real calendar date in YYYY-MM-DD format. matchedSubjectKey must be one of the
student's subject keys listed earlier, or null: ${selectedSubjects.map((s) => s.key).join(', ') || '(none — always use null)'}`
  );

  return extractJson(finalText);
}
