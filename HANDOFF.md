# Study Compass — Project Handoff

Written 2026-08-16. This is meant to be a complete reference for picking this project up in a fresh chat, not just a "what changed recently" note. Point-in-time snapshot — re-verify against the actual code/DB if something here seems off, especially anything with a specific number or file:line in it.

## 1. What this app is

"Study Compass" (branded **iSchedule** in the Classic UI's own header/logo) — an exam schedule, grade, and study tracker built for a specific UAE school's SABIS-style system (weekly "Periodic" assessments + termly "AMS" grades + Final exams, specific subject codes, specific grade-weighting rubric). Not a generic study app — a lot of the logic (subject list, grade weights, exam types) is hardcoded to match this one school's actual system.

## 2. Access & deployment

- **Repo root**: `C:\Users\hassan irfan\claude projects\exam-tracker`
- **GitHub**: `https://github.com/hassanirfan9425-glitch/ischedule.git` (remote `origin`)
- **Git state as of writing**: branch `ui-style-selector`. Last checkpoint commit `4e56cb7`. Run `git status` and `git log --oneline -5` first thing in a new session — do not trust this file over the actual repo state.
- **Frontend hosting**: Netlify, deploys from `client/` (`client/netlify.toml` — build command `npm run build`, publishes `dist/`, skips deploys for pushes that only touch Android/CI files to save deploy credits).
- **Backend hosting**: Render, deploys from `server/`. No `render.yaml` in-repo — configured in Render's dashboard directly, tied to this GitHub repo.
- **Database**: Neon Postgres. Single `DATABASE_URL` connection string in `server/.env` (exists locally, gitignored — not reproduced here). Local dev and production point at **separate** databases.
- **Other required env vars** (`server/.env`, see `server/.env.example` for the full annotated list): `GEMINI_API_KEY` (free tier, powers every AI feature below), `SESSION_SECRET`, `PORT` (default 4000), and in production only `NODE_ENV=production` + `CLIENT_ORIGIN` (the live Netlify URL, needed for CORS + cross-site session cookies). `client/.env.example` has one var, `VITE_API_URL` (the live Render URL + `/api`), unset for local dev since Vite proxies `/api` locally.
- **Run locally**: `cd server && npm start` (or `npm run dev`, which is `node --watch-path=src`, auto-restarts on backend changes — including `db.js` schema edits, which re-run on every restart since they're idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) in one terminal; `cd client && npm run dev` in another.
- **`FAKE_TODAY=YYYY-MM-DD`** in `server/.env` overrides "today" everywhere for deterministic testing — see section 6.
- **Known stale doc**: `README.md`'s "Stack" section still says `Node + Express + SQLite`. That's outdated — the app migrated to Postgres/Neon a while back (see memory `project_neon_migration_reason.md`). Not urgent, but fix it next time you're touching docs.
- **Android app**: built via Capacitor from `client/`, GitHub Actions workflow builds the APK. Wraps the live Netlify URL, not a separate codebase.

## 3. Feature inventory (what the app actually does, end to end)

**Auth & onboarding**
- Username/password signup+login (bcrypt), session-based auth via `express-session` stored in Postgres (`connect-pg-simple`, table `user_sessions`) — not JWT, not in-memory.
- Mandatory onboarding: a quiz where the student rates every **core subject** (English, Math, Mechanics, Chemistry, Economics, Physics — always required) plus any **conditional core subjects** (Arabic / Islamic 1 / Islamic 2, gated by an Arab/Muslim identity question pair) and any **elective subjects** they pick from a categorized list (AS Level, AP, Languages), each on a 5-point difficulty scale (`very_easy` → `very_hard`). Also picks which weekday their "Periodic" assessments land on (`periodic_day`), used to pin an exact date to otherwise week-level-only schedule entries.
- Schedule/grades are explicitly **optional** after the quiz — reachable any time via "+" prompts, not forced during onboarding.
- Electives can be edited later without redoing the whole quiz ("Change Externals" in the menu → `Electives.jsx`).
- Quiz can be retaken any time, pre-filled with current answers.

**Schedule**
- Add a schedule two ways: AI-parsed (upload a photo/PDF of the school's exam+holiday timetable, multi-step Gemini pipeline in `scheduleParser.js` matches subject codes against the student's own rated subjects + always-included AUTO_SUBJECTS), or fully manual entry.
- Three exam types: `weekly`, `saturday` (both surfaced together to the student as one combined "Periodic Exams" section — internally still separate for parsing), and `final`.
- Exams scoped to "current term" (inferred from the soonest upcoming exam) for the main dashboard sections, with an "all upcoming exams" view for looking further ahead.
- Color-coded red/orange/green/gray by difficulty rating; a "priority" flag when a hard-rated exam is close enough (window scales with difficulty — 14 days for hard/very hard, 7 for medium, 4 for easy/very easy).
- Holidays parsed/shown alongside exams.
- Re-uploading a schedule replaces the previous one entirely (delete-then-insert in a transaction).
- Materials can be attached to any exam (AI-parsed from an upload, or typed in manually) — practice quizzes, questions, and free-text "details", used later by the Study Plan Generator.

**Academics (grades)**
- Add grades two ways: AI-parsed screenshot of the school's SDP grade report, or manual entry, into a 14-fixed-week grid per term.
- Grades are per-subcourse — a subject has multiple rows (e.g. "AMS" plus periodic subcourses like "Composition", "Pure Mathematics"). `isAmsSubcourse()` checks for the literal label "AMS".
- **Weighted averaging**: AMS vs Periodic entries are weighted differently per subject (`gradeWeights()` in `constants/subjects.js`) — most subjects are periodic×2 / AMS×1, three exceptions (Islamic 1/2, Moral Education) are equal-weight, three exceptions (AS Chemistry, AS Biology, AP Physics 1) are boosted (periodic×2.5 / AMS×1.5). Per-subject weighted average, then a plain average of every subject's average for the term headline number.
- Pass/fail badge per subject: average ≥ 60 passes (`PASSING_GRADE`).
- **Current term auto-detection**: inferred from the date range each term's exams span on the student's own uploaded schedule, falling back to the nearest term if today's in a gap, or term 1 if there's no schedule at all. Student can manually reassign a whole term's entries if it guessed wrong.
- **AI suggestions**: regenerated only when the overall average moves ≥2.5 points since the last batch (not on every edit) — cost control, not just a nice-to-have.
- **AMS streak tracker**: AMS-only (never periodic), needs ≥2 consecutive 90+ grades to appear at all, shown as a 🔥+number badge. Grace-dip mechanic: one below-90 week after an active streak doesn't reset it, it goes "at risk" (greyed, count preserved) for exactly one more entry — a 90+ right after recovers it, a second consecutive dip breaks it to zero. Full state machine is `calculateAmsStreakInfo()` in `academics.js`. Has unlock/death CSS animations client-side (`useStreakAnimation` hook, transition-detected between renders, never fires on first mount).

**AI Study Plan Generator**
- Pick any upcoming *periodic* exam (finals excluded — they're school-wide, not a single subject's material to plan around), for any subject, even months out.
- Requires material already attached to that exam (both client-hidden and server-enforced 400 if missing) — a plan needs something concrete to schedule.
- Plan length is driven by the subject's quiz-rated difficulty (`studyPlanDays()`): very_easy=3, easy=4, medium=5, hard=7, very_hard=14 days, always anchored to end right before the exam date.
- 60-second server-enforced cooldown between generations for the same exam (429 + client-side live countdown) — stops accidental AI-quota burn from double-taps/regenerate spam.
- All generated plans persisted (`study_plans` table, one row per exam, upsert on regenerate) and always accessible via a picker, not just the exam that triggered generation.
- Home page shows a live preview: the single nearest not-yet-passed task across every saved plan.

**Home dashboard**
- One shared component structure per UI style (`HomeClassic` / `HomeTechnical` / `HomeOrbit`), each with: Schedule preview, Academics preview (average + AMS streak for whichever subject currently has the highest streak, shown as a short sentence not a bare number), Suggestions (if any), Study Plan preview.

**Settings**
- Username/name edit, 6 color themes, 3 UI styles.

**Tutorial**
- First-time driven tour (Classic only — its steps target Classic-specific DOM like the hamburger drawer; every new signup defaults to Classic anyway). Gated by `users.tutorial_seen` (defaults `true` at the column level so existing accounts skip it; explicitly `false` on signup).
- Walks: Home (intro, schedule block, academics block, suggestions, study plan) → every menu item → Settings (color theme, UI style) → Schedule (example, add, priority, material, holidays) → Academics (example, add, estimate) → finish.
- Quiz page has its own separate, non-blocking companion cards (`tutorialActive` prop) — different mechanism from the driven Home tour.
- **"Restart Tutorial"** menu item (added this session, see section 5) re-runs the full tour any time, independent of the one-time `tutorial_seen` flag.

**Three UI styles** (`data-ui-style` attribute on `<html>`, set from `user.uiStyle`)
- **Classic** (default, internal value `classic`): warm cream background, serif display headings (Fraunces) + Karla body text, glassy soft cards, hamburger nav drawer. The one deliberately "3D" element is the hamburger/menu button — an offset stamped shadow in the theme's brand color (see section 5, this took several iterations to land on).
- **Technical** ("High-Tech" in UI copy, internal value stays `technical` — display label changed, not the stored value): CRT-terminal aesthetic, scanline overlay, command-bar navigation (`studycompass:~$` prompt), monospace type, Heat Grid academics view, Mission Log.
- **Orbit** (internal value `orbit`): space/star-map theme, radial `OrbitMap` visualization on the Schedule page (exams as stars in concentric urgency rings), `OrbitDial` circular nav.
- Only the pages with divergent nav chrome are actually split per style (`Home`/`Dashboard`/`Academics` wrapper components dispatching to `*Classic.jsx`/`*Technical.jsx`/`*Orbit.jsx`, plus exam/holiday bubble components). Everything else (Settings, Quiz, AuthPage, Upload, ManualEntry, GradeTable, dialogs, popups) is a single shared component reskinned purely through `[data-ui-style='X']` CSS token overrides — no JSX branching. `More.jsx` (account actions page) is shared between Technical and Orbit; Classic uses its hamburger drawer instead and has no `More` page.
- 6 color themes (`[data-theme='X']` blocks) apply orthogonally on top of any UI style — exam-difficulty colors (red/orange/green/gray) are semantic and never change with the theme.

## 4. Data model (Postgres, via `server/src/db.js`)

All schema is defined as idempotent `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `initDb()`, run on every server start.

- **`users`**: `id, username (CITEXT, unique, case-insensitive), name, password_hash, onboarded, periodic_day, theme (default purple_pink), ui_style (default classic), tutorial_seen (default true), created_at`
- **`user_subjects`**: `id, user_id, subject_key, difficulty` — unique per (user, subject). One row per subject the student rated in the quiz.
- **`schedule_uploads`**: `id, user_id, filename, original_name, status (processing/done/error), error, uploaded_at` — one row per schedule upload attempt.
- **`exams`**: `id, user_id, upload_id, subject_key (nullable), subject_label, exam_type (weekly/saturday/final), term, week_number, date, date_start, date_end, time, notes, source (ai/manual)`.
- **`holidays`**: `id, user_id, upload_id, label, date_start, date_end, term, week_number`.
- **`exam_materials`**: `id, exam_id (unique — one per exam), user_id, source (ai/manual), filename, original_name, periodic_code, quizzes (JSON array), questions (JSON array), details (JSON array), uploaded_at`.
- **`study_plans`**: `id, exam_id (unique), user_id, plan (JSON), generated_at (TIMESTAMPTZ — was TIMESTAMP originally, fixed this session, see section 5)`.
- **`grade_entries`**: `id, user_id, term, subject_key (nullable), subject_label, subcourse_label, week_number, grade (REAL), source (manual/ai), created_at`.
- **`grade_suggestions`**: `id, user_id, term, suggestions (JSON), baseline_average, generated_at` — unique per (user, term).
- **`user_sessions`**: managed entirely by `connect-pg-simple`, not hand-defined in `db.js`.
- All user-owned tables cascade-delete via `ON DELETE CASCADE` on `user_id`/`exam_id` FKs — deleting a user or an exam cleans up everything under it automatically.
- `db.js` also provides a **SQLite-`?`-placeholder-to-Postgres-`$N` compat layer** (the app was originally written against `node:sqlite` and migrated later — every query still uses `?` placeholders, translated automatically) and an auto-`RETURNING id` append on INSERTs, plus a `transaction()` helper using `AsyncLocalStorage` so nested `db.prepare()` calls inside a transaction callback transparently reuse the same checked-out connection.

## 5. Backend structure

`server/src/index.js` — Express bootstrap. CORS locked to `CLIENT_ORIGIN`, JSON body parsing, Postgres-backed sessions (30-day cookie, `sameSite:'none'`+`secure:true` in production since frontend/backend are cross-origin), routes mounted under `/api/*`, 15-minute server timeout (schedule parsing is a multi-step AI pipeline that can take a while).

Route files (`server/src/routes/`):
- `auth.js` — signup/login/logout/me/delete-account/profile update/tutorial-complete.
- `subjects.js` — the subject catalog (`GET /`) and the student's own quiz answers (`GET /mine`, `POST /mine` replaces the whole set in a transaction).
- `schedule.js` — AI schedule upload, upload status, delete-schedule.
- `manualExams.js` — manual exam CRUD (separate from the AI-upload flow's exams, but same `exams` table, distinguished by `source`), plus a `/finish` endpoint to mark onboarded when manual entry is the path taken.
- `dashboard.js` — the main `GET /` that assembles periodic/final exams + holidays for Home/Schedule pages, with all the term-scoping/priority-sorting/exact-date-pinning logic.
- `themes.js` — the 6-theme catalog.
- `materials.js` — exam material CRUD + the Study Plan Generator endpoints (cooldown, generation, bulk fetch).
- `academics.js` — grade CRUD, term auto-detection, weighted averaging, AMS streak calculation, suggestion regeneration gating.

AI service files (`server/src/services/`), all Gemini-based:
- `scheduleParser.js` — multi-step agentic pipeline reading the schedule photo/PDF.
- `materialParser.js` — reads uploaded study material.
- `gradeParser.js` — reads the SDP grade report screenshot.
- `suggestionGenerator.js` — generates academic suggestions from grades + difficulty ratings.
- `studyPlanGenerator.js` — generates the day-by-day study plan JSON.

`server/src/utils/uaeDate.js` — `getTodayIso()`, the single source of truth for "what day is it" across the whole backend (see section 6).

## 6. Key cross-cutting logic worth knowing before touching anything date- or difficulty-related

- **Timezone**: the school is in the UAE. `getTodayIso()` (`server/src/utils/uaeDate.js`) uses `Intl.DateTimeFormat` with `timeZone: 'Asia/Dubai'` so "today" flips at UAE midnight regardless of the server's own system timezone — a naive UTC-based "today" would lag UAE by up to 4 hours. Respects `FAKE_TODAY` env override for dev. Every route that needs "today" (`dashboard.js`, `academics.js`, `materials.js`) goes through this one function now — don't reintroduce a raw `new Date().toISOString().slice(0,10)` anywhere.
- **Difficulty system** (`server/src/constants/subjects.js`): 5 levels, `very_easy` through `very_hard`. Drives four separate things that are each tuned independently, don't assume they share thresholds: `difficultyColor` (red/orange/green/gray for exam bubbles), `difficultyRank` (sort order, harder = higher priority), `priorityWindowDays` (14/7/4 days depending on difficulty — how close an exam needs to be before it's flagged), and `studyPlanDays` (3–14 days — how long a generated study plan runs).
- **Grade weighting** (`gradeWeights()`): three tiers — boosted (AS Chemistry/Biology, AP Physics 1: periodic×2.5/AMS×1.5), equal (Islamic 1/2, Moral Education: 1/1), everything else (periodic×2/AMS×1). This is trial-and-error tuned against the school's actual rubric, not derived from anything — if a student reports their calculated average doesn't match their real one, this is the first place to check.
- **AMS streak** (`calculateAmsStreakInfo()` in `academics.js`): chronological state machine over AMS-only entries, floor 90, min length 2, one-dip grace period before breaking. Fully described in section 3.

## 7. Frontend structure

- `client/src/pages/` — one file per page, with `*Classic.jsx`/`*Technical.jsx`/`*Orbit.jsx` variants for the four split pages (Home, Dashboard, Academics, plus the shared-but-conditionally-rendered `More`/`MoreOrbit`). Everything else in this folder is a single shared page.
- `client/src/components/` — shared dialogs/popups (`ConfirmDialog`, `AddChoiceDialog`, `MaterialPopup`, `StudyPlanPopup`), per-style exam/holiday bubbles (`ExamBubbleClassic/Technical/Orbit`, `HolidayBubbleClassic/Technical/Orbit`), per-style nav (`NavDrawer` for Classic, `CommandBar` for Technical, `OrbitDial`+`OrbitMap` for Orbit), `GradeTable` (shared, no per-style branching), `HeatGrid`/`MissionLog` (Technical/Orbit-specific academics visualizations), `TutorialOverlay`.
- `client/src/hooks/` — `useBackButton.js` (a shared stack so Android hardware back-button presses close the topmost open overlay/dialog/drawer before falling back to tab navigation, see `App.jsx`'s `CapacitorApp.addListener('backButton', ...)`), `useTutorial.js`, `useStreakAnimation.js` (before/after comparison across renders to detect streak unlock/death transitions, keyed by subject identity, never fires on first mount).
- `client/src/tutorial/tutorialSteps.js` — the tour content, declarative: each step fully specifies the app state it needs via `onEnter` rather than assuming the previous step left things in the right shape.
- **Cross-theme CSS convention** (`client/src/index.css`, one large file): a base `:root` token block (Classic's own values, since Classic is the default/unstamped style), then `[data-theme='X']` blocks for the 6 color themes (override brand-*/bg/border), then `[data-ui-style='technical']`/`[data-ui-style='orbit']` blocks that redefine the same token set for their own look, then compound `[data-ui-style='X'][data-theme='Y']` blocks where a style needs per-theme tuning beyond just swapping the brand color (e.g. Technical/Orbit's glow intensity). Component classes are largely style-exclusive by naming (e.g. `.exam-bubble` only ever renders in Classic's JSX) — but a few base component classes (`.fab-btn`, `.see-all-btn`) are shared verbatim across styles via shared component files, so a style-specific tweak to one of those needs an explicit `[data-ui-style='classic'] .fab-btn { ... }` scope, not a direct edit to the base rule, or it'll leak into the other styles.
- **Old backup files present but unused**: `client/src/index.css.backup-soft-theme`, `.backup-soft-theme-v2`, `client/src/components/CalendarIcon.jsx.backup-soft-theme(-v2)` — leftover from an earlier redesign, not imported anywhere, safe to ignore or delete if you're cleaning up.

## 8. Standing conventions / preferences

(These live in the auto-memory system too and will load automatically in a new chat — repeated here so this doc is self-contained.)
- **No em dashes anywhere in user-facing app copy** — use commas, periods, colons, or semicolons instead.
- **Colors flat but vivid, never muted.** No handwritten/script fonts anywhere.
- **Batch local work, push once** — don't push to trigger repeated Netlify/Render deploys just to test something that can be checked locally first.
- **Be cost-conscious across every service**, not just Netlify: Render, GitHub Actions, Neon, and any Gemini API calls.
- **Test once after a fix, not repeatedly** — a clean `npx vite build` plus one targeted real-interaction check is the expected verification depth, not an exhaustive re-test loop.
- **Feature sprint window**: extra AI/API quota until **2026-08-19** — lean into building more before then, then expect a lull until the real 26/27 exam schedule is released (see memory `project_feature_sprint_window.md`).

## 9. What happened this session (most recent work, for continuity)

1. **UAE timezone fix** — see section 6. Also fixed `study_plans.generated_at` from `TIMESTAMP` to `TIMESTAMPTZ` (was silently drifting hours off, which would have made the study-plan cooldown never actually block).
2. **Classic UI rework** — went through several rejected iterations (a broad "sharpened neo-brutalist" hard-shadow treatment on every card, tried white shadow → purple shadow → fixed dark-ink shadow, each rejected for looking bad in some context) before landing on: **only the hamburger/menu button** keeps a deliberate 3D effect (offset stamped shadow in `var(--brand-700)`, normal `var(--border)` border, not white/ink), everything else (exam bubbles, holiday bubbles, stat chips, Home preview cards, suggestions box, FAB, "see all" button) reverted to its original soft/rounded styling. Header's bottom rule reverted to the original thin hairline (a bold white/ink line was tried and looked bad, especially in dark mode). Fixed a casing bug where "iSchedule"/"Home"/"iGrade" briefly got forced uppercase.
3. **Tutorial additions**: reworded the Suggestions step to lead with "these are personalized"; added a new Study Plan step right after it (`data-tutorial="study-plan-block"` on the Home preview card); added a **"Restart Tutorial"** menu item right below "Change Externals" (`useTutorial.js` got a `restart()` method, `App.jsx` got a `manualTutorialRestart` state OR'd into `tutorialDriven`, `MENU_ITEMS` in `tutorialSteps.js` updated to keep the drawer-highlight index aligned with the new item).

All of the above verified with clean `npx vite build`s after each batch. **Not** verified with a fresh full browser walkthrough of the tutorial/menu changes specifically — worth a quick manual click-through next session (Retake Quiz → Change Externals → Restart Tutorial → Settings in the drawer, confirm the tour restarts from step 1 and includes the new Study Plan step).

## 10. Open threads (discussed, not yet built)

- **Post-exam reflection feature** — mid-discussion, no decision made on scope. Two options were on the table:
  1. **Simple journal**: one-tap prompt after an exam passes ("How did Math go?" — worse/about right/better than expected), pure self-reflection log, no other behavior changes.
  2. **Smart feedback loop**: same prompt, but compared against the subject's quiz-rated difficulty and the eventual actual grade, potentially nudging the student to re-rate a subject's difficulty — which would then actually affect study plan length and priority flagging elsewhere. More work (new table/column, detection trigger, reconciliation logic) but the version that makes the rest of the app smarter over time.
  - Ask the user which scope before building anything.
- **`SCHEDULE_YEAR_SHIFT` for beta testing** — not implemented. Beta testers only have the old 25/26 schedule PDF to upload (the real 26/27 one isn't out yet). Plan: a temporary env-var-gated date shift applied to parsed exam/holiday dates on upload, so the old schedule's dates land a year forward and look like live current exams, without needing a global `FAKE_TODAY` override (which would also affect grades/materials/study-plan date logic for everyone). Remove the env var once the real schedule is available; beta testers' data will likely need wiping at that point since it's built around the shifted old schedule. Full context in memory `project_beta_testing.md`.
