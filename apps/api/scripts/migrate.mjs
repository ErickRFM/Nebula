import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
const url=process.env.DATABASE_URL;
if(!url){console.error('DATABASE_URL must be set');process.exit(1);}
const pool=new Pool({connectionString:url});
try{
  const sql=await readFile(new URL('../migrations/0001_init.sql',import.meta.url),'utf8');
  await pool.query(sql);
  console.log('NÉBULA API migration 0001 applied');
}catch(error){console.error(error);process.exitCode=1;}
finally{await pool.end();}
