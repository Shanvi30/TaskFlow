const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'taskmanager.db');

let db;

function getDb() {
  if (db) return db;

  // Try better-sqlite3 (production Docker), fallback to Node 22+ built-in sqlite
  try {
    const Database = require('better-sqlite3');
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    console.log('DB: better-sqlite3');
  } catch {
    const { DatabaseSync } = require('node:sqlite');
    const rawDb = new DatabaseSync(DB_PATH);
    rawDb.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    // Wrap to normalize null-prototype objects from node:sqlite
    db = {
      exec: (sql) => rawDb.exec(sql),
      prepare: (sql) => {
        const stmt = rawDb.prepare(sql);
        return {
          get: (...args) => { const r = stmt.get(...args); return r ? Object.assign({}, r) : undefined; },
          all: (...args) => stmt.all(...args).map(r => Object.assign({}, r)),
          run: (...args) => stmt.run(...args),
        };
      },
    };
    console.log('DB: node:sqlite (built-in)');
  }

  initSchema();
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      owner_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'member')) DEFAULT 'member',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      project_id INTEGER NOT NULL,
      assignee_id INTEGER,
      creator_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('todo','in_progress','done')) DEFAULT 'todo',
      priority TEXT NOT NULL CHECK(priority IN ('low','medium','high')) DEFAULT 'medium',
      due_date DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

module.exports = { getDb };
