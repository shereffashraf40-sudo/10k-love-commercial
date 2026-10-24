import test from 'node:test';
import assert from 'node:assert/strict';

const testDbUrl = process.env.TEST_DATABASE_URL;
test('PostgreSQL activation, one-time consumption, and same-square concurrency', { skip: !testDbUrl }, async t => {
  // Guard against accidentally truncating a production database.
  process.env.DATABASE_URL = testDbUrl;
  process.env.SESSION_SECRET ||= 'test-only-session-secret-that-is-at-least-32-characters';
  process.env.ADMIN_PASSWORD ||= 'test-only-admin-password-please-change';
  const pg = await import('pg');
  const check = new pg.default.Client({ connectionString: testDbUrl });
  await check.connect();
  let dbName;
  try { const r = await check.query('SELECT current_database() AS name'); dbName = r.rows[0].name; }
  finally { await check.end(); }
  assert.match(dbName, /(test|spec|ci)/i, 'TEST_DATABASE_URL must point to a database whose name includes test/spec/ci');

  const { pool } = await import('../src/db.js');
  const { issueOrReplaceCode, publishSquare, AppError } = await import('../src/services.js');
  // This truncates only the explicitly named disposable test DB.
  await pool.query('TRUNCATE public.squares, public.activation_codes, public.admin_audit_log RESTART IDENTITY CASCADE');
  t.after(async () => { await pool.end(); });

  const issued = await issueOrReplaceCode(9999, 'integration-test');
  assert.equal((await publishSquare({ squareId: 9999, code: issued.code, name: 'اسم تجريبي', story: 'قصة اختبار' })).squareId, 9999);
  await assert.rejects(() => publishSquare({ squareId: 9999, code: issued.code, name: 'اسم', story: 'قصة' }),
    err => err instanceof AppError && ['INVALID_CODE', 'SQUARE_PUBLISHED'].includes(err.code));
  await assert.rejects(() => publishSquare({ squareId: 9998, code: issued.code, name: 'اسم', story: 'قصة' }),
    err => err instanceof AppError && err.code === 'INVALID_CODE');

  const concurrent = await issueOrReplaceCode(9998, 'integration-test');
  const attempts = await Promise.allSettled([
    publishSquare({ squareId: 9998, code: concurrent.code, name: 'أ', story: 'قصة أ' }),
    publishSquare({ squareId: 9998, code: concurrent.code, name: 'ب', story: 'قصة ب' })
  ]);
  assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(x => x.status === 'rejected').length, 1);
});
