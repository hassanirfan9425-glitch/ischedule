// The app's students are in the UAE — "today" should flip at UAE midnight (Asia/Dubai, UTC+4,
// no DST), not at the server's own system timezone or naive UTC (which lags UAE by 4 hours, so a
// UTC-based "today" would still show yesterday's date for the first 4 hours of every UAE day).
// FAKE_TODAY (server/.env, dev-only) still overrides this for deterministic testing.
const UAE_TIMEZONE = 'Asia/Dubai';

export function getTodayIso() {
  if (process.env.FAKE_TODAY) return process.env.FAKE_TODAY;
  // en-CA formats as YYYY-MM-DD, matching this app's date convention everywhere else.
  return new Intl.DateTimeFormat('en-CA', { timeZone: UAE_TIMEZONE }).format(new Date());
}
