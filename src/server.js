import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
const server = app.listen(config.port, () => console.log(`10k Love Stories listening on port ${config.port}`));
async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
