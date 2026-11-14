import { createDb, type Database } from '@gatekeeper/db';

let db: Database | undefined;

export function getDb(): Database {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }
  db = createDb(url);
  return db;
}

export function resetDbForTests(): void {
  db = undefined;
}
