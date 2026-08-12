import Database from 'better-sqlite3';

/**
 * One SQLite file for everything the server itself owns — workflows, run history, credentials.
 * Deliberately separate from `@fluxforge/queue`'s own database (usually a second file): the
 * queue is a generic, reusable package with no idea what a "workflow" is, and giving it its own
 * schema keeps that boundary real rather than aspirational.
 */
export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      definition TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      status TEXT NOT NULL,
      state TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_runs_workflow ON runs(workflow_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS credentials (
      name TEXT PRIMARY KEY,
      encrypted_data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
}

export type FluxforgeDb = Database.Database;
