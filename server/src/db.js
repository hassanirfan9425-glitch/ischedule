import pg from 'pg';
import dns from 'node:dns';
import { AsyncLocalStorage } from 'node:async_hooks';

const { Pool } = pg;

// Supabase's pooler hostname resolves through an AWS ELB (confirmed live: aws-0-*.pooler.supabase.com
// -> a *.elb.amazonaws.com CNAME) rather than a stable single-host record. Pointing Node at known
// public resolvers instead of whatever the host/container provides rules out "our own resolver is
// uniquely bad" as a cause — but it's only a partial mitigation: the ELB itself has been observed
// (live, against 1.1.1.1 and 8.8.8.8 directly) intermittently returning nxdomain for this exact
// hostname and then resolving fine seconds later, which no client-side resolver choice can prevent.
// The retry in initDbWithRetry() (see index.js) and pool.on('error') below are what actually keep
// the app usable through that.
dns.setServers(['1.1.1.1', '8.8.8.8']);

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add it to server/.env (see server/.env.example).');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// node-postgres emits 'error' on the pool when an idle client hits a background problem (a DNS
// blip resolving Supabase's pooler host, a dropped connection, etc). With no listener, Node's
// default behavior for an unhandled EventEmitter 'error' is to crash the entire process — which is
// exactly what took the whole server down for a transient, self-resolving DNS hiccup. Logging it
// here instead means only requests actively in flight during the blip fail; the pool recovers and
// serves the next request normally.
pool.on('error', (err) => {
  console.error('Postgres pool error (non-fatal, pool will recover):', err.message);
});

// Lets db.prepare(...) calls made *inside* a transaction() callback transparently reuse the same
// checked-out client, instead of each grabbing a separate connection from the pool — without this,
// BEGIN/COMMIT/ROLLBACK on one connection wouldn't actually wrap statements run on others.
const txContext = new AsyncLocalStorage();

// The rest of the codebase was written against node:sqlite's `?` placeholder style — translate to
// Postgres's `$1, $2, ...` here rather than touching every query string across every route file.
function toPgParams(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// node:sqlite's `.run()` returns `lastInsertRowid` directly; Postgres needs `RETURNING id` on the
// INSERT itself. Every table in this app has an `id` primary key, so it's safe to append this
// automatically rather than editing every INSERT statement by hand.
function withReturningId(sql) {
  const trimmed = sql.trim();
  if (/^insert/i.test(trimmed) && !/returning/i.test(trimmed)) {
    return `${sql}\nRETURNING id`;
  }
  return sql;
}

async function runQuery(sql, params) {
  const client = txContext.getStore();
  const pgSql = toPgParams(sql);
  const executor = client || pool;
  return executor.query(pgSql, params);
}

export const db = {
  prepare(sql) {
    return {
      async get(...params) {
        const result = await runQuery(sql, params);
        return result.rows[0];
      },
      async all(...params) {
        const result = await runQuery(sql, params);
        return result.rows;
      },
      async run(...params) {
        const result = await runQuery(withReturningId(sql), params);
        return {
          lastInsertRowid: result.rows[0]?.id,
          changes: result.rowCount,
        };
      },
    };
  },
  async exec(sql) {
    const client = txContext.getStore();
    const executor = client || pool;
    await executor.query(sql);
  },
};

// Runs `fn` (which may call db.prepare(...) any number of times) inside a single Postgres
// transaction. Usage stays the same shape as before: `const doIt = transaction(async () => {...});
// await doIt();` — every db call inside fn now needs an `await`, since the whole stack is async.
export function transaction(fn) {
  return async (...args) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await txContext.run(client, () => fn(...args));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  };
}

