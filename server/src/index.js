import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import helmet from 'helmet';
import { initDb, pool } from './db.js';

import authRoutes from './routes/auth.js';
import subjectsRoutes from './routes/subjects.js';
import scheduleRoutes from './routes/schedule.js';
import dashboardRoutes from './routes/dashboard.js';
import themesRoutes from './routes/themes.js';
import manualExamsRoutes from './routes/manualExams.js';
import materialsRoutes from './routes/materials.js';
import academicsRoutes from './routes/academics.js';
import reflectionsRoutes from './routes/reflections.js';
import goalsRoutes from './routes/goals.js';
import calculatorRoutes from './routes/calculator.js';

const app = express();
const PORT = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === 'production';

// Falling back to a hardcoded secret in production would let anyone who's read this source file
// (it's public/shared) forge a valid session cookie for any user id — same class of risk as
// DATABASE_URL being required below, so it gets the same hard stop instead of a silent fallback.
if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set. Add it to the production environment before starting the server.');
}

// Render (and most hosts) sit behind a TLS-terminating proxy — without this, Express thinks
// every request is plain HTTP and refuses to set secure cookies.
if (isProduction) app.set('trust proxy', 1);

// This API only ever returns JSON (never renders HTML itself), so contentSecurityPolicy has
// nothing to protect here — the frontend's own HTML is served by Netlify, a separate origin.
// Everything else (nosniff, frame options, HSTS, hiding X-Powered-By) still applies to every
// response this server sends.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());

// Sessions live in Postgres now (not server memory) — so a Render restart/sleep-wake cycle no
// longer logs everyone out along with wiping their data.
const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      // Netlify proxies /api/* to this server (see client/netlify.toml), so from the browser's
      // point of view every request is same-origin — sameSite:'lax' works everywhere, including
      // Safari/iOS, which blocks sameSite:'none' cross-site cookies by default.
      sameSite: 'lax',
      secure: isProduction,
    },
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/subjects', subjectsRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/themes', themesRoutes);
app.use('/api/manual-exams', manualExamsRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/academics', academicsRoutes);
app.use('/api/reflections', reflectionsRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/calculator', calculatorRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

await initDb();

const server = app.listen(PORT, () => {
  console.log(`exam-tracker server listening on http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn('WARNING: GEMINI_API_KEY is not set — schedule uploads will fail until it is configured in server/.env');
  }
});

// Schedule analysis can take a while (multi-step agentic pipeline) — allow generous time.
server.timeout = 15 * 60 * 1000;
