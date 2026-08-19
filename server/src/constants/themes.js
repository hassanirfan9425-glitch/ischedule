// Only affects brand/decorative colors (buttons, header, background, logo). Exam-difficulty
// colors (red/orange/green for hard/medium/easy) never change — they're meaningful, not stylistic.
export const THEMES = [
  { key: 'terracotta', label: 'Terracotta & Cream', swatch: ['#d2551f', '#fdf3ec'] },
  { key: 'green', label: 'Green & White', swatch: ['#22c55e', '#ffffff'] },
  { key: 'red_blue', label: 'Red & Blue', swatch: ['#ef4444', '#3b82f6'] },
  { key: 'purple_pink', label: 'Purple & Pink', swatch: ['#a855f7', '#ec4899'] },
  { key: 'black_grey', label: 'Black & Grey', swatch: ['#27272a', '#a1a1aa'] },
  { key: 'gold_navy', label: 'Gold & Dark Blue', swatch: ['#eab308', '#1e3a8a'] },
  { key: 'blue_white', label: 'Blue & White', swatch: ['#3b82f6', '#ffffff'] },
  { key: 'garnet', label: 'Garnet & Wine', swatch: ['#b3123f', '#4c0519'] },
  { key: 'sapphire', label: 'Sapphire & Ink', swatch: ['#1454b3', '#0f172a'] },
  { key: 'emerald', label: 'Emerald & Jade', swatch: ['#0e9e5e', '#134e3a'] },
  { key: 'black_gold', label: 'Black & Gold', swatch: ['#c99a2e', '#0a0a0a'] },
  { key: 'cyber', label: 'Cyan & Magenta', swatch: ['#06b6d4', '#d946ef'] },
];

export const THEME_KEYS = new Set(THEMES.map((t) => t.key));