export async function initDb() {
  // citext gives case-insensitive username matching/uniqueness "for free" on every `= ?` query,
  // matching the old COLLATE NOCASE behavior without rewriting every query that filters by it.
  await pool.query('CREATE EXTENSION IF NOT EXISTS citext');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username CITEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      onboarded INTEGER NOT NULL DEFAULT 0,
      periodic_day TEXT,
      theme TEXT NOT NULL DEFAULT 'terracotta',
      ui_style TEXT NOT NULL DEFAULT 'classic',
      tutorial_seen BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_style TEXT NOT NULL DEFAULT 'classic';
    -- Defaults to true at the column level so every already-onboarded account (this migration's
    -- existing rows) is treated as having already seen it — only brand-new signups (see auth.js's
    -- POST /signup, which explicitly inserts false) get the tour.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS tutorial_seen BOOLEAN NOT NULL DEFAULT true;
    -- Opt-in (default off): when true, a post-exam reflection mismatch (see routes/reflections.js)
    -- gets applied automatically instead of surfacing a confirmation nudge to the student.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_adjust_difficulty BOOLEAN NOT NULL DEFAULT false;

    CREATE TABLE IF NOT EXISTS user_subjects (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_key TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      UNIQUE(user_id, subject_key)
    );

    CREATE TABLE IF NOT EXISTS schedule_uploads (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      error TEXT,
      pending_data TEXT,
      uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE schedule_uploads ADD COLUMN IF NOT EXISTS pending_data TEXT;

    CREATE TABLE IF NOT EXISTS exams (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      upload_id INTEGER REFERENCES schedule_uploads(id) ON DELETE CASCADE,
      subject_key TEXT,
      subject_label TEXT NOT NULL,
      exam_type TEXT NOT NULL DEFAULT 'weekly',
      term INTEGER,
      week_number INTEGER,
      date TEXT,
      date_start TEXT,
      date_end TEXT,
      time TEXT,
      notes TEXT,
      source TEXT NOT NULL DEFAULT 'ai'
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      upload_id INTEGER REFERENCES schedule_uploads(id) ON DELETE CASCADE,
      label TEXT,
      date_start TEXT NOT NULL,
      date_end TEXT NOT NULL,
      term INTEGER,
      week_number INTEGER
    );

    CREATE TABLE IF NOT EXISTS exam_materials (
      id SERIAL PRIMARY KEY,
      exam_id INTEGER NOT NULL UNIQUE REFERENCES exams(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'ai',
      filename TEXT,
      original_name TEXT,
      periodic_code TEXT,
      quizzes TEXT NOT NULL DEFAULT '[]',
      questions TEXT NOT NULL DEFAULT '[]',
      details TEXT NOT NULL DEFAULT '[]',
      past_papers TEXT NOT NULL DEFAULT '[]',
      uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE exam_materials ADD COLUMN IF NOT EXISTS details TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE exam_materials ADD COLUMN IF NOT EXISTS past_papers TEXT NOT NULL DEFAULT '[]';

    CREATE TABLE IF NOT EXISTS study_plans (
      id SERIAL PRIMARY KEY,
      exam_id INTEGER NOT NULL UNIQUE REFERENCES exams(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Was created as TIMESTAMP (no zone) — NOW() got silently shifted by this session's non-UTC
    -- timezone on write, so "how long ago was this generated" comparisons (the cooldown check)
    -- came out hours off. TIMESTAMPTZ stores the real instant regardless of session timezone.
    ALTER TABLE study_plans ALTER COLUMN generated_at TYPE TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS grade_entries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      term INTEGER NOT NULL,
      subject_key TEXT,
      subject_label TEXT NOT NULL,
      subcourse_label TEXT NOT NULL,
      week_number INTEGER,
      grade REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    -- Set only by the offline mutation queue (a client-generated id tagging one queued write) so a
    -- replayed submission after a dropped connection can't double-insert the same grade. Nullable
    -- and only unique when present (a partial index) since every other insert path (AI upload, and
    -- manual entries made while online) never sets it and shouldn't be constrained by it.
    ALTER TABLE grade_entries ADD COLUMN IF NOT EXISTS client_mutation_id TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS grade_entries_user_client_mutation_id
      ON grade_entries (user_id, client_mutation_id) WHERE client_mutation_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS grade_suggestions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      term INTEGER NOT NULL,
      suggestions TEXT NOT NULL DEFAULT '[]',
      baseline_average REAL,
      generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, term)
    );

    CREATE TABLE IF NOT EXISTS exam_reflections (
      id SERIAL PRIMARY KEY,
      exam_id INTEGER NOT NULL UNIQUE REFERENCES exams(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_key TEXT NOT NULL,
      term INTEGER,
      rating TEXT NOT NULL,
      nudge_dismissed_at TIMESTAMPTZ,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    -- goal_identity mirrors the subjectKey || 'label:'+subjectLabel identity resolution already
    -- used by calculateTermSummary/reflections.js, plus a reserved 'overall' sentinel for the
    -- whole-term goal — keeping it NOT NULL (rather than a nullable subject_key in the UNIQUE
    -- constraint) sidesteps Postgres treating NULLs as distinct, which would otherwise fail to
    -- enforce one-goal-per-subject for free-text/AI-unmatched subjects.
    CREATE TABLE IF NOT EXISTS grade_goals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      term INTEGER NOT NULL,
      goal_identity TEXT NOT NULL,
      subject_key TEXT,
      subject_label TEXT,
      target_average REAL NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, term, goal_identity)
    );
  `);
}

export { pool };
