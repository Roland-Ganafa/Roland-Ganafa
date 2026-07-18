import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synthGoatWav, fetchGoatAudio, resolveGoatAudio } from '../src/goatSound.js';

test('synthGoatWav returns a valid WAV buffer', () => {
  const buf = synthGoatWav();
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 44, 'has header + samples');
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WAVE');
});

// A tiny fake fetch so we do not touch the network.
function fakeFetch({ ok = true, contentType = 'audio/mpeg', body = Buffer.from([1, 2, 3]) }) {
  return async () => ({
    ok,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? contentType : null) },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  });
}

test('fetchGoatAudio returns bytes for an audio response', async () => {
  const got = await fetchGoatAudio('https://x/y.mp3', fakeFetch({ contentType: 'audio/mpeg' }));
  assert.ok(got);
  assert.equal(got.contentType, 'audio/mpeg');
  assert.ok(Buffer.isBuffer(got.buffer));
});

test('fetchGoatAudio rejects a non-audio response (e.g. an HTML page)', async () => {
  const got = await fetchGoatAudio('https://page/', fakeFetch({ contentType: 'text/html' }));
  assert.equal(got, null);
});

test('fetchGoatAudio returns null with no source url', async () => {
  assert.equal(await fetchGoatAudio(''), null);
});

test('resolveGoatAudio falls back to the synth bleat when upstream is unusable', async () => {
  const audio = await resolveGoatAudio('https://page/', fakeFetch({ ok: false }));
  assert.equal(audio.contentType, 'audio/wav');
  assert.equal(audio.buffer.toString('ascii', 0, 4), 'RIFF');
});

test('resolveGoatAudio uses the upstream file when it is real audio', async () => {
  const audio = await resolveGoatAudio('https://x/y.mp3', fakeFetch({ contentType: 'audio/mpeg', body: Buffer.from([9, 9]) }));
  assert.equal(audio.contentType, 'audio/mpeg');
});
