import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import './db.js';

import authRoutes from './routes/auth.js';
import subjectsRoutes from './routes/subjects.js';
import scheduleRoutes from './routes/schedule.js';
import dashboardRoutes from './routes/dashboard.js';
import themesRoutes from './routes/themes.js';
import manualExamsRoutes from './routes/manualExams.js';

const app = express();
const PORT = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === 'production';

// Render (and most hosts) sit behind a TLS-terminating proxy — without this, Express thinks
// every request is plain HTTP and refuses to set secure cookies.
if (isProduction) app.set('trust proxy', 1);

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      // Frontend (Netlify) and backend (Render) live on different domains in production, so the
      // session cookie needs sameSite:'none' to be sent cross-site — which in turn requires
      // secure:true (browsers reject sameSite:'none' cookies over plain HTTP).
      sameSite: isProduction ? 'none' : 'lax',
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

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const server = app.listen(PORT, () => {
  console.log(`exam-tracker server listening on http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn('WARNING: GEMINI_API_KEY is not set — schedule uploads will fail until it is configured in server/.env');
  }
});

// Schedule analysis can take a while (multi-step agentic pipeline) — allow generous time.
server.timeout = 15 * 60 * 1000;
