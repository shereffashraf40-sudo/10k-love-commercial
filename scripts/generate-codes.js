import { pool, withTransaction } from '../src/db.js';
import { generateActivationCode, hashCode } from '../src/security.js';
function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 ? Number(process.argv[i + 1]) : fallback; }
const from = arg('--from', 1), to = arg('--to', 10000);
if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 10000 || from > to) {
  console.error('Usage: npm run codes:generate -- --from 1 --to 10000'); process.exitCode = 2;
} else {
  try {
    const generated = [];
    await withTransaction(async client => {
      for (let squareId = from; squareId <= to; squareId++) {
        await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [String(7300000000 + squareId)]);
        const existing = await client.query(`SELECT 1 FROM public.activation_codes WHERE square_id=$1 AND is_used=false AND is_revoked=false`, [squareId]);
        if (existing.rowCount) continue;
        let inserted = false;
        for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
          const code = generateActivationCode();
          const result = await client.query(`INSERT INTO public.activation_codes(square_id,code_hash,code_hint)
            VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`, [squareId, hashCode(code), code.slice(-8)]);
          if (result.rowCount) { generated.push(`${squareId},${code}`); inserted = true; }
        }
        if (!inserted) throw new Error(`Could not generate a unique code for square ${squareId}`);
      }
    });
    for (const line of generated) console.log(line);
  } catch (err) { console.error('Code generation failed:', err.message); process.exitCode = 1; }
  finally { await pool.end(); }
}
