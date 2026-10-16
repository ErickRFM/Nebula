import { randomBytes, randomUUID, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { Pool } from 'pg';

const scrypt = promisify(scryptCallback);
const DERIVED_LENGTH = 64;

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, DERIVED_LENGTH);
  return ['scrypt', salt, derived.toString('hex')].join('$');
}

const url = process.env.DATABASE_URL;
const email = (process.env.OWNER_EMAIL ?? '').trim().toLowerCase();
const password = process.env.OWNER_PASSWORD ?? '';

if (!url) { console.error('DATABASE_URL must be set'); process.exit(1); }
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
  console.error('OWNER_EMAIL must be a valid email address');
  process.exit(1);
}
if (password.length < 12 || password.length > 128) {
  console.error('OWNER_PASSWORD must contain between 12 and 128 characters');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
try {
  const existing = await pool.query("SELECT id FROM users WHERE role = 'owner' LIMIT 1");
  if (existing.rowCount > 0) {
    console.log('An OWNER account already exists; refusing to create another. Use the admin API instead.');
    process.exit(0);
  }
  const hash = await hashPassword(password);
  await pool.query(
    "INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, 'owner')",
    [randomUUID(), email, hash],
  );
  console.log(`OWNER account created for ${email}`);
} catch (error) {
  if (error && error.code === '23505') {
    console.error('That email is already registered; no changes were made.');
  } else {
    console.error(error);
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
