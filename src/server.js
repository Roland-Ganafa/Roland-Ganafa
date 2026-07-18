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
import { voiceClientFromEnv, goatVoiceXml, goatDigitsResponseXml } from './voice.js';
import { ProfileVault, MatchGate } from './gating.js';
import { TalkingStageClock, WEEK_MS, defaultPlan } from './talkingStage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load a local .env if present (Node 20.12+ built-in — no dependency).
// .env holds secrets (AT_API_KEY etc.) and is git-ignored; never commit it.
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // No .env file — that's fine, we fall back to dry-run mode.
}

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

// --- Photo & location gating wiring ---
// Private profile data lives in the vault; the gate decides what each viewer is
// allowed to see. Nothing is revealed until a mutual match (photo) or a mutual
// match plus a double opt-in (location, always coarse).
const vault = new ProfileVault();
const gate = new MatchGate();

// --- Talking-Stage Clock wiring ---
// Each match has a shelf life. At the halfway mark the app auto-proposes a
// tiny coffee date; by the deadline with no plan, the match expires. Default
// is a week; override with TALKING_STAGE_MS (e.g. 120000 for a 2-minute demo).
const stageMs = Number(process.env.TALKING_STAGE_MS) || WEEK_MS;
const talkingStage = new TalkingStageClock({ stageMs });

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
  // Accept `crush` (current wording); fall back to `ex` for older clients.
  const { self = {}, crush, ex = {} } = req.body || {};
  const other = crush || ex;
  const result = redFlagIndex(self, other);
  result.typeBeat = typeBeat(self, other);
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
    gate.register(match.id, match.participants); // start with everything gated
    talkingStage.register(match.id, match.participants, match.createdAt); // start the clock
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

// Place a single goat call to one number on demand (phone-friendly demo).
// In dry-run mode this just logs; with AT credentials it dials for real.
app.post('/api/testcall', async (req, res) => {
  const { to } = req.body || {};
  if (!to) return res.status(400).json({ error: 'Provide a phone number as "to".' });
  try {
    const result = await voiceClient.call(to);
    res.json({ ok: true, to, live: voiceClient.constructor.name !== 'DryRunVoiceClient', result });
  } catch (err) {
    res.status(502).json({ ok: false, to, error: String(err.message || err) });
  }
});

// --- Africa's Talking Voice callback ---
// AT hits this when a goat call connects. The flow (all on this one URL):
//   1. First request (isActive=1, no digits) -> play the goat + GetDigits menu.
//   2. Callee presses a key -> AT re-POSTs here with dtmfDigits -> respond.
//   3. Call ends -> AT POSTs isActive=0 -> we just acknowledge (empty body).
app.post('/voice', (req, res) => {
  res.set('Content-Type', 'application/xml');
  const body = req.body || {};
  // Call finished notification: no XML expected, just 200 OK.
  if (String(body.isActive) === '0') {
    return res.send('');
  }
  // The callee pressed a key: respond to their choice.
  if (body.dtmfDigits) {
    return res.send(goatDigitsResponseXml(String(body.dtmfDigits)));
  }
  // Fresh connect: play the goat and offer the menu. Tell AT to post the
  // pressed key back to this same absolute URL.
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const callbackUrl = req.headers.host ? `${proto}://${req.headers.host}/voice` : undefined;
  res.send(goatVoiceXml(GOAT_AUDIO_URL, callbackUrl));
});

// --- Photo & location gating APIs ---

// Store a person's private profile (photo + location live only in the vault).
app.post('/api/profile', (req, res) => {
  const { phone, displayName, photoUrl, area, lat, lng } = req.body || {};
  try {
    const saved = vault.setProfile(phone, { displayName, photoUrl, area, lat, lng });
    // Never echo the raw private fields back.
    res.status(201).json({ phone, displayName: saved.displayName, hasPhoto: Boolean(saved.photoUrl), hasLocation: Boolean(saved.area || (saved.lat != null && saved.lng != null)) });
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// Like the other person in a match. Returns whether it's now mutual.
app.post('/api/like', (req, res) => {
  const { matchId, phone } = req.body || {};
  try {
    res.json(gate.like(matchId, phone));
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// Opt in / out of sharing location (only ever revealed coarsely, and only when
// both people have opted in).
app.post('/api/consent/location', (req, res) => {
  const { matchId, phone, grant = true } = req.body || {};
  try {
    res.json(gate.setLocationConsent(matchId, phone, grant));
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// Hide or re-share your own photo, even after a mutual match.
app.post('/api/consent/photo', (req, res) => {
  const { matchId, phone, shared = true } = req.body || {};
  try {
    res.json(gate.setPhotoShared(matchId, phone, shared));
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// Block a match: hides everything, both directions, and breaks the mutual.
app.post('/api/block', (req, res) => {
  const { matchId, phone } = req.body || {};
  try {
    res.json(gate.block(matchId, phone));
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// The gated view: what `viewer` is allowed to see about the other participant.
app.get('/api/view', (req, res) => {
  const { matchId, viewer } = req.query || {};
  try {
    res.json(gate.viewFor(matchId, viewer, vault));
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// --- Talking-Stage Clock APIs ---

// Inspect the lifecycle of every match: phase, time left, current plan.
app.get('/api/stage', (_req, res) => {
  const now = Date.now();
  res.json({
    stageMs,
    nudgeAt: talkingStage.nudgeAt,
    matches: talkingStage.list().map((m) => ({
      id: m.id,
      participants: m.participants,
      status: m.status,
      phase: talkingStage.phaseOf(m, now),
      elapsedMs: talkingStage.elapsed(m, now),
      timeLeftMs: talkingStage.timeLeft(m, now),
      proposal: m.proposal,
      acceptedBy: m.acceptedBy,
    })),
  });
});

// A participant proposes a concrete plan (defaults to the tiny coffee plan).
app.post('/api/propose', (req, res) => {
  const { matchId, by, plan } = req.body || {};
  try {
    res.json(talkingStage.propose(matchId, by, plan || defaultPlan()));
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// The other participant accepts the plan; both yeses set the date.
app.post('/api/accept', (req, res) => {
  const { matchId, phone } = req.body || {};
  try {
    res.json(talkingStage.accept(matchId, phone));
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// Run the clock once on demand (so the demo doesn't wait for the interval).
app.post('/api/stage/tick', async (_req, res) => {
  const events = await talkingStage.tick();
  res.json({ events });
});

app.get('/health', (_req, res) => res.json({ ok: true, app: 'ex-files', goat: '🐐' }));

const PORT = process.env.PORT || 3000;
// Only listen when run directly, so tests can import without opening a port.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    silenceTimer.start();
    talkingStage.start(Math.min(15_000, Math.max(1000, Math.round(stageMs / 8)))); // finer ticks for short demos
    const mode = voiceClient.constructor.name === 'DryRunVoiceClient' ? 'dry-run 🐐' : 'live AT Voice';
    console.log(`💘 Ex-Files running on http://localhost:${PORT}`);
    console.log(`   USSD webhook:   POST /ussd`);
    console.log(`   Silence timer:  every ${silenceTimer.checkIntervalMs / 1000}s, threshold ${silenceMs / 1000}s (${mode})`);
    console.log(`   Talking stage:  deadline ${Math.round(stageMs / 1000)}s, nudge at ${Math.round(talkingStage.nudgeAt / 1000)}s`);
    console.log(`   Web demo:       GET  /`);
  });
}

export default app;
