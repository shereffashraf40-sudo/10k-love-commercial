import { withTransaction, pool } from './db.js';
import { hashCode, generateActivationCode } from './security.js';

export class AppError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export async function listSquares({ limit = 100, offset = 0, publishedOnly = false } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const query = publishedOnly
    ? `SELECT c.square_id, s.name, s.story, s.created_at, (s.square_id IS NOT NULL) AS is_published
       FROM public.squares_catalog c JOIN public.squares s USING (square_id)
       ORDER BY c.square_id LIMIT $1 OFFSET $2`
    : `SELECT c.square_id, s.name, s.story, s.created_at, (s.square_id IS NOT NULL) AS is_published
       FROM public.squares_catalog c LEFT JOIN public.squares s USING (square_id)
       ORDER BY c.square_id LIMIT $1 OFFSET $2`;
  const { rows } = await pool.query(query, [safeLimit, safeOffset]);
  return rows;
}
export async function getSquare(squareId) {
  const { rows } = await pool.query('SELECT square_id, name, story, created_at FROM public.squares WHERE square_id = $1', [squareId]);
  return rows[0] ?? null;
}

export async function publishSquare({ squareId, code, name, story }) {
  const codeHash = hashCode(code);
  return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [String(7300000000 + squareId)]);
    const { rows: codeRows } = await client.query(`
      SELECT id FROM public.activation_codes
      WHERE square_id = $1 AND code_hash = $2 AND is_used = false AND is_revoked = false
      FOR UPDATE`, [squareId, codeHash]);
    if (!codeRows.length) throw new AppError(400, 'INVALID_CODE', 'كود التفعيل غير صحيح أو مستخدم أو ملغي.');

    const { rows: existing } = await client.query('SELECT 1 FROM public.squares WHERE square_id = $1 FOR UPDATE', [squareId]);
    if (existing.length) throw new AppError(409, 'SQUARE_PUBLISHED', 'المربع ده تم نشر قصته بالفعل.');

    await client.query('INSERT INTO public.squares(square_id, name, story) VALUES ($1, $2, $3)', [squareId, name, story]);
    const consumed = await client.query(`UPDATE public.activation_codes SET is_used = true, used_at = now()
      WHERE id = $1 AND is_used = false AND is_revoked = false`, [codeRows[0].id]);
    if (consumed.rowCount !== 1) throw new AppError(409, 'CODE_RACE', 'تعذر إتمام التفعيل؛ حاول مرة أخرى.');
    await client.query(`INSERT INTO public.admin_audit_log(event_type, square_id, actor, details)
      VALUES ('square_published', $1, 'public', jsonb_build_object('activation_code_id', $2::text))`, [squareId, codeRows[0].id]);
    return { squareId };
  });
}

export async function issueOrReplaceCode(squareId, actor = 'admin') {
  return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [String(7300000000 + squareId)]);
    const { rows: published } = await client.query('SELECT 1 FROM public.squares WHERE square_id = $1 FOR UPDATE', [squareId]);
    if (published.length) throw new AppError(409, 'SQUARE_PUBLISHED', 'لا يمكن إصدار كود لمربع تم نشر قصته بالفعل.');

    await client.query(`UPDATE public.activation_codes SET is_revoked = true
      WHERE square_id = $1 AND is_used = false AND is_revoked = false`, [squareId]);

    let plainCode;
    for (let attempt = 0; attempt < 3; attempt++) {
      plainCode = generateActivationCode();
      const inserted = await client.query(`INSERT INTO public.activation_codes(square_id, code_hash, code_hint)
        VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id`,
        [squareId, hashCode(plainCode), plainCode.slice(-8)]);
      if (inserted.rowCount === 1) break;
      if (attempt === 2) throw new Error('Could not generate a unique activation code');
    }
    await client.query(`INSERT INTO public.admin_audit_log(event_type, square_id, actor, details)
      VALUES ('activation_code_issued', $1, $2, jsonb_build_object('code_hint', $3::text))`, [squareId, actor, plainCode.slice(-8)]);
    return { squareId, code: plainCode };
  });
}

export async function listAdminCodes(limit = 200) {
  const { rows } = await pool.query(`SELECT id, square_id, code_hint, is_used, is_revoked, created_at, used_at
    FROM public.activation_codes ORDER BY id DESC LIMIT $1`, [Math.min(200, Math.max(1, Number(limit) || 200))]);
  return rows;
}
export async function countPublished() {
  const { rows } = await pool.query('SELECT count(*)::int AS count FROM public.squares');
  return rows[0].count;
}
