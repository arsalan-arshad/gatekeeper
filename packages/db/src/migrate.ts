import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { PGVECTOR_EXTENSION_SQL } from './pgvector.js';

/**
 * Apply SQL migrations from packages/db/drizzle.
 * Ensures pgvector exists first (safe if the migration also enables it).
 */
export async function runMigrations(connectionString: string): Promise<void> {
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
