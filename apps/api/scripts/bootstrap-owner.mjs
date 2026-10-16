import {randomBytes,randomUUID,scrypt as scryptCallback} from 'node:crypto';
import {promisify} from 'node:util';
import {Pool} from 'pg';

const email=process.env.NEBULA_OWNER_EMAIL?.trim().toLowerCase();
const password=process.env.NEBULA_OWNER_PASSWORD;
const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length<12){
  console.error('Set DATABASE_URL, NEBULA_OWNER_EMAIL (valid email), NEBULA_OWNER_PASSWORD (12+ chars).');
  process.exit(1);
}
const pool=new Pool({connectionString:databaseUrl,max:1});
let client;
try{
  const scrypt=promisify(scryptCallback);
  const salt=randomBytes(16).toString('hex');
  const digest=await scrypt(password,salt,64);
  const passwordHash='scrypt$'+salt+'$'+digest.toString('hex');
  client=await pool.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock($1)',[20261016]);
  const count=await client.query('SELECT COUNT(*)::integer AS total FROM users');
  if(count.rows[0].total!==0) throw new Error('Bootstrap refused: users already exist. Use the existing owner account or an audited recovery procedure.');
  await client.query('INSERT INTO users (id,email,password_hash) VALUES ($1,$2,$3)',[randomUUID(),email,passwordHash]);
  await client.query('COMMIT');
  console.log('Initial private account created:',email);
} catch(error){
  if(client){try{await client.query('ROLLBACK');}catch{}}
  console.error('Owner bootstrap failed:',error instanceof Error?error.message:String(error));
  process.exitCode=1;
} finally {
  if(client)client.release();
  await pool.end();
}
