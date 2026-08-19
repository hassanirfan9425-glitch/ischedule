import fs from 'node:fs/promises';

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const API_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// A cheap, single-turn triage call so the same "+" upload button can accept either the school's
// full-year combined schedule (weekly/Saturday/holiday grid, one row per week — see
// scheduleParser.js) or a standalone Final Exam Timetable (a multi-grade grid with day/date rows
// on the left and one column per grade level — see finalExamParser.js), without asking the
// student to pick a document type themselves.
const SYSTEM_PROMPT = `You classify a single uploaded school document (image or PDF) into exactly one of two
categories, based on its visible title/structure:

- "general_calendar": the school's full-year combined schedule — organized as one row per week, with
  week-number columns, day-of-month columns, holiday shading, and Periodic 1/Periodic 2 assessment
  columns. Usually titled something like an academic year calendar or term schedule.
- "final_exam_timetable": a standalone Final Exam Timetable — a grid with day/date rows down the left
  and one column per grade level (e.g. "Grade 11S UAE", "Grade 9S UAE / Grade 10S GULF"), each cell
  showing a specific time range and subject for that grade's final exam. Usually titled something like
  "Final Exam Timetable" or "Final Exam Schedule".

Respond with ONLY a single JSON object, no markdown fence, no commentary: { "type": "general_calendar" |
"final_exam_timetable" | "unknown" }. Use "unknown" only if the document genuinely matches neither
description.`;

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
      generationConfig: { maxOutputTokens: 256, temperature: 0 },
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
  return (candidate.content?.parts || []).map((p) => p.text || '').join('\n');
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
 * Single-turn classification of an uploaded schedule document. Returns 'general_calendar',
 * 'final_exam_timetable', or 'unknown' — callers should treat 'unknown' the same as
 * 'general_calendar' (today's default, only document type this app has ever accepted) rather than
 * failing the upload outright.
 */
export async function classifyScheduleDocument({ filePath, mimeType }) {
  const fileBuffer = await fs.readFile(filePath);
  const base64 = fileBuffer.toString('base64');
  const filePart = buildFilePart(base64, mimeType);

  const text = await callGemini([{ role: 'user', parts: [filePart, { text: 'Classify this document now.' }] }]);
  const { type } = extractJson(text);
  return type === 'final_exam_timetable' ? 'final_exam_timetable' : type === 'general_calendar' ? 'general_calendar' : 'unknown';
}
