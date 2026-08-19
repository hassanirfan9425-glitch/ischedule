const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const API_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const SYSTEM_PROMPT = `You are building a short, practical day-by-day study plan for a student preparing for
one specific exam. You'll be given the subject, how many days remain until the exam, how the student rated
the subject's difficulty (if known), and whatever practice material the school assigned for it (if any).

You will always be told exactly how many days to plan for — produce exactly that many entries, one per day,
counting down to the exam (the exam day itself is not one of the entries; the plan ends the day before it).

Each day should have a specific focus (not "study more") and 1-3 concrete tasks. If practice material was
provided, distribute it across the days in a sensible order (e.g. earlier chapters first) rather than cramming
it all into one day — reference the material's own labels when you do (e.g. "Finish Chapter 2 Practice Quiz").
If no material was provided, base tasks on general exam prep for the subject and stated difficulty (e.g.
review notes, past papers, weak areas) — don't invent fake material labels that weren't given to you.

The last 1-2 days should shift toward review and light practice rather than new material, and the final day
before the exam should be the lightest (final review, rest) rather than the heaviest.

Respond with ONLY a single JSON object — no markdown fence, no commentary — with this exact shape:

{ "plan": [ { "daysBeforeExam": number, "focus": string, "tasks": [string, ...] }, ... ] }

"daysBeforeExam" counts down to the exam (e.g. 3 means three days before the exam), and entries must be in
descending order from furthest out to closest (ending at 1). Keep "focus" under 8 words and each task under
12 words. Do not use em dashes anywhere in your response; use commas, periods, colons, or semicolons instead.`;

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
 * Text-only Gemini call — generates a day-by-day prep plan from an exam's subject, difficulty,
 * how many days to plan for, and whatever material (if any) is already attached to it.
 */
export async function generateStudyPlan({ subjectLabel, difficulty, planDays, quizzes, questions, details }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set on the server.');
  }

  const materialLines = [];
  if (quizzes.length) materialLines.push(`Quizzes: ${quizzes.join('; ')}`);
  if (questions.length) materialLines.push(`Questions: ${questions.join('; ')}`);
  if (details.length) materialLines.push(`Details: ${details.join('; ')}`);
  const materialText = materialLines.length ? materialLines.join('\n') : 'No material has been added for this exam yet.';

  const prompt = `Subject: ${subjectLabel}
Difficulty rating: ${difficulty ? difficulty.replace('_', ' ') : 'not rated'}
Days to plan: ${planDays}

Assigned material:
${materialText}`;

  const res = await fetch(`${API_URL(MODEL)}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.4 },
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

  const text = (candidate.content?.parts || []).map((p) => p.text || '').join('\n');
  const result = extractJson(text);
  if (!Array.isArray(result.plan)) return [];

  return result.plan
    .filter((d) => Number.isInteger(d.daysBeforeExam) && typeof d.focus === 'string' && Array.isArray(d.tasks))
    .map((d) => ({
      daysBeforeExam: d.daysBeforeExam,
      focus: d.focus.trim(),
      tasks: d.tasks.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim()),
    }));
}
