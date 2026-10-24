import test from 'node:test';
import assert from 'node:assert/strict';
import { generateActivationCode, hashCode, safeEqualStrings } from '../src/security.js';

test('activation codes follow expected format and have 160-bit source entropy', () => {
  const a = generateActivationCode(); const b = generateActivationCode();
  assert.match(a, /^[A-F0-9]{5}(-[A-F0-9]{5}){7}$/);
  assert.notEqual(a, b);
});
test('hashes are stable SHA-256 hex and distinguish different inputs', () => {
  assert.equal(hashCode('ABC'), hashCode('ABC'));
  assert.notEqual(hashCode('ABC'), hashCode('ABD'));
  assert.match(hashCode('ABC'), /^[a-f0-9]{64}$/);
});
test('safeEqualStrings compares equal and unequal values', () => {
  assert.equal(safeEqualStrings('same', 'same'), true);
  assert.equal(safeEqualStrings('same', 'diff'), false);
  assert.equal(safeEqualStrings('a', 'longer'), false);
});
