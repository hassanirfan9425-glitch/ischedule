import { Capacitor } from '@capacitor/core';

// Every step fully declares the app state it needs (active tab, Settings open/closed, drawer
// open/closed + which item is highlighted) rather than relying on the previous step having left
// things in the right shape — keeps `next()`/`back()` symmetric and each step self-contained.
function appState(ctx, { tab = 'home', settings = false, drawerOpen = false, drawerIndex = null } = {}) {
  ctx.onSwitchTab(tab);
  ctx.setViewingSettings(settings);
  ctx.setForceDrawerOpen(drawerOpen);
  ctx.setDrawerHighlightIndex(drawerIndex);
}

// Mirrors the navItems order built in HomeClassic.jsx — "Download App" only exists there when not
// running as the packaged native app, so its tutorial step skips itself in that case rather than
// describing a menu item that isn't on screen.
const MENU_ITEMS = [
  { label: 'Retake Quiz', body: 'Redo your subject difficulty ratings any time.' },
  { label: 'Change Externals', body: 'Update just your optional subjects without redoing everything.' },
  { label: 'Restart Tutorial', body: 'Run through this tutorial again any time.' },
  { label: 'Settings', body: 'Change your username, name, or color.' },
  { label: 'Log Out', body: null },
  { label: 'Delete Account', body: "This can't be undone." },
  ...(Capacitor.isNativePlatform()
    ? []
    : [{ label: 'Download App', body: 'This is the Android app; iPhones are not supported yet.' }]),
];

export const tutorialSteps = [
  {
    id: 'home-intro',
    section: 'Home',
    body: "This is an example of what the dashboard looks like, once you've added your calendar and grades.",
    image: '/tutorial/home-example.png',
    imageCaption: 'This is an example of what the dashboard looks like.',
    onEnter: (ctx) => appState(ctx, { tab: 'home' }),
  },
  {
    id: 'home-schedule-block',
    section: 'Home',
    body: 'This shows your upcoming exams.',
    highlight: '[data-tutorial="schedule-block"]',
    onEnter: (ctx) => appState(ctx, { tab: 'home' }),
  },
  {
    id: 'home-academic-block',
    section: 'Home',
    body: 'This shows your grade average.',
    highlight: '[data-tutorial="academic-block"]',
    onEnter: (ctx) => appState(ctx, { tab: 'home' }),
  },
  {
    id: 'home-suggestions',
    section: 'Home',
    body: "Once you've added grades, you'll also see suggestions here. These are personalized: they're generated from your actual grades and how hard you rated each subject, not generic advice.",
    highlight: '[data-tutorial="suggestions-section"]',
    onEnter: (ctx) => appState(ctx, { tab: 'home' }),
  },
  {
    id: 'home-study-plan',
    section: 'Home',
    body: "Once you've added an upcoming exam's study material, you can generate a day by day study plan here. How many days it covers depends on how hard you rated that subject.",
    highlight: '[data-tutorial="study-plan-block"]',
    onEnter: (ctx) => appState(ctx, { tab: 'home' }),
  },
  {
    id: 'home-reflection',
    section: 'Home',
    body: "After a periodic exam passes, you'll be asked how it went. If your answer doesn't match how you rated the subject and your actual grades back that up, you'll get a chance to re-rate it, which then adjusts your study plans and priority flags for that subject too.",
    highlight: '[data-tutorial="reflection-block"]',
    onEnter: (ctx) => appState(ctx, { tab: 'home' }),
  },
  ...MENU_ITEMS.map((item, i) => ({
    id: `menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`,
    section: 'Menu',
    body: item.body ? `${item.label}: ${item.body}` : item.label,
    onEnter: (ctx) => appState(ctx, { tab: 'home', drawerOpen: true, drawerIndex: i }),
  })),
  {
    id: 'settings-color-theme',
    section: 'Settings',
    body: 'This is your color theme. Pick whichever palette you like.',
    highlight: '[data-tutorial="color-theme"]',
    onEnter: (ctx) => appState(ctx, { settings: true }),
  },
  {
    id: 'settings-ui-style',
    section: 'Settings',
    body: 'This is your UI style. You can switch to a completely different look for the whole app if you want.',
    highlight: '[data-tutorial="ui-style"]',
    onEnter: (ctx) => appState(ctx, { settings: true }),
  },
  {
    id: 'schedule-example',
    section: 'Calendar',
    body: 'This is an example of what you see after attaching a calendar.',
    image: '/tutorial/schedule-example.png',
    imageCaption: 'This is an example of what you see after attaching a calendar.',
    onEnter: (ctx) => appState(ctx, { tab: 'schedule' }),
  },
  {
    id: 'schedule-add',
    section: 'Calendar',
    body: 'Tap + to add your calendar: automatically by uploading a photo or PDF, or manually by entering it yourself.',
    highlight: '[data-tutorial="schedule-add"]',
    onEnter: (ctx) => appState(ctx, { tab: 'schedule' }),
  },
  {
    id: 'schedule-priority',
    section: 'Calendar',
    body: 'Each exam is color-coded by priority, based on how hard you rated the subject and how soon it’s coming up.',
    onEnter: (ctx) => appState(ctx, { tab: 'schedule' }),
  },
  {
    id: 'schedule-material',
    section: 'Calendar',
    body: 'You can attach study material to each exam once it’s added.',
    onEnter: (ctx) => appState(ctx, { tab: 'schedule' }),
  },
  {
    id: 'schedule-holidays',
    section: 'Calendar',
    body: 'Upcoming holidays show up here too.',
    onEnter: (ctx) => appState(ctx, { tab: 'schedule' }),
  },
  {
    id: 'academics-example',
    section: 'Academics',
    body: 'This is an example of the Academics page after you add your grades.',
    image: '/tutorial/academics-example.png',
    imageCaption: 'This is an example of the Academics page after you add your grades.',
    onEnter: (ctx) => appState(ctx, { tab: 'academics' }),
  },
  {
    id: 'academics-add',
    section: 'Academics',
    body: 'Add your grades automatically by uploading a screenshot of your SDP academic page, or manually enter them yourself.',
    highlight: '[data-tutorial="academics-add"]',
    onEnter: (ctx) => appState(ctx, { tab: 'academics' }),
  },
  {
    id: 'academics-estimate',
    section: 'Academics',
    body: "Once you've added grades, you'll get a calculated estimate. The calculation is built specifically for this school's exact exam weights.",
    onEnter: (ctx) => appState(ctx, { tab: 'academics' }),
  },
  {
    id: 'academics-goal',
    section: 'Academics',
    body: 'Set a target average for a subject or your whole term, and it tells you what you actually need on your upcoming tests to hit it, using your real remaining exam schedule, not a guess.',
    highlight: '[data-tutorial="academics-goal"]',
    onEnter: (ctx) => appState(ctx, { tab: 'academics' }),
  },
  {
    id: 'finish',
    section: 'All set',
    body: 'Good luck!',
    finish: true,
    onEnter: (ctx) => appState(ctx, { tab: 'home' }),
  },
];
