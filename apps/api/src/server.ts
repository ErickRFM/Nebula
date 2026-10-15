import { Pool } from 'pg';
import { buildApp } from './app.js';
const port=Number(process.env.API_PORT??'4000');
const secret=process.env.API_JWT_SECRET;
const dbUrl=process.env.DATABASE_URL;
if(!dbUrl||!secret||secret.length<32) throw new Error('Configure DATABASE_URL and API_JWT_SECRET (min 32 characters).');
const pool=new Pool({connectionString:dbUrl,max:10});
const app=await buildApp({pool,secret,origin:process.env.API_CORS_ORIGIN ?? 'http://localhost:3000'});
const shutdown=async()=>{await app.close();await pool.end();};
process.on('SIGTERM',()=>{void shutdown().then(()=>process.exit(0));});
process.on('SIGINT',()=>{void shutdown().then(()=>process.exit(0));});
try {await app.listen({port,host:'0.0.0.0'});}
catch(error){app.log.error(error);await shutdown();process.exitCode=1;}
