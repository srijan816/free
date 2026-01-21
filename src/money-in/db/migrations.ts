import fs from 'node:fs/promises';
import { sql } from 'kysely';
import { db } from './index.js';

export async function runMigrations() {
  const migrationsDir = new URL('./migrations/', import.meta.url);
  const entries = await fs.readdir(migrationsDir);
  const sqlFiles = entries.filter((name) => name.endsWith('.sql')).sort();

  for (const file of sqlFiles) {
    const sqlText = await fs.readFile(new URL(file, migrationsDir), 'utf8');
    const query = sql.raw(sqlText).compile(db);
    await db.executeQuery(query);
  }
}

if (process.argv[1]?.includes('migrations')) {
  runMigrations()
    .then(() => {
      console.log('Migrations applied');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
