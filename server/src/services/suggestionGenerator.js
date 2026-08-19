const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const API_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// Mirrors server/src/constants/subjects.js's PASSING_GRADE — this file computes its own status
// tags rather than importing it, since it only needs the label text, not the raw threshold logic.
const PASSING_GRADE = 60;
const NEAR_FAILING_CEILING = 70;

function statusNote(average) {
  if (average < PASSING_GRADE) return ', FAILING (below the passing grade)';
  if (average < NEAR_FAILING_CEILING) return ', passing, but close to the passing grade';
  return '';
}

const SYSTEM_PROMPT = `You are helping a student understand their own academic performance so far this
term. You'll be given their subject averages (already calculated, each tagged with its pass/fail status)
and, where available, how difficult they personally rated each subject on a quiz. Write 2-3 short,
specific suggestions for what to focus on.

Ground every suggestion in the actual numbers you were given — name the subject, cite its real average,
and reference the difficulty rating when it's relevant (e.g. a subject rated hard with a low average is
worth flagging; a subject rated easy with a high average doesn't need a suggestion at all). Do not give
generic encouragement like "study harder" — be concrete about which subject and why, using the real data.
If everything looks solid, it's fine to say so briefly instead of inventing a problem.

This school has an actual passing grade, and subjects are tagged against it. If any subject is tagged
FAILING, one of your suggestions must say plainly that it's failing, not just "low" — that's a different
and more urgent thing than a mediocre grade. If any subject is tagged as close to the passing grade, give
one brief, matter-of-fact warning that it's cutting it close, without being alarmist. Only apply this
framing to the subjects it actually applies to — don't restate how many points a subject is from the
passing grade in every suggestion, and don't work a failing/close-to-failing mention into suggestions about
subjects that are comfortably passing.

Respond with ONLY a single JSON object — no markdown fence, no commentary — with this exact shape:

{ "suggestions": [string, string, ...] }

Each string should be one sentence, plain language, no markdown formatting. Do not use em dashes
anywhere in your response; use commas, periods, colons, or semicolons instead.`;

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
 * Text-only Gemini call (no file) — generates grounded suggestions from already-computed subject
 * averages and the student's quiz difficulty ratings.
 */
export async function generateSuggestions({ subjectAverages, difficultyByKey }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set on the server.');
  }

  const lines = subjectAverages.map((s) => {
    const difficulty = s.subjectKey ? difficultyByKey[s.subjectKey] : null;
    const difficultyText = difficulty ? `, rated: ${difficulty.replace('_', ' ')}` : '';
    return `- ${s.subjectLabel}: ${s.average.toFixed(1)}${statusNote(s.average)}${difficultyText}`;
  });

  const res = await fetch(`${API_URL(MODEL)}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [{ text: `Subject averages this term:\n${lines.join('\n')}` }],
        },
      ],
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
  return Array.isArray(result.suggestions) ? result.suggestions.filter((s) => typeof s === 'string' && s.trim()) : [];
}
