import fs from 'node:fs/promises';
import { ALL_SUBJECTS } from '../constants/subjects.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const API_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// Course names as they appear on the school's grade report don't match the schedule's own
// scheduleCode glossary (that's timetable shorthand; this is a different naming system for the
// same subjects) — confirmed with the student 2026-08 against a real sample report.
const COURSE_NAME_ALIASES = [
  { course: 'English Language M', key: 'core_english' },
  { course: 'Mathematics M1', key: 'core_math' },
  { course: 'Applied Mathematics', key: 'core_mechanics' },
  { course: 'Physics N', key: 'core_physics' },
  { course: 'Chemistry N', key: 'core_chemistry' },
  { course: 'Chemistry N1', key: 'as_chemistry' },
  { course: 'Economics', key: 'core_economics' },
];

const SYSTEM_PROMPT = `You are an expert academic-transcript analyst. You will be shown a school grade
report (an image or PDF) for one student, and must extract every individual grade entry from its table.

The table's structure: a "Course" column groups one or more "Subcourse" rows beneath it, each subcourse
having its own running Avg. To the right of the Avg column, there are further columns — one per week —
each holding that subcourse's specific grade for that week (a plain number). A blank week cell means no
assessment happened for that subcourse that week — skip blank cells entirely, do not invent a grade for
them.

Two kinds of subcourse rows appear under most courses:
- A row literally labeled "AMS" — this is that subject's WEEKLY assessment grade. Set "subcourse" to
  "AMS" exactly.
- Any other row (named after a component of the subject itself, e.g. "Composition", "Pure Mathematics",
  "Chemistry", "AS Physics") — this is a PERIODIC exam grade for that subject. Regardless of what the
  report actually calls it, set "subcourse" to the literal string "Periodic" for every one of these — do
  not preserve the original component name. If a course has more than one non-AMS row in the same week
  (e.g. English has both "Composition" and "Literature" graded the same week), still label both
  "Periodic" and extract both as separate entries.

Known Course-name -> subject-key mappings (use these exactly when you see these course names):
${COURSE_NAME_ALIASES.map((a) => `- "${a.course}" -> key "${a.key}"`).join('\n')}

For any course name you don't recognize from that list, do your best to match it against this full list of
known subjects by label similarity — set matchedSubjectKey to the closest match's key, or null if genuinely
nothing matches (better to leave it null than guess wrong):
${ALL_SUBJECTS.map((s) => `- ${s.label} (key: ${s.key})`).join('\n')}

Respond with ONLY a single JSON object — no markdown fence, no commentary — with this exact shape:

{
  "entries": [
    { "course": string, "matchedSubjectKey": string or null, "subcourse": string, "week": number or null, "grade": number }
  ]
}

Extract every non-blank week cell for every subcourse row as its own entry. "week" should be the week
number that column represents (1 for the first week column, 2 for the second, and so on — infer this from
position/headers). "grade" must be the plain number shown, not a percentage string.`;

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
 * Extracts individual grade entries from an uploaded grade-report document (single-turn — the
 * table is regular/tabular enough not to need the multi-step pipeline the schedule grid needs).
 */
export async function parseGrades({ filePath, mimeType }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set on the server. Add it to server/.env before uploading grades.');
  }

  const fileBuffer = await fs.readFile(filePath);
  const base64 = fileBuffer.toString('base64');
  const filePart = { inline_data: { mime_type: mimeType, data: base64 } };

  const res = await fetch(`${API_URL(MODEL)}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [filePart, { text: 'Extract every grade entry from this report as instructed.' }],
        },
      ],
      generationConfig: { maxOutputTokens: 16384, temperature: 0.1 },
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

  const text = (candidate.content?.parts || []).map((p) => p.text || '').join('\n');
  const result = extractJson(text);

  return {
    entries: Array.isArray(result.entries) ? result.entries : [],
  };
}
