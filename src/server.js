// Ex-Files server.
// Serves:
//   POST /ussd        -> Africa's Talking USSD webhook (feature-phone flow)
//   POST /api/redflag -> JSON Red Flag Index (for the web demo)
//   POST /api/vibe    -> JSON Vibe Score between two profiles
//   GET  /            -> the web prototype (public/index.html)

import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { handleUssd } from './ussd.js';
import { redFlagIndex, vibeScore, typeBeat, REFERENCE_QUESTIONS } from './matcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.urlencoded({ extended: false })); // AT posts form-encoded
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

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

app.get('/health', (_req, res) => res.json({ ok: true, app: 'ex-files', goat: '🐐' }));

const PORT = process.env.PORT || 3000;
// Only listen when run directly, so tests can import without opening a port.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`💘 Ex-Files running on http://localhost:${PORT}`);
    console.log(`   USSD webhook:  POST /ussd`);
    console.log(`   Web demo:      GET  /`);
  });
}

export default app;
