// Ex-Files server.
// Serves:
//   POST /ussd         -> Africa's Talking USSD webhook (feature-phone flow)
//   POST /api/redflag  -> JSON Red Flag Index (for the web demo)
//   POST /api/vibe     -> JSON Vibe Score between two profiles
//   POST /api/match    -> create a match between two phone numbers
//   POST /api/message  -> record activity in a match (resets the silence clock)
//   GET  /api/matches  -> inspect match + silence state
//   POST /api/tick     -> run the Awkward Silence Timer once (demo helper)
//   POST /voice        -> AT Voice callback: returns the goat XML
//   GET  /             -> the web prototype (public/index.html)

import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { handleUssd } from './ussd.js';
import { redFlagIndex, vibeScore, typeBeat, REFERENCE_QUESTIONS } from './matcher.js';
import { MatchStore, SilenceTimer, DAY_MS } from './silenceTimer.js';
import { voiceClientFromEnv, goatVoiceXml } from './voice.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.urlencoded({ extended: false })); // AT posts form-encoded
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Awkward Silence Timer wiring ---
// Threshold defaults to 24h; override with SILENCE_MS (handy for a live demo,
// e.g. SILENCE_MS=8000 to make the goat call after 8 seconds of silence).
const store = new MatchStore();
const voiceClient = voiceClientFromEnv();
const silenceMs = Number(process.env.SILENCE_MS) || DAY_MS;
const silenceTimer = new SilenceTimer({ store, voiceClient, silenceMs });
const GOAT_AUDIO_URL = process.env.GOAT_AUDIO_URL; // optional mp3 of a screaming goat

// --- Africa's Talking USSD webhook ---
app.post('/ussd', (req, res) => {
  const text = (req.body && req.body.text) || '';
  const response = handleUssd(text);
  res.set('Content-Type', 'text/plain');
  res.send(response);
});

// --- Web demo APIs ---
app.get('/api/questions', (_req, res) => {
  res.json(REFERENCE_QUESTIONS);
});

app.post('/api/redflag', (req, res) => {
  const { self = {}, ex = {} } = req.body || {};
  const result = redFlagIndex(self, ex);
  result.typeBeat = typeBeat(self, ex);
  res.json(result);
});

app.post('/api/vibe', (req, res) => {
  const { a, b } = req.body || {};
  if (!a || !b) return res.status(400).json({ error: 'Send two profiles: a and b.' });
  res.json(vibeScore(a, b));
});

// --- Awkward Silence Timer APIs ---

// Create a match between two phone numbers. Matching counts as activity, so the
// silence clock starts now.
app.post('/api/match', (req, res) => {
  const { phoneA, phoneB } = req.body || {};
  try {
    const match = store.createMatch(phoneA, phoneB);
    res.status(201).json(match);
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// Record a message / any activity in a match. Resets silence and re-arms the goat.
app.post('/api/message', (req, res) => {
  const { matchId } = req.body || {};
  try {
    const match = store.recordActivity(matchId);
    res.json(match);
  } catch (err) {
    res.status(404).json({ error: String(err.message || err) });
  }
});

// Inspect matches and how long each has been silent.
app.get('/api/matches', (_req, res) => {
  const now = Date.now();
  res.json({
    silenceMs,
    goatCallsPlaced: voiceClient.calls ? voiceClient.calls.length : undefined,
    matches: store.list().map((m) => ({
      ...m,
      silentMs: store.silenceFor(m, now),
      silentEnough: store.silenceFor(m, now) >= silenceMs,
    })),
  });
});

// Run the timer once on demand (so the stage demo doesn't wait for the interval).
app.post('/api/tick', async (_req, res) => {
  const dispatched = await silenceTimer.tick();
  res.json({ dispatched });
});

// --- Africa's Talking Voice callback ---
// AT hits this when a goat call connects; we return XML telling it to play the
// goat. Same endpoint for both participants — everyone hears the same goat.
app.post('/voice', (_req, res) => {
  res.set('Content-Type', 'application/xml');
  res.send(goatVoiceXml(GOAT_AUDIO_URL));
});

app.get('/health', (_req, res) => res.json({ ok: true, app: 'ex-files', goat: '🐐' }));

const PORT = process.env.PORT || 3000;
// Only listen when run directly, so tests can import without opening a port.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    silenceTimer.start();
    const mode = voiceClient.constructor.name === 'DryRunVoiceClient' ? 'dry-run 🐐' : 'live AT Voice';
    console.log(`💘 Ex-Files running on http://localhost:${PORT}`);
    console.log(`   USSD webhook:   POST /ussd`);
    console.log(`   Silence timer:  every ${silenceTimer.checkIntervalMs / 1000}s, threshold ${silenceMs / 1000}s (${mode})`);
    console.log(`   Web demo:       GET  /`);
  });
}

export default app;
