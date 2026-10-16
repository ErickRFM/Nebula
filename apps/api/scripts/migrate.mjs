import { readdir, readFile } from 'node:fs/promises';
import { Pool } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL must be set'); process.exit(1); }

const migrationsDir = new URL('../migrations/', import.meta.url);
const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const { rows } = await client.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((row) => row.name));
  for (const file of files) {
    if (applied.has(file)) { console.log(`skip  ${file} (already applied)`); continue; }
    const sql = await readFile(new URL(file, migrationsDir), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`apply ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  console.log('NÉBULA API migrations up to date');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
