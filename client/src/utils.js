export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const DIFFICULTY_LABELS = {
  very_easy: 'Very Easy',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  very_hard: 'Very Difficult',
};

export function difficultyLabel(difficultyKey) {
  return DIFFICULTY_LABELS[difficultyKey] || null;
}

export function countdownText(daysUntil) {
  if (daysUntil === null || daysUntil === undefined) return '';
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  if (daysUntil < 0) return 'Past';
  return `in ${daysUntil} days`;
}
