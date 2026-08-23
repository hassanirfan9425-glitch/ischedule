# Cram — Project Handoff

Written 2026-08-20. Complete reference for picking this project up in a fresh chat. Point-in-time snapshot — re-verify against actual code/DB if something with a specific number or file:line seems off.

## 1. What this app is

"Cram" (rebranded from "Study Compass", which itself replaced older per-section names "iCalendar"/"iSchedule"/"iGrade" — all user-facing text now says "Cram" everywhere) — exam schedule, grade, and study tracker for one specific UAE school's SABIS system (weekly "Periodic" assessments + termly "AMS" grades + Final exams). Not generic — subject list, grade weights, exam types are hardcoded to this one school.

## 2. Access & deployment

- **Repo root**: `C:\Users\hassan irfan\claude projects\exam-tracker`
- **GitHub**: `hassanirfan9425-glitch/ischedule.git`. Production branch is **`master`** (not `main`). Local work happens on branch `ui-style-selector`, which contains everything `master` has plus more — push with `git push origin ui-style-selector:master` (clean fast-forward). Last pushed commit `33b84ed`.
- **GitHub Actions**: `.github/workflows/build-apk.yml` triggers on **every** push to `master` (no path filter) — builds + signs an Android APK, publishes to a GitHub release. Android app is currently **broken** (not diagnosed, deferred to post-beta — decide then whether to fix or drop it from the release).
- **Frontend hosting**: Netlify. **Two Netlify identities exist on this account** — team "hackathon group 8" (misleading name, old hackathon project, but this genuinely is the team hosting the real site) under `theminecraftguyboi12@gmail.com`, vs. team `hassanirfan9425-glit...` under a different email. The real one is "hackathon group 8." A duplicate/orphaned site (`cute-chebakia-21506a`, created Aug 9, served nothing) was silently double-deploying on every push and was deleted this session.
  - **Netlify credits are currently maxed out** (300/300 used, ~20 deploys at 15 credits each) — running on "operational credits" (~30 left). **Production deploys are paused** until the next billing cycle or an upgrade. A `git push` still works, but Netlify will NOT build/deploy it — the live site keeps serving whatever's already deployed. Check this before assuming a push went live.
  - `client/netlify.toml` proxies `/api/*` to the Render backend (see cookie fix below) and skips deploys for Android/CI-only-touching pushes.
- **Backend hosting**: Render, deploys from `server/`, URL `https://ischedule-ccaj.onrender.com`. No `render.yaml` — configured in Render's dashboard directly.
- **Database**: **migrated from Neon to Supabase this session** (both local dev and production now point at the same Supabase DB — resolves an earlier bug where they were silently on two different Neon databases). Reason: Neon's free tier meters by compute-hours and hits a hard outage when exhausted; Supabase's free tier is a fixed compute allocation that degrades to "slow" instead of "down" under abuse — safer failure mode for a small live app. Supabase project ID `hsfvsbwdszpywtrvpjhi`, region `ap-northeast-2` (Seoul — not close to the UAE, fine for this traffic level). **Must use the Session Pooler connection string, not Direct Connection** (direct host doesn't resolve on IPv4-only networks) — and **do not append `?sslmode=require`** to it (conflicts with the app's own `ssl: { rejectUnauthorized: false }` config in `db.js` and throws a cert error; the app's own config already handles this correctly).
- **Env vars** (`server/.env`, gitignored): `GEMINI_API_KEY`, `SESSION_SECRET`, `PORT`, `DATABASE_URL` (Supabase session-pooler string, no sslmode param), and in production `NODE_ENV=production` + `CLIENT_ORIGIN`. `SCHEDULE_YEAR_SHIFT=1` is currently set (see section 6) — temporary, remove once the real current-year calendar is published. `FAKE_TODAY` has been removed (was a dev-only testing override, no longer present).
- **Run locally**: `cd server && npm run dev` (auto-restarts on file changes, but **not** on `.env` changes — kill and restart manually after editing `.env`) in one terminal; `cd client && npm run dev` in another.
- **Known stale doc**: `README.md` still says `Node + Express + SQLite` — actually Postgres/Supabase. Not fixed yet.

## 3. Feature inventory

**Auth & onboarding** — unchanged from before: bcrypt + session auth in Postgres (`connect-pg-simple`), mandatory difficulty quiz, optional schedule/grades after.

**Calendar (formerly "Schedule")** — rebranded to "Calendar" throughout the UI this session (tab label, headers, empty states, delete buttons, tutorial copy) since students don't think of it as a schedule they own, they think of it as the school's calendar. Two upload paths:
- **General calendar** (`scheduleParser.js`, up to 6 AI turns) — weekly grid of Periodic/AMS/holidays.
- **Final exam timetable** (`finalExamParser.js`, 3 AI turns) — standalone document, reads one hardcoded grade column (`Grade 11S UAE`).
- A cheap classifier call (`scheduleClassifier.js`) picks which pipeline runs automatically.
- **Upload is now asynchronous** (rebuilt this session): the endpoint returns instantly with an `uploadId`, parsing continues in the background, client polls `GET /schedule/status` every 3s. This was a required fix, not a nice-to-have — see section 6.
- **Term 1 Week 1 auto-correction**: the school's printed calendar labels that week "AMS" but it actually runs as a Grid Exam (every other term's first week correctly prints "Grid") — `schedule.js` now relabels this automatically on every upload.
- **`SCHEDULE_YEAR_SHIFT`**: temporary beta-only env flag, shifts every parsed exam/holiday date forward by N years so testers uploading last year's PDF see it as live/current. Schedule dates only — grades/materials/study-plan logic still uses the real date.

