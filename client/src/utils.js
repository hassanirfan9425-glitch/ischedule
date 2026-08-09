export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function countdownText(daysUntil) {
  if (daysUntil === null || daysUntil === undefined) return '';
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  if (daysUntil < 0) return 'Past';
  return `in ${daysUntil} days`;
}
