import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
const url=process.env.DATABASE_URL;
if(!url){console.error('DATABASE_URL must be set');process.exit(1);}
const pool=new Pool({connectionString:url});
try{
  for(const name of ['0001_init.sql','0002_external_library.sql']) {
    const sql=await readFile(new URL('../migrations/'+name,import.meta.url),'utf8');
    await pool.query(sql);
    console.log('NÉBULA API migration applied:',name);
  }
}catch(error){console.error(error);process.exitCode=1;}
finally{await pool.end();}
