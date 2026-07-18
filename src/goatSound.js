// Goat sound served from our own domain so Africa's Talking can <Play> it
// reliably (no hotlink/referer/CORS surprises, and always a valid audio
// content-type). Two sources, in order:
//
//   1. If GOAT_SOURCE_URL points at a real audio file, we proxy those bytes.
//   2. Otherwise (or if that fetch fails / isn't audio) we synthesize a short
//      goat bleat as a WAV — so the call ALWAYS gets playable audio.
//
// The page URL https://orangefreesounds.com/goat-call-sound-effect/ is an HTML
// page, not an audio file, so it can't be played directly — set GOAT_SOURCE_URL
// to the page's *Download* link (ending in .mp3) to use that exact recording.

/** Encode mono 16-bit PCM samples (-1..1) into a WAV Buffer. */
function encodeWav(samples, sampleRate) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

/**
 * Synthesize a short, comedic goat "maaaa" bleat as an 8kHz mono WAV.
 * A buzzy tone with a fast tremolo flutter and a downward pitch glide.
 * @returns {Buffer} WAV bytes
 */
export function synthGoatWav() {
  const sr = 8000;
  const dur = 1.3;
  const n = Math.floor(sr * dur);
  const samples = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 430 - 70 * (t / dur); // pitch glides down
    const tremolo = 0.55 + 0.45 * Math.sin(2 * Math.PI * 22 * t); // the "aaa-aaa" flutter
    const attack = Math.min(1, t / 0.03);
    const release = Math.max(0, 1 - t / dur);
    const env = attack * release;
    const tone =
      Math.sin(2 * Math.PI * f * t) +
      0.4 * Math.sin(2 * Math.PI * 2 * f * t) +
      0.2 * Math.sin(2 * Math.PI * 3 * f * t);
    const noise = (Math.random() * 2 - 1) * 0.05;
    samples[i] = 0.6 * env * tremolo * (tone / 1.6) + noise * env;
  }
  return encodeWav(samples, sr);
}

/**
 * Fetch an upstream audio file, but only accept a real audio response.
 * @returns {Promise<{buffer:Buffer, contentType:string}|null>} null if unusable
 */
export async function fetchGoatAudio(sourceUrl, fetchImpl = globalThis.fetch) {
  if (!sourceUrl) return null;
  try {
    const res = await fetchImpl(sourceUrl, { redirect: 'follow' });
    const ct = (res.headers.get && res.headers.get('content-type')) || '';
    if (!res.ok || !/^audio\//i.test(ct)) return null; // not a playable audio file
    const ab = await res.arrayBuffer();
    return { buffer: Buffer.from(ab), contentType: ct };
  } catch {
    return null;
  }
}

/**
 * Resolve the goat audio to serve, preferring a real upstream file and falling
 * back to the synthesized bleat. Result is shaped for an Express response.
 */
export async function resolveGoatAudio(sourceUrl, fetchImpl) {
  const remote = await fetchGoatAudio(sourceUrl, fetchImpl);
  if (remote) return remote;
  return { buffer: synthGoatWav(), contentType: 'audio/wav' };
}
