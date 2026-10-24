import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';
const here = path.dirname(fileURLToPath(import.meta.url));
try {
  const sql = await fs.readFile(path.join(here, '../db/migrations/001_initial.sql'), 'utf8');
  await pool.query(sql);
  console.log('Migration query completed. This is not a security certification.');
} catch (err) {
  console.error('Migration failed:', err.message); process.exitCode = 1;
} finally { await pool.end(); }
