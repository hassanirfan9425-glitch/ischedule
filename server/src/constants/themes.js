// Only affects brand/decorative colors (buttons, header, background, logo). Exam-difficulty
// colors (red/orange/green for hard/medium/easy) never change — they're meaningful, not stylistic.
export const THEMES = [
  { key: 'green', label: 'Green & White', swatch: ['#22c55e', '#ffffff'] },
  { key: 'red_blue', label: 'Red & Blue', swatch: ['#ef4444', '#3b82f6'] },
  { key: 'purple_pink', label: 'Purple & Pink', swatch: ['#a855f7', '#ec4899'] },
  { key: 'black_grey', label: 'Black & Grey', swatch: ['#27272a', '#a1a1aa'] },
  { key: 'gold_navy', label: 'Gold & Dark Blue', swatch: ['#eab308', '#1e3a8a'] },
  { key: 'blue_white', label: 'Blue & White', swatch: ['#3b82f6', '#ffffff'] },
];

export const THEME_KEYS = new Set(THEMES.map((t) => t.key));
