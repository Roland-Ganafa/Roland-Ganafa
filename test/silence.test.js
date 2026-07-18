import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchStore, SilenceTimer, DAY_MS } from '../src/silenceTimer.js';
import { goatVoiceXml, goatDigitsResponseXml, DryRunVoiceClient } from '../src/voice.js';

test('match store: creating a match starts the silence clock', () => {
  const store = new MatchStore();
  const m = store.createMatch('+256700000001', '+256700000002', 1000);
  assert.equal(m.lastActivityAt, 1000);
  assert.equal(m.goatSentAt, null);
  assert.equal(store.silenceFor(m, 5000), 4000);
});

test('match store: you cannot match with yourself', () => {
  const store = new MatchStore();
  assert.throws(() => store.createMatch('+256700', '+256700'), /yourself/);
});

test('silence timer: fires the goat to BOTH people after the threshold', async () => {
  const store = new MatchStore();
  const voice = new DryRunVoiceClient();
  const m = store.createMatch('+256700000001', '+256700000002', 0);
  const timer = new SilenceTimer({ store, voiceClient: voice, silenceMs: DAY_MS });

  // Just before the threshold: no goat.
  let out = await timer.tick(DAY_MS - 1);
  assert.equal(out.length, 0);
  assert.equal(voice.calls.length, 0);

  // At the threshold: goat calls both participants exactly once.
  out = await timer.tick(DAY_MS);
  assert.equal(out.length, 1);
  assert.equal(voice.calls.length, 2);
  assert.deepEqual(voice.calls.map((c) => c.to).sort(), ['+256700000001', '+256700000002']);
  assert.ok(store.get(m.id).goatSentAt);
});

test('silence timer: does not double-goat a still-silent match', async () => {
  const store = new MatchStore();
  const voice = new DryRunVoiceClient();
  store.createMatch('+256700000001', '+256700000002', 0);
  const timer = new SilenceTimer({ store, voiceClient: voice, silenceMs: DAY_MS });

  await timer.tick(DAY_MS);
  await timer.tick(DAY_MS + 5000); // still silent, already goated
  assert.equal(voice.calls.length, 2, 'goat should not fire twice for one silence');
});

test('silence timer: activity re-arms the goat for a future silence', async () => {
  const store = new MatchStore();
  const voice = new DryRunVoiceClient();
  const m = store.createMatch('+256700000001', '+256700000002', 0);
  const timer = new SilenceTimer({ store, voiceClient: voice, silenceMs: DAY_MS });

  await timer.tick(DAY_MS); // first goat (2 calls)
  store.recordActivity(m.id, DAY_MS + 1); // someone finally texted back
  assert.equal(store.get(m.id).goatSentAt, null, 're-armed');

  await timer.tick(2 * DAY_MS + 2); // silent again -> goat again (2 more calls)
  assert.equal(voice.calls.length, 4);
});

test('goat XML: plays an audio url when configured', () => {
  const xml = goatVoiceXml('https://example.com/goat.mp3');
  assert.match(xml, /<Play url="https:\/\/example\.com\/goat\.mp3"\/>/);
  assert.match(xml, /wellness check/);
});

test('goat XML: falls back to a spoken goat when no url', () => {
  const xml = goatVoiceXml();
  assert.match(xml, /Maaa/);
  assert.doesNotMatch(xml, /<Play/);
});

test('goat XML: escapes ampersands in the audio url', () => {
  const xml = goatVoiceXml('https://x.io/g.mp3?a=1&b=2');
  assert.match(xml, /a=1&amp;b=2/);
  assert.doesNotMatch(xml, /a=1&b=2/);
});

test('goat XML: wraps the prompt in a GetDigits menu (AT call action)', () => {
  const xml = goatVoiceXml();
  assert.match(xml, /<Response>/);
  assert.match(xml, /<GetDigits[^>]*numDigits="1"[^>]*>/);
  assert.match(xml, /Press 1 to text your match/);
  assert.match(xml, /<\/GetDigits>/);
});

test('goat digits response: 1 nudges the match', () => {
  const xml = goatDigitsResponseXml('1');
  assert.match(xml, /nudged your match/);
  assert.doesNotMatch(xml, /disappointed/);
});

test('goat digits response: 2 shames with a goat', () => {
  const xml = goatDigitsResponseXml('2');
  assert.match(xml, /disappointed/);
  assert.match(xml, /Maaaa/);
});

test('goat digits response: anything else is a confused goat', () => {
  const xml = goatDigitsResponseXml('9');
  assert.match(xml, /confused/);
});
