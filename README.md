# iSchedule

A local website: sign up / log in, take a quick subject-difficulty quiz, upload a photo or PDF of
your school's exam/holiday schedule, and get a dashboard of upcoming exams and holidays with
countdowns — exams color-coded red/orange/green by how hard you rated the subject.

## Stack

- `server/` — Node + Express + SQLite (using Node's built-in `node:sqlite`, no native build step)
- `client/` — React + Vite

## One-time setup

1. Install dependencies:

   ```bash
   cd server && npm install
   cd ../client && npm install
   ```

2. Add a free Gemini API key (needed for the agent that reads the schedule image/PDF — Google's
   Gemini API has a genuinely free tier, no credit card required):

   ```bash
   cd server
   cp .env.example .env
   ```

   Then go to https://aistudio.google.com/apikey, sign in with any Google account, click
   "Create API key" (no billing setup needed), and paste it into `server/.env` as
   `GEMINI_API_KEY=...`. Without this, everything works except the automatic schedule upload step
   (manual entry, below, still works fine without a key).

   The default model (`gemini-flash-lite-latest`) is picked for its much larger free-tier daily
   quota — the schedule parser makes 6 API calls per upload. If you hit a 429 rate-limit error,
   you've exhausted the free quota for the day; wait and retry, or point `GEMINI_MODEL` in `.env`
   at a different available model.

## Running it

In two terminals:

```bash
cd server && npm start
```

```bash
cd client && npm run dev
```

Then open http://localhost:5173 in Chrome.

## How it works

- **Sign up** asks for username (must be unique), name, and password. **Log in** asks only for
  username and password. Passwords are hashed with bcrypt.
- On first login, the user takes a **quiz**: Arab/Muslim questions (determines whether Arabic,
  Islamic 1, or Islamic 2 shows up as a core subject), a periodic-exam weekday question, then rates
  the fixed core subjects (English, Math, Mechanics, Chemistry, Economics, Physics, +
  Arabic/Islamic if applicable), then picks and rates any elective subjects (AS Level, AP,
  Languages, Other). Reachable again any time from the left nav drawer to update answers.
- Then a **big "+" upload screen** lets them attach a PDF or image of their school's exam/holiday
  schedule grid. If that fails (or the AI gets something wrong), there's a permanent **manual
  entry** fallback (left nav drawer, or a link that appears under any upload error) — pick a
  subject from a scrollable list of the student's own subjects, add a date/type/time, repeat as
  needed, press Done.
- On a successful upload, the server runs a **6-step agentic pipeline**
  (`server/src/services/scheduleParser.js`) against Google's free Gemini API: it reads the grid's
  row-per-week structure, extracts holiday weeks (blue-shaded, blank week number — weekends shaded
  orange are never holidays), extracts weekly "Periodic" assessments, extracts Saturday board-exam
  sessions (with times), extracts Final Exam blocks (one per term), then does a self-review pass
  before producing final structured JSON. Subject codes are matched using a glossary built from
  `server/src/constants/subjects.js`. Re-uploading replaces the previous upload's AI-parsed data
  (manual entries are untouched).
- The **dashboard** shows four sections in order: weekly assessments, Saturday exam sessions, final
  exam periods, then holidays — scoped to the current term, sorted hardest-subject-first (with a
  "Priority" badge) regardless of date proximity. Each exam is color-coded by the difficulty rating
  of its matched subject (red = hard/very hard, orange = medium, green = easy/very easy, gray =
  unmatched/unrated). A left nav drawer (hamburger icon, top-left) gives access to retaking the
  quiz, re-uploading, manual entry, and settings at any time.
- **Settings** lets a user change their username/name and pick a color theme (Green, Red & Blue,
  Purple & Pink, Black & Grey, Gold & Dark Blue, Blue & White) — purely decorative, the
  exam-difficulty colors never change.

## Notes / limitations (local-only app)

- Sessions are stored in memory, so restarting the server logs everyone out.
- The SQLite database file lives at `server/data/app.db`.
- Uploaded schedule files are stored in `server/uploads/`.
- This was built and tuned against one specific schedule format (a SABIS-style row-per-week grid
  with Periodic 1/2 columns and a Saturday-sessions column). A very differently laid-out schedule
  may need prompt or subject-glossary adjustments in `server/src/constants/subjects.js` and
  `server/src/services/scheduleParser.js`.