**Academics (grades)** — unchanged core (AI/manual grade entry, two-tier weighting, AMS streaks, current-term auto-detection), plus new this session:
- **Grade goals + "what grade do I need" calculator** — one merged popup (`GradeCalculatorPopup.jsx`), reachable from a small badge next to each subject's average and the overall average chip. Set a target (per-subject or whole-term overall), get told what you need on remaining assessments — pulls real remaining exam counts from the uploaded calendar where one exists (AMS = every week until the final exam's own week, from the schedule's own week-number data; Periodic = actual remaining scheduled exams), falls back to "next AMS + next periodic" if no calendar's uploaded. Server-side math only (`calculator.js`, reuses `academics.js`'s `calculateTermSummary` so there's one source of truth for averaging logic).
- **v1 limitation**: solves for exactly one hypothetical remaining assessment — more than one unknown is underdetermined.

**Reflections & difficulty nudge** — the "open thread" from the last handoff is now fully built, not just decided. After a periodic exam passes, `ReflectionPopup.jsx` asks worse/about-right/better than expected. `reflections.js` compares that against the subject's quiz-rated difficulty and the actual grade; a mismatch surfaces `DifficultyNudgePopup.jsx` offering a one-level re-rate, which (if accepted) actually changes that subject's study plan length and priority flagging going forward — the one feedback loop in the app that updates its own inputs rather than just displaying data.

**Study Plan Generator** — unchanged core, plus: material can now be attached directly from the Study Plan popup (`StudyPlanPopup.jsx` gained `onAddMaterial`) instead of forcing a detour to the Calendar tab — reuses the existing `MaterialUpload`/`ManualMaterialEntry` full-page-takeover components. Exam picker rows now show a `T{term} WK{week}` tag.

**Three UI styles** — unchanged (Classic/Technical/Orbit), goal badges redesigned this session per-style (reticle brackets / terminal chevron / comet tail, explicitly not emoji per direct instruction).

## 4. Data model — additions since last handoff

- **`grade_goals`**: `id, user_id, term, goal_identity (subjectKey || 'label:'+subjectLabel, or 'overall'), subject_key, subject_label, target_average, created_at, updated_at`, unique per `(user_id, term, goal_identity)`.
- **`exam_reflections`**: `id, exam_id (unique), user_id, subject_key, term, rating, nudge_dismissed_at, created_at`.
- Everything from the previous handoff's data model (users, user_subjects, schedule_uploads, exams, holidays, exam_materials, study_plans, grade_entries, grade_suggestions, user_sessions) is unchanged.

## 5. Backend structure — additions since last handoff

New route files: `goals.js` (grade goal upsert/delete), `calculator.js` (the two calculator endpoints). New service files: `scheduleClassifier.js`, `finalExamParser.js`. New: `server/src/middleware/aiRateLimit.js` (see section 6), `server/src/utils/scheduleYearShift.js`.

`schedule.js`'s upload route was restructured: the AI classify/parse/persist logic now lives in a standalone `processScheduleUpload()` function that runs after the HTTP response is already sent, not inside the request/response cycle.

