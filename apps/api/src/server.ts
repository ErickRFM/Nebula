import { Pool } from 'pg';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const port = Number(process.env.API_PORT ?? '4000');
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('Configure DATABASE_URL.');
const config = loadConfig();
const pool = new Pool({ connectionString: dbUrl, max: 10 });
const app = await buildApp({ pool, config });
const shutdown = async () => {
  await app.close();
  await pool.end();
};
process.on('SIGTERM', () => {
  void shutdown().then(() => process.exit(0));
});
process.on('SIGINT', () => {
  void shutdown().then(() => process.exit(0));
});
try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  await shutdown();
  process.exitCode = 1;
}
