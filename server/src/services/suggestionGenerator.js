const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const API_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const SYSTEM_PROMPT = `You are helping a student understand their own academic performance so far this
term. You'll be given their subject averages (already calculated) and, where available, how difficult
they personally rated each subject on a quiz. Write 2-3 short, specific suggestions for what to focus on.

Ground every suggestion in the actual numbers you were given — name the subject, cite its real average,
and reference the difficulty rating when it's relevant (e.g. a subject rated hard with a low average is
worth flagging; a subject rated easy with a high average doesn't need a suggestion at all). Do not give
generic encouragement like "study harder" — be concrete about which subject and why, using the real data.
If everything looks solid, it's fine to say so briefly instead of inventing a problem.

Respond with ONLY a single JSON object — no markdown fence, no commentary — with this exact shape:

{ "suggestions": [string, string, ...] }

Each string should be one sentence, plain language, no markdown formatting.`;

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
    return `- ${s.subjectLabel}: ${s.average.toFixed(1)}${difficultyText}`;
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