## 6. Key cross-cutting logic

**AI rate limiting** (`aiRateLimit.js`) — calibrated against Google's actual dashboard, not guessed: `gemini-flash-lite-latest` free tier is 15 RPM / 500 RPD **project-wide**, not per-user. Two layers: `aiCallLimiter` (10/hour per user, shapes individual abuse) and a shared budget pool at 80% of the real ceiling (`12/minute`, `400/day`) via `aiCostLimiter(cost)` middleware for routes that always call Gemini, or `tryConsumeAiBudget(cost)` for conditional call sites (suggestion regen skips silently on exhaustion instead of failing the request). Verified under real concurrent load this session (9 and 50 simulated simultaneous users against the live site) — zero crashes, limiter held correctly both times.

**Cross-browser cookie fix** — root cause of a real reported bug (worked in Chrome, failed silently on all Safari/iOS): session cookie was cross-site (Netlify domain ≠ Render domain), requiring `sameSite: 'none'`, which Safari's default "Prevent Cross-Site Tracking" blocks outright. Fixed by having Netlify proxy `/api/*` to Render (`client/netlify.toml`), making every request same-origin from the browser's view. Cookie is now `sameSite: 'lax'` (`server/src/index.js`), works everywhere.

**The Netlify proxy has a ~30 second timeout**, unrelated to and much shorter than Render's own 15-minute server timeout. This broke schedule upload (the only endpoint slow enough to hit it) with a bare 504 in production — fixed by making upload asynchronous, see section 3. Keep this ceiling in mind before adding any other long-running synchronous endpoint.

**Timezone / difficulty / grade weighting / AMS streak** — unchanged from previous handoff, still accurate. See `server/src/utils/uaeDate.js`, `server/src/constants/subjects.js`, `academics.js`'s `calculateAmsStreakInfo()`.

## 7. Frontend structure — additions since last handoff

New components: `GradeCalculatorPopup.jsx`, `DifficultyNudgePopup.jsx`, `ReflectionPopup.jsx`. `SideTabs.jsx` confirmed genuinely dead (not imported anywhere, superseded by `NavDrawer`/`CommandBar`/`OrbitDial`) — safe to delete. `client/src/utils.js`'s `API_BASE` now always resolves to `/api` (relative) — the `VITE_API_URL` env var indirection was removed since the Netlify proxy handles both dev and prod uniformly now.

## 8. Standing conventions / preferences

- **No em dashes in user-facing app copy.**
- **Colors flat but vivid, never muted.** No handwritten/script fonts.
- **Never push without being explicitly told to, in the moment** — this was tightened further this session: even after being told to push once, ask again (with a reason) before any subsequent push, don't treat one approval as blanket permission.
- **Mind resource costs across every service** — Netlify, Render, GitHub Actions, Supabase/database compute, Gemini API. This session directly surfaced why: a stress test measurably ate into Supabase's compute budget in minutes, and Netlify deploy credits ran out from (partly) an orphaned duplicate site nobody caught for 11 days.
- **Always delete test/throwaway accounts after use** — create, verify, delete, every time.
- **Beta testing**: ~9 testers, about to start as of this writing. 3-phase plan: 1 week beta → 1 week fixing real feedback → full release. Once beta is live, priority is stabilizing and responding to real feedback, not building new surface area.
- The "feature sprint window" mentioned in the previous handoff (extra quota until 2026-08-19) has passed — that phase is over.

## 9. Known open items

- **No general rate limit on non-AI routes** (manual grade entry, dashboard reads, etc.) — identified, not built. Not a cost risk (no Gemini calls involved) but someone could flood their own account with junk data or keep the database compute needlessly awake.
- **Android app is broken** — not diagnosed. Decide post-beta whether to fix or drop the Android download option.
- **Netlify deploys are paused** (credits exhausted) — resolves on next billing cycle or an upgrade. Check current status before assuming any future push will actually go live on the frontend.
- **`SCHEDULE_YEAR_SHIFT`** must be removed once the real current-year calendar is published — beta testers' schedule data will likely need wiping/reshifting at that point since it's built around the artificially-shifted old calendar.
- `finalExamParser.js` hardcoded to one grade column; calculator only handles one hypothetical remaining assessment. Both known v1 scope limits, not bugs.
