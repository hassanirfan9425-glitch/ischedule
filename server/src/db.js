import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add it to server/.env (see server/.env.example).');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
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
      theme TEXT NOT NULL DEFAULT 'purple_pink',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

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
      uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

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
      uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

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

    CREATE TABLE IF NOT EXISTS grade_suggestions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      term INTEGER NOT NULL,
      suggestions TEXT NOT NULL DEFAULT '[]',
      baseline_average REAL,
      generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, term)
    );
  `);
}

export { pool };
