import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redFlagIndex, vibeScore } from '../src/matcher.js';
import { handleUssd } from '../src/ussd.js';

test('red flag index: saint who dated a saint scores low', () => {
  const self = { available: true, replies: true, plans: true, closure: true, redflags: false };
  const ex = { available: true, replies: true, plans: true, closure: true, redflags: false };
  const r = redFlagIndex(self, ex);
  assert.equal(r.score, 0);
  assert.equal(r.band, 'Green');
});

test('red flag index: "zero red flags" self-claim is taxed', () => {
  const self = { available: true, replies: true, plans: true, closure: true, redflags: true };
  const ex = { available: true, replies: true, plans: true, closure: true, redflags: false };
  const r = redFlagIndex(self, ex);
  assert.equal(r.score, 25);
  assert.ok(r.flags.some((f) => f.includes('zero red flags')));
});

test('red flag index: burning your ex on everything caps sensibly', () => {
  const self = { available: false, replies: false, plans: false, closure: false, redflags: true };
  const ex = { available: false, replies: false, plans: false, closure: false, redflags: false };
  const r = redFlagIndex(self, ex);
  assert.ok(r.score >= 75);
  assert.ok(r.score <= 100);
});

test('vibe score: two mutually unavailable people bond over it', () => {
  const a = { name: 'A', answers: { available: false, replies: true, plans: true, closure: true, redflags: false } };
  const b = { name: 'B', answers: { available: false, replies: true, plans: true, closure: true, redflags: false } };
  const r = vibeScore(a, b);
  assert.ok(r.notes.some((n) => n.includes('Mutually unavailable')));
  assert.ok(r.score >= 60);
});

test('ussd: empty text shows the main menu', () => {
  const out = handleUssd('');
  assert.ok(out.startsWith('CON'));
  assert.ok(out.includes('Red Flag Index'));
});

test('ussd: mid-flow keeps the session open with a yes/no prompt', () => {
  // chose 1, then answered first self question yes
  const out = handleUssd('1*1');
  assert.ok(out.startsWith('CON'));
  assert.ok(out.includes('1. Yes'));
});

test('ussd: all 10 answers ends the session with a score', () => {
  const answers = '1*' + Array(10).fill('2').join('*'); // menu 1, then ten "No"s
  const out = handleUssd(answers);
  assert.ok(out.startsWith('END'));
  assert.ok(out.includes('Red Flag Index:'));
});
