import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { PGVECTOR_EXTENSION_SQL } from './pgvector.js';

const SAFE_DB_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function isMissingDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  const message = 'message' in error ? String((error as { message?: unknown }).message ?? '') : '';
  return code === '3D000' || /database ".*?" does not exist/i.test(message);
}

/**
 * Ensure the database named in DATABASE_URL exists.
 * Fresh Railway Postgres volumes often boot with only the default `postgres` DB
 * even when POSTGRES_DB is set later — create the app DB before migrating.
 */
export async function ensureDatabaseExists(connectionString: string): Promise<void> {
  const url = new URL(connectionString);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!dbName || dbName === 'postgres') return;
  if (!SAFE_DB_NAME.test(dbName)) {
    throw new Error(`Refusing to create database with unsafe name: ${dbName}`);
  }

  const probe = postgres(connectionString, { max: 1, connect_timeout: 20 });
  try {
    await probe`select 1`;
    return;
  } catch (error) {
    if (!isMissingDatabaseError(error)) throw error;
  } finally {
    await probe.end({ timeout: 5 }).catch(() => undefined);
  }

  const adminUrl = new URL(connectionString);
  adminUrl.pathname = '/postgres';
  const admin = postgres(adminUrl.toString(), { max: 1, connect_timeout: 20 });
  try {
    const existing = await admin`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (existing.length === 0) {
      await admin.unsafe(`CREATE DATABASE "${dbName}"`);
      console.info(`[gatekeeper/db] Created database "${dbName}"`);
    }
  } finally {
    await admin.end({ timeout: 5 });
  }
}

/**
 * Apply SQL migrations from packages/db/drizzle.
 * Ensures the database and pgvector exist first (safe if already applied).
 */
export async function runMigrations(connectionString: string): Promise<void> {
  await ensureDatabaseExists(connectionString);

  const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
  const client = postgres(connectionString, { max: 1 });
  try {
    await client.unsafe(PGVECTOR_EXTENSION_SQL);
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
  } finally {
    await client.end();
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to run migrations');
  }
  await runMigrations(url);
  console.log('Migrations applied.');
}

const isDirectRun =
  process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js');

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
