import crypto from 'node:crypto';

export function hashCode(code) {
  return crypto.createHash('sha256').update(code, 'utf8').digest('hex');
}
export function generateActivationCode() {
  const raw = crypto.randomBytes(20).toString('hex').toUpperCase(); // 160 bits
  return raw.match(/.{1,5}/g).join('-');
}
export function safeEqualStrings(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
export function csrfToken() { return crypto.randomBytes(32).toString('hex'); }
