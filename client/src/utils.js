// Stable URL for the Android APK — the build workflow always publishes to this same release tag
// and asset name, so this link never needs to change when a new build goes out.
export const APK_DOWNLOAD_URL =
  'https://github.com/hassanirfan9425-glitch/ischedule/releases/download/android-apk/sabishub.apk';

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

const GREETINGS = {
  morning: [
    (name) => `Good morning, ${name}!`,
    (name) => `Rise and shine, ${name}.`,
    (name) => `Morning, ${name}, ready for today?`,
    (name) => `Up bright and early, ${name}?`,
  ],
  afternoon: [
    (name) => `Good afternoon, ${name}!`,
    (name) => `Hope today's going well, ${name}.`,
    (name) => `Halfway through the day, ${name}.`,
    (name) => `Afternoon, ${name}.`,
  ],
  evening: [
    (name) => `Good evening, ${name}!`,
    (name) => `Evening, ${name}, how'd today go?`,
    (name) => `Winding down, ${name}?`,
    (name) => `Evening check-in, ${name}.`,
  ],
  night: [
    (name) => `Late night studying, ${name}?`,
    (name) => `Still up, ${name}?`,
    (name) => `Burning the midnight oil, ${name}?`,
    (name) => `Night owl mode, ${name}?`,
  ],
};

// Picks a phrase template (band determined by UAE local time — the school's timezone — regardless
// of where the student is actually browsing from; UAE has no daylight saving, so this stays
// accurate year-round) at random from that band, equal chance each. Returns the template function
// itself rather than a finished string, so the caller can apply it to whatever the current display
// name is — keeping the chosen phrase stable (e.g. across tab switches) while still reflecting a
// name change made afterward in Settings, instead of baking in a name that can go stale.
export function pickGreetingTemplate() {
  const uaeHour =
    Number(
      new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dubai', hour: 'numeric', hour12: false }).format(
        new Date()
      )
    ) % 24;

  let band;
  if (uaeHour >= 5 && uaeHour < 12) band = 'morning';
  else if (uaeHour >= 12 && uaeHour < 17) band = 'afternoon';
  else if (uaeHour >= 17 && uaeHour < 21) band = 'evening';
  else band = 'night';

  const options = GREETINGS[band];
  return options[Math.floor(Math.random() * options.length)];
}
