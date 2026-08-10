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

Respond with ONLY a single JSON object — no markdown fence, no commentary — with this exact shape:

{
  "periodicCode": string or null,
  "quizzes": [string, ...],
  "questions": [string, ...]
}

Each string in "quizzes" and "questions" should be a short, human-readable label a student would recognize,
e.g. "Chapter 1 Practice Quiz" or "Chapter 2: Questions 1, 3, 7, 9, 12, 13, 14, 15". Keep the original chapter
numbering exactly as written in the document.`;

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
              text: `This material is for the subject "${subjectLabel}". Extract the quizzes and questions as instructed.`,
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

  return {
    periodicCode: result.periodicCode ?? null,
    quizzes: Array.isArray(result.quizzes) ? result.quizzes.filter((q) => typeof q === 'string' && q.trim()) : [],
    questions: Array.isArray(result.questions)
      ? result.questions.filter((q) => typeof q === 'string' && q.trim())
      : [],
  };
}
