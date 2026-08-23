import fs from 'node:fs/promises';

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const API_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const SYSTEM_PROMPT = `You are an expert academic-material analyst. You will be shown a school "Exam Related
Materials" document (an image or PDF) for a single subject and exam period, and must extract the practice
material students are asked to complete.

The document may contain TWO separate sections, each starting with a bold header line: one reading
"CA Code: ..." and one reading "Periodic Code: ...". If both are present, you must IGNORE everything under
the "CA Code" section entirely — only extract material listed under the "Periodic Code" section. If only one
of the two sections is present, use whichever one exists.

Within the Periodic Code section (or the only section, if there's just one), look for two DIFFERENT kinds of
practice material, which are NOT the same thing:

1. "Course Practice" — these are interactive practice quizzes, usually listed one per chapter, e.g. "Course
   Practice Economics Grade 11 Chapter 1". Treat each line here as one QUIZ item.
2. "Course Questions Material" — these list specific textbook question numbers grouped by chapter, e.g.
   "Chapter 1 Questions 1, 5, 9, 12...". Treat each chapter's line here as one QUESTION item, keeping the
   full list of question numbers in the label.

Do not mix the two up — a "Course Practice" chapter entry is a quiz, a "Course Questions Material" chapter
entry is a set of questions. If the document doesn't have one of the two kinds, return an empty list for it
rather than inventing one.

Some subjects' materials don't use either format at all — instead of chapter-based practice/questions, they
describe what the exam itself covers (e.g. "Unseen SAT MCQ", "Prose Essay (Short Story Fluke)", a required
reading, an essay prompt, a book/text name). If you find NO "Course Practice" and NO "Course Questions
Material" content anywhere in the document, do not return empty lists and stop — instead read whatever the
document actually says about the exam/material and summarize it as plain, student-readable bullet points in
"details" (e.g. "IGCSE Literature students: Prose Essay on Short Story Fluke", "AP & SAT/IELTS students:
Unseen AP Lang. MCQ"). One bullet per distinct course-combination/requirement is fine. Only use "details" as
this fallback — if quizzes or questions were found, leave "details" empty.

Separately from all of the above (this applies across the WHOLE document, not just the Periodic Code section
— unlike quizzes/questions/details, do not exclude a "CA Code" section here), look anywhere in the document
for references to Cambridge International past exam papers. These show up in different formats depending on
the subject — sometimes a flat list of sessions ("Oct/Nov 2021 Q 8, 9"), sometimes a chapter-by-year grid
table under a header naming one paper/session ("Past Paper-June P12" with a table of years down one axis),
sometimes a table with one row per paper session and a linked filename or title next to it. For each
distinct past-paper reference you find, extract ONLY this plain descriptor information, exactly as printed:
- the 4-digit Cambridge subject code (e.g. "9709", "9701", "9702")
- the 2-digit paper+variant code (e.g. "12", "42", "22")
- the session: one of "oct-nov", "may-june", "feb-march"
- the 4-digit year
- whatever question numbers/parts are listed for that reference (keep exactly as written, e.g. "Q 8, 9" or "Q1e, 2c, 2d")

Do NOT extract or follow any filename, link text, or URL that happens to be hyperlinked next to a reference —
those are frequently wrong, inconsistent with the row's own stated session, or simply not a real working link.
Only extract the plain descriptor text itself. Only include a reference when the subject code, variant,
session, AND year are ALL confidently and unambiguously stated in the document — skip anything you're not
sure about rather than guessing, since a wrong link is worse than a missing one. If a whole document names one
subject code/variant once at the top and lists many sessions below it (like the flat-list format), that same
code/variant applies to every session in that list. If a grid table groups many years under one column axis
and one paper/session named in a header above the table, every year-column represents that same paper/session,
just a different year.

Respond with ONLY a single JSON object — no markdown fence, no commentary — with this exact shape:

{
  "periodicCode": string or null,
  "quizzes": [string, ...],
  "questions": [string, ...],
  "details": [string, ...],
  "pastPapers": [
    { "subjectCode": string, "variant": string, "session": "oct-nov" | "may-june" | "feb-march", "year": number, "questions": string },
    ...
  ]
}

Each string in "quizzes" and "questions" should be a short, human-readable label a student would recognize,
e.g. "Chapter 1 Practice Quiz" or "Chapter 2: Questions 1, 3, 7, 9, 12, 13, 14, 15". Keep the original chapter
numbering exactly as written in the document. Return an empty "pastPapers" list if the document has no past
paper references at all.`;

// A hint, not a source of truth — the model is told to use these only when they match what's
// actually printed in the document, never to override real document text. Keyed by whatever
// subjectLabel the exam record already carries (see server/src/constants/subjects.js).
const CAMBRIDGE_CODE_HINTS = {
  Math: '9709',
  Mechanics: '9709',
  Physics: '9702',
  'AS Physics': '9702',
  'AS Chemistry': '9701',
  'AS Biology': '9700',
  'AS Business': '9609',
  'AS Economics': '9708',
  'AS Further Maths': '9231',
};

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
 * Extracts practice quizzes and questions from an uploaded exam-material document (single-turn —
 * this content is far simpler than the full schedule grid, so a multi-step pipeline isn't needed).
 */
export async function parseMaterial({ filePath, mimeType, subjectLabel }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY is not set on the server. Add it to server/.env before uploading material.'
    );
  }

  const fileBuffer = await fs.readFile(filePath);
  const base64 = fileBuffer.toString('base64');
  const filePart = { inline_data: { mime_type: mimeType, data: base64 } };

  const codeHint = CAMBRIDGE_CODE_HINTS[subjectLabel];
  const pastPaperHintText = codeHint
    ? ` If this document has past paper references, "${subjectLabel}" commonly uses Cambridge subject code ${codeHint} — use that only if it matches what's actually printed in the document, never in place of real document text.`
    : '';

  const res = await fetch(`${API_URL(MODEL)}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [
            filePart,
            {
              text: `This material is for the subject "${subjectLabel}". Extract the quizzes, questions, and past paper references as instructed.${pastPaperHintText}`,
            },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
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

  const SESSION_KEYS = new Set(['oct-nov', 'may-june', 'feb-march']);
  const rawPastPapers = Array.isArray(result.pastPapers)
    ? result.pastPapers.filter(
        (p) =>
          p &&
          typeof p.subjectCode === 'string' &&
          typeof p.variant === 'string' &&
          SESSION_KEYS.has(p.session) &&
          Number.isInteger(p.year)
      )
    : [];

  return {
    periodicCode: result.periodicCode ?? null,
    quizzes: Array.isArray(result.quizzes) ? result.quizzes.filter((q) => typeof q === 'string' && q.trim()) : [],
    questions: Array.isArray(result.questions)
      ? result.questions.filter((q) => typeof q === 'string' && q.trim())
      : [],
    details: Array.isArray(result.details) ? result.details.filter((d) => typeof d === 'string' && d.trim()) : [],
    pastPapers: rawPastPapers.map((p) => ({
      subjectCode: p.subjectCode.trim(),
      variant: p.variant.trim(),
      session: p.session,
      year: p.year,
      questions: typeof p.questions === 'string' ? p.questions.trim() : '',
    })),
  };
}
