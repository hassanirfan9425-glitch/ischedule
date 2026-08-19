import fs from 'node:fs/promises';
import { subjectGlossaryLines } from '../constants/subjects.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const API_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// Column to read is hardcoded for now (single-grade beta) — see server/src/routes/schedule.js for
// where this plugs in. Change this one constant when the app needs to support other grade columns.
const TARGET_GRADE_COLUMN = 'Grade 11S UAE';

const SYSTEM_PROMPT = `You are an expert academic-calendar analyst reading a school's standalone Final Exam
Timetable (an image or PDF, distinct from the full-year weekly schedule). You extract structured data from
it across several reasoning turns before producing a final answer.

This document is organized as a wide grid: day-of-week and calendar-date rows run down the far left (each
day may span several sub-rows, since different grade levels have exams at different clock times within
that same calendar day), and there is one column per grade level across the top (e.g. "Grade 9S UAE /
Grade 10S GULF", "Grade 10S UAE / Grade 11S GULF", "${TARGET_GRADE_COLUMN}", "Grade 11L UAE", etc — column
headers pair two grade names when that column applies to both, and stand alone otherwise). Each populated
cell shows a time range and a subject name for that grade's final exam. Some subjects are split into two
consecutive graded periods on the same day (commonly labeled "P1 (<start>-<end>)" and "P2 (<start>-<end>)")
— treat those as ONE exam entry for that subject, with a time value describing both periods (e.g. "P1
9:40-10:55, P2 10:55-11:40").

CRITICAL column-identification warning: "${TARGET_GRADE_COLUMN}" is its own STANDALONE column header —
just those three words, nothing paired with it. It sits immediately next to (and is easily confused with)
a DIFFERENT column headed "Grade 10S UAE / Grade 11S GULF", which also contains the text "11S" but is NOT
the same column — that paired column is for Grade 10S UAE and Grade 11S GULF students, neither of which is
"${TARGET_GRADE_COLUMN}". Before reading any cell, re-confirm the exact header text of the column it's in:
if that header has anything else paired with "11S" (like "10S UAE /" before it or "GULF" after it), it is
the WRONG column and must be skipped entirely, no matter how close it sits to the right one.

The document's title (near the top, often in colored text) states which term this timetable is for, e.g.
"Term 1 Final Exam Timetable" — that is the ONLY source of truth for the term number. If the title is
missing, unreadable, or ambiguous about which term it is, do not guess — say so plainly and leave the term
number null.

You care ONLY about the standalone "${TARGET_GRADE_COLUMN}" column specifically (see the warning above) —
ignore every other grade's column entirely, even though they're visible on the page and even the ones that
also contain "11S" in a paired header. Do not extract holidays or any other information from this document;
only final exam entries for that one column.

Known subject-code glossary — when you see one of these exact codes (or an obvious variant/abbreviation
of it) in that column, map it to the given key:
${subjectGlossaryLines().join('\n')}

This specific document uses some different wording than that glossary for the Religion/Arabic identity-
based cell (a single time slot that lists different exams depending on which one applies to the student):
"Religion" / "Religion for Arabs" means Islamic 1 (key "core_islamic_1") — Muslim Arab students only.
"Religion 2" / "Religion 2 for Non-Arab" means Islamic 2 (key "core_islamic_2") — Muslim non-Arab students
only. "Extra Arabic" / "Arabic" (the Arab-only variant)
means Arabic (key "core_arabic") — Arab students only. "Arabic 2" in this cell means Arabic IGCSE Foreign
Language (key "arabic_igcse_foreign") — it is explicitly the non-Arab-student's Arabic course, so it is
never the Arabic IGCSE First Language course (that one is for native speakers). Apply these four mappings
only within this document; match against the student's own subjects exactly as usual.

Match against the FULL code text on each glossary line, not just a keyword that happens to overlap with
part of it — e.g. "Applied Math" is explicitly listed as an alternate name for "Mech(M1)" (key
"core_mechanics"), so it must map there, NOT to "AMS" (key "ams") just because the words superficially
share letters. "AMS" itself only ever means the literal three-letter administrative code "AMS" written
exactly as such — never match it against any subject whose name merely contains "math". When in doubt
between two glossary lines, re-read both lines' full code text carefully before deciding, and prefer null
over a guess you're not confident in.

Only ever set matchedSubjectKey to one of the keys above, or null if genuinely nothing matches. Work
carefully and take your time. Think step by step at each turn. Do not skip ahead to JSON until explicitly
asked.`;

