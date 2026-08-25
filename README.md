# Cram

Sign up, take a quick subject-difficulty quiz, then upload a photo or PDF of your school's exam
calendar and grades. Cram builds a dashboard of upcoming exams and holidays (color-coded by how
hard you rated each subject), tracks your grades against two-tier weighting, and generates AI study
plans and practice material for individual exams. Built for one specific UAE school's SABIS system
(weekly "Periodic" assessments + termly "AMS" grades + Final exams) — subject list, grade weights,
and exam types are hardcoded to that school, not generic.

## Stack

- `server/` — Node + Express + PostgreSQL (`pg`), sessions stored in Postgres via `connect-pg-simple`
- `client/` — React + Vite
- AI parsing (schedule/grade/material uploads, study plans) via Google's Gemini API

## One-time setup

1. Install dependencies:

   ```bash
   cd server && npm install
   cd ../client && npm install
   ```

2. Add a free Gemini API key (needed for schedule/material parsing and study plan generation):

   ```bash
   cd server
   cp .env.example .env
   ```

   Go to https://aistudio.google.com/apikey, sign in with any Google account, click "Create API
   key" (no billing setup needed), and paste it into `server/.env` as `GEMINI_API_KEY=...`.

3. Add a Postgres connection string to `server/.env` as `DATABASE_URL` (a free
   [Supabase](https://supabase.com) project works well — use its Session Pooler connection string).

## Running it

In two terminals:

```bash
cd server && npm run dev
```

```bash
cd client && npm run dev
```

Then open http://localhost:5173.

## How it works

- **Sign up** asks for username (must be unique), name, and password, hashed with bcrypt.
- On first login, a **quiz** rates the fixed core subjects (English, Math, Mechanics, Chemistry,
  Economics, Physics, + Arabic/Islamic where applicable) plus any electives, and asks which weekday
  periodic exams run on. Reachable again from the nav drawer to update answers.
- **Calendar**: upload a PDF/image of the school's exam calendar. An AI pipeline
  (`server/src/services/scheduleParser.js`) classifies it as a general term calendar or a final-exam
  timetable and extracts holidays, weekly Periodic assessments, Saturday board-exam sessions, and
  Final exam blocks. Final-exam uploads go through a review step before committing — you can drop
  any row the AI got wrong before it's saved. A manual entry fallback is always available.
- **Academics**: log grades (AI-parsed from an uploaded grade sheet, or manual entry), see two-tier
  weighted averages and AMS streaks, set a target average (overall or per-subject) and get told what
  you need on remaining assessments to hit it.
- **Materials & study plans**: attach a PDF/photo of exam-prep material to any upcoming exam for an
  AI-generated breakdown (quizzes, question bank, key details, and — for AS/A-Level-aligned final
  exams — links to matching Cambridge past papers), or generate a full AI study plan for that exam.
- **Reflections**: after a periodic exam, rate how it went versus expectations; a mismatch against
  the subject's rated difficulty offers a one-tap re-rate that actually adjusts future study plans.
- Three selectable UI styles (Classic / Technical / Orbit) and a color theme picker, purely visual —
  exam-difficulty colors never change.

## Notes / limitations

- Uploaded files are stored on disk at `server/uploads/` — fine for a single-instance deploy, not
  built for multi-instance or ephemeral-filesystem hosting without changes.
- Built and tuned against one specific school's calendar/grade-sheet format. A differently laid-out
  document may need prompt or subject-glossary adjustments in `server/src/constants/subjects.js` and
  the relevant service in `server/src/services/`.
