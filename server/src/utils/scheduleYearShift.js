// TEMPORARY, beta-testing only: the real upcoming-year schedule isn't published yet, so testers
// upload last year's PDF instead. This shifts every parsed exam/holiday date forward by
// SCHEDULE_YEAR_SHIFT years on upload, so the old calendar's dates land in the current year and
// show up as live/upcoming exams. Deliberately scoped to schedule dates only (not a global
// FAKE_TODAY override) so grades/materials/study-plan date logic stays on the real date.
// Remove SCHEDULE_YEAR_SHIFT from server/.env once the real current-year schedule is available.
const SHIFT_YEARS = Number(process.env.SCHEDULE_YEAR_SHIFT) || 0;

export function shiftScheduleDate(dateStr) {
  if (!dateStr || !SHIFT_YEARS) return dateStr;
  return dateStr.replace(/^(\d{4})/, (y) => String(Number(y) + SHIFT_YEARS));
}