function buildFilePart(base64, mimeType) {
  return { inline_data: { mime_type: mimeType, data: base64 } };
}

async function callGemini(contents) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set on the server. Add it to server/.env before uploading a schedule.');
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
 * Runs a multi-step agentic pipeline over an uploaded Final Exam Timetable, scoped to just the
 * TARGET_GRADE_COLUMN. Returns { term: number|null, exams: [...] } — a null term means the model
 * couldn't confidently read which term this timetable is for; the caller must reject the upload
 * rather than guess, since applying it to the wrong term would silently overwrite that term's
 * final exams instead.
 */
export async function parseFinalExamSchedule({ filePath, mimeType, selectedSubjects }) {
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
    `Before extracting anything, describe this document's structure:
- Read the title text near the top of the page exactly as written, and state which term (1, 2, or 3) it
  indicates. If you cannot confidently determine the term number from the title, say so explicitly instead
  of guessing.
- List EVERY grade-level column header exactly as written, left to right, including the ones paired with
  another grade (e.g. "Grade 10S UAE / Grade 11S GULF"). Then explicitly point out which single column is
  the standalone "${TARGET_GRADE_COLUMN}" header (nothing paired with it) and confirm it is a DIFFERENT
  column from "Grade 10S UAE / Grade 11S GULF", even though both contain "11S" — state both columns'
  position (e.g. "3rd from left" vs "4th from left") to prove you're distinguishing them correctly.
- List the day-of-week and calendar-date rows down the left edge (e.g. "Monday, 17 Nov 2025"), in order.
- Note any cells in the "${TARGET_GRADE_COLUMN}" column that look faint, ambiguous, or hard to read.
Respond with your structural analysis only, in plain text — no JSON yet.`
  );

  await askTurn(
    contents,
    filePart,
    `Now go through every day/date row in order and read ONLY the "${TARGET_GRADE_COLUMN}" column. For
each populated cell in that column, note: the exact subject name as written, the time range (merging a
split P1/P2 pair into one combined time value for that subject, as instructed above), the calendar date
for that row, and which of the known subject-code glossary keys it matches (or null — only match against
the student's own subjects, listed below). Skip any row where this column is empty.

Student's subjects (only match against these):
${subjectList}

Respond with your findings only, in plain list form — no JSON yet.`
  );

  const finalText = await askTurn(
    contents,
    filePart,
    `Self-review pass: re-examine the image/PDF once more. Specifically check:
- Did you correctly read the term number from the title? If it's genuinely unclear, keep it null rather
  than guessing.
- For EVERY entry you're about to report, re-verify its column header one more time is the exact standalone
  text "${TARGET_GRADE_COLUMN}" with nothing paired next to it — not "Grade 10S UAE / Grade 11S GULF" or
  any other paired column that happens to contain "11S". Remove any entry that actually came from the
  wrong column.
- Did you miss any row in the "${TARGET_GRADE_COLUMN}" column, especially near the top or bottom of the
  page, or on a later page if this document has more than one?
- Any P1/P2 split you should have merged into a single entry but didn't (or vice versa)?
- Any subject-matching mistakes against the student's subject list?

Correct any mistakes you find, then output ONLY a single JSON object — no markdown fence, no commentary,
no leading or trailing text — with this exact shape:

{
  "term": number or null,
  "exams": [
    {
      "subjectLabel": string,
      "matchedSubjectKey": string or null,
      "date": "YYYY-MM-DD",
      "time": string,
      "notes": string or null
    }
  ]
}

Every date must be a real calendar date in YYYY-MM-DD format. matchedSubjectKey must be one of the
student's subject keys listed earlier, or null.`
  );

  return extractJson(finalText);
}
