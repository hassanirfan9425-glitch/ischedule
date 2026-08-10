import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'app.db');

// DatabaseSync doesn't create missing parent directories itself — on a fresh deploy (data/ is
// gitignored, so it never exists in a new checkout) that fails with "unable to open database file".
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// node:sqlite has no built-in transaction helper — wrap statements manually.
export function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    onboarded INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_key TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    UNIQUE(user_id, subject_key)
  );

  CREATE TABLE IF NOT EXISTS schedule_uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    error TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    upload_id INTEGER REFERENCES schedule_uploads(id) ON DELETE CASCADE,
    label TEXT,
    date_start TEXT NOT NULL,
    date_end TEXT NOT NULL,
    term INTEGER,
    week_number INTEGER
  );

  CREATE TABLE IF NOT EXISTS exam_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL UNIQUE REFERENCES exams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'ai',
    filename TEXT,
    original_name TEXT,
    periodic_code TEXT,
    quizzes TEXT NOT NULL DEFAULT '[]',
    questions TEXT NOT NULL DEFAULT '[]',
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS grade_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    term INTEGER NOT NULL,
    subject_key TEXT,
    subject_label TEXT NOT NULL,
    subcourse_label TEXT NOT NULL,
    week_number INTEGER,
    grade REAL NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS grade_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    term INTEGER NOT NULL,
    suggestions TEXT NOT NULL DEFAULT '[]',
    baseline_average REAL,
    generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, term)
  );
`);

// Idempotent migration for columns added after the table already existed on disk.
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn('exams', 'exam_type', "exam_type TEXT NOT NULL DEFAULT 'weekly'");
ensureColumn('exams', 'time', 'time TEXT');
ensureColumn('users', 'periodic_day', 'periodic_day TEXT');
ensureColumn('users', 'theme', "theme TEXT NOT NULL DEFAULT 'purple_pink'");
ensureColumn('exams', 'source', "source TEXT NOT NULL DEFAULT 'ai'");
