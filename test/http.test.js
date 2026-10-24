import test from 'node:test';
import assert from 'node:assert/strict';

// Lightweight validation contract tests; no database or web server required.
test('expected project constraints are documented in migration', async () => {
  const fs = await import('node:fs/promises');
  const sql = await fs.readFile(new URL('../db/migrations/001_initial.sql', import.meta.url), 'utf8');
  assert.match(sql, /generate_series\(1, 10000\)/i);
  assert.match(sql, /WHERE is_used = false AND is_revoked = false/i);
  assert.match(sql, /char_length\(btrim\(name\)\) BETWEEN 1 AND 50/i);
  assert.match(sql, /char_length\(btrim\(story\)\) BETWEEN 1 AND 250/i);
  assert.match(sql, /code_hash char\(64\) NOT NULL UNIQUE/i);
});
