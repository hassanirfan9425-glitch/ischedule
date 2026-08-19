import rateLimit from 'express-rate-limit';

// Confirmed live at aistudio.google.com/rate-limit (2026-08-18): this app's model
// (gemini-flash-lite-latest, shown there as "Gemini 3.5 Flash Lite") is capped at 15 RPM / 500 RPD
// for the whole project, not per user. Different routes cost a different number of REAL Gemini
// calls per hit though — schedule.js classifies the document (1 call) then runs either a 3-turn
// final-exam parse or a 6-turn general-calendar parse (so up to 7 total), while grades/materials/
// study-plan are each a single Gemini call. A flat per-route-hit counter would either overprotect
// the cheap routes or underprotect the expensive one, so this tracks the real combined call count
// against one shared pool instead of treating every hit as costing the same amount.
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const REAL_RPM_LIMIT = 15;
const REAL_RPD_LIMIT = 500;
const SAFETY_MARGIN = 0.8; // leave 20% headroom under the live ceiling for anything else hitting this project

const minuteBudget = Math.floor(REAL_RPM_LIMIT * SAFETY_MARGIN);
const dayBudget = Math.floor(REAL_RPD_LIMIT * SAFETY_MARGIN);

let minuteWindowStart = Date.now();
let minuteCount = 0;
let dayWindowStart = Date.now();
let dayCount = 0;

function tryConsume(cost) {
  const now = Date.now();
  if (now - minuteWindowStart >= MINUTE_MS) {
    minuteWindowStart = now;
    minuteCount = 0;
  }
  if (now - dayWindowStart >= DAY_MS) {
    dayWindowStart = now;
    dayCount = 0;
  }
  if (minuteCount + cost > minuteBudget) return 'minute';
  if (dayCount + cost > dayBudget) return 'day';
  minuteCount += cost;
  dayCount += cost;
  return null;
}

// For routes that ALWAYS make a real Gemini call when they run (schedule/materials/grades
// uploads, study-plan generation) — safe to charge upfront as route middleware since the call is
// unconditional. cost = the real number of Gemini calls this specific route makes per hit, at its
// own worst case (schedule.js's cost depends on which document type it turns out to be, so it's
// charged for the more expensive general-calendar path even on requests that turn out to be the
// cheaper final-exam one — simpler than trying to know the cost before the route has even run).
export function aiCostLimiter(cost) {
  return (req, res, next) => {
    const exceeded = tryConsume(cost);
    if (exceeded === 'minute') {
      return res.status(429).json({ error: 'This app is handling too many AI requests right now. Please try again in a minute.' });
    }
    if (exceeded === 'day') {
      return res.status(429).json({ error: 'This app has hit its daily AI-analysis limit. Please try again tomorrow.' });
    }
    next();
  };
}

// For call sites where whether Gemini gets called at all is conditional (e.g. suggestion
// regeneration, which only actually fires when a term's average has moved enough) — charging this
// speculatively as route middleware would throttle the common no-op path for no reason, so callers
// check this immediately before the real Gemini call and skip it (same as any other "not worth
// regenerating right now" bailout) rather than failing the whole request. Returns true if there was
// enough budget (and consumes it), false if the caller should skip the call instead.
export function tryConsumeAiBudget(cost) {
  return tryConsume(cost) === null;
}

// Bounds one account's own pace — abuse-shaping only (a runaway client retry loop, someone mashing
// upload), since aiCostLimiter above is what actually protects the shared Gemini quota.
export const aiCallLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.session.userId),
  message: { error: 'Too many AI-analysis requests. Please wait a while before trying again.' },
});
