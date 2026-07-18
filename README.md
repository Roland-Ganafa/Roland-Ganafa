# Ex-Files 💘

**The dating app that verifies vibes before feelings.**

Built for the **Africa's Talking Community Uganda — Open Hackathon**
_"Reimagining Dating & Social Networks through Technology"_ · Kampala · Jul 18, 2026 · `#WeLoveNerds` 🇺🇬

---

## The pitch

Modern dating is two strangers lying about their gym schedule until one of them
cries in a Bolt. Ex-Files fixes this with **technology** and a **light,
consensual amount of emotional damage.**

You can't send a first message. You first pass the **Ex-Files Reference Check**:
answer five questions about **yourself**, then the same five about your **current
crush**. The gap between the two is where the truth lives — and it becomes
your **Red Flag Index™**.

The whole thing runs over **USSD** (`*256#`-style), so it works on any feature
phone with no data — which is exactly what makes it inclusive. Africa's Talking
is literally hosting the hackathon, so the SDK is right there. 🐐

## Why it fits the brief

The flyer asks for solutions that help people *connect, build relationships, and
engage meaningfully while ensuring safety, privacy, trust, and inclusivity.*

| Rubric item | How Ex-Files scores |
|---|---|
| **Connect / relationships** | Compatibility-first: no chat until both sides pass the check |
| **Safety** | No photos or location until a mutual, verified match |
| **Privacy** | USSD flow stores answers, not identities; nothing shared without consent |
| **Trust** | The Reference Check surfaces honesty gaps up front |
| **Inclusivity** | Full experience on feature phones via USSD — no smartphone or data required |

## What's in the box

- **`src/matcher.js`** — the Red Flag Index, the Vibe Score, and the Type Beat
  Detector. Pure functions, fully tested.
- **`src/ussd.js`** — the Africa's Talking USSD state machine (feature-phone flow).
- **`src/silenceTimer.js`** — the Awkward Silence Timer: watches every match and
  fires the goat after 24h of silence. Injectable clock + voice client.
- **`src/voice.js`** — Africa's Talking Voice integration: places the outbound
  goat call and builds the callback XML. Dry-run client when there are no
  credentials.
- **`src/gating.js`** — photo & location gating: a private `ProfileVault` and a
  `MatchGate` that reveals nothing until a mutual match (photo) or a mutual
  match plus a double opt-in (location, always coarse).
- **`src/server.js`** — Express server: USSD webhook + JSON APIs + Voice callback
  + web demo.
- **`public/index.html`** — a styled web prototype (Red Flag Index + a live
  Awkward Silence Timer demo) for the stage.

## The Awkward Silence Timer 🐐

Every match carries a `lastActivityAt`. If two matched people go quiet longer
than the threshold (24h in production), the timer places an **Africa's Talking
Voice** call to **both** of them that plays the **same goat scream**.
Conversation resumes immediately, out of sheer confusion.

- Threshold is configurable with `SILENCE_MS` (e.g. `SILENCE_MS=8000` fires the
  goat after 8 seconds — perfect for a live demo).
- No AT credentials? It runs in **dry-run** mode and logs the goat calls it would
  place, so the whole feature demos with zero secrets.
- The goat calls come from the Africa's Talking voice number **+256200600600**
  by default (override with `AT_VOICE_NUMBER`). Placing real calls still requires
  `AT_USERNAME` + `AT_API_KEY`. Set `GOAT_AUDIO_URL` to an mp3 of a screaming
  goat; otherwise the call falls back to a spoken goat. See `.env.example`.
- The `/voice` callback is a proper interactive IVR built on the documented
  [AT Voice call actions](https://developers.africastalking.com/docs/voice/actions/call_actions):
  it plays the goat inside a **`GetDigits`** menu — *press 1 to text your match,
  2 to hang up in shame*. AT posts the pressed key back to the same `/voice`
  URL, which replies with the follow-up action; the call-ended ping (`isActive=0`)
  is acknowledged with an empty body.

```bash
# Demo it: goat fires 8s after a match goes quiet
SILENCE_MS=8000 npm start

curl -s -X POST localhost:3000/api/match   -H 'Content-Type: application/json' \
  -d '{"phoneA":"+256700000001","phoneB":"+256700000002"}'
# ...wait 8s, then let the timer scan (or hit it on demand):
curl -s -X POST localhost:3000/api/tick
# -> goat call dispatched to BOTH numbers 🐐

# Point AT's Voice callback at POST /voice to hear the goat XML that plays.
curl -s -X POST localhost:3000/voice
```

Endpoints: `POST /api/match`, `POST /api/message` (resets the clock, re-arms the
goat), `GET /api/matches` (inspect silence state), `POST /api/tick` (scan now),
`POST /voice` (AT Voice callback).

## Photo & Location Gating 🛡️

The safety / privacy / trust layer. Nothing about a person is revealed until
consent is mutual:

- **Photos** stay hidden until **both** people like each other (a mutual match).
  Names are masked until then too. A matched user can still re-hide their photo.
- **Location** is stricter: even after a mutual match it stays hidden until
  **both** people explicitly opt in — a double consent. And it is **never
  exact** — only a coarse area (an `area` label, or coordinates rounded to
  ~1km). Raw coordinates never leave the vault.
- **Blocking** instantly hides everything, both directions, and breaks the match.

Private data lives in a `ProfileVault`; a `MatchGate` derives what each viewer
may see. The gated view is the single source of truth for the UI.

```bash
npm start
# Store private profiles (photo + location live only in the vault):
curl -s -X POST localhost:3000/api/profile -H 'Content-Type: application/json' \
  -d '{"phone":"+256700000001","displayName":"Amara N","photoUrl":"...","area":"Ntinda, Kampala"}'
curl -s -X POST localhost:3000/api/profile -H 'Content-Type: application/json' \
  -d '{"phone":"+256700000002","displayName":"Brian K","photoUrl":"...","lat":0.34765,"lng":32.61234}'

curl -s -X POST localhost:3000/api/match -H 'Content-Type: application/json' \
  -d '{"phoneA":"+256700000001","phoneB":"+256700000002"}'

# Before a mutual like, the view is fully gated:
curl -s 'localhost:3000/api/view?matchId=m1&viewer=%2B256700000001'

# Both like -> photo unlocks; both opt in to location -> coarse area only.
curl -s -X POST localhost:3000/api/like -H 'Content-Type: application/json' -d '{"matchId":"m1","phone":"+256700000001"}'
curl -s -X POST localhost:3000/api/like -H 'Content-Type: application/json' -d '{"matchId":"m1","phone":"+256700000002"}'
curl -s -X POST localhost:3000/api/consent/location -H 'Content-Type: application/json' -d '{"matchId":"m1","phone":"+256700000001"}'
curl -s -X POST localhost:3000/api/consent/location -H 'Content-Type: application/json' -d '{"matchId":"m1","phone":"+256700000002"}'
```

Endpoints: `POST /api/profile`, `POST /api/like`, `POST /api/consent/location`,
`POST /api/consent/photo`, `POST /api/block`, `GET /api/view`.

## Run it

```bash
npm install
npm start
# → http://localhost:3000  (web demo)
```

### Try the USSD flow locally

Africa's Talking posts form-encoded `sessionId`, `phoneNumber`, `serviceCode`,
and `text`. Simulate a full session (menu → 10 answers) with curl:

```bash
# Main menu
curl -s -X POST localhost:3000/ussd -d 'text='

# Pick 1 (Red Flag Index), then answer the 10 Yes/No questions.
# Here: 1 (menu), then five "No" about you, five "No" about your crush.
curl -s -X POST localhost:3000/ussd -d 'text=1*2*2*2*2*2*2*2*2*2*2'
```

To connect the real thing: point your Africa's Talking USSD callback at
`https://<your-host>/ussd`.

### Tests

```bash
npm test
```

## The features we pitched (roadmap)

- 🕵️ **Ex-Files Reference Check** — ✅ built (USSD + web)
- 📟 **USSD Romance for the People** — ✅ built
- 🤖 **Type Beat Detector** ("you say ambitious, you mean unavailable") — ✅ built
- ⏳ **Awkward Silence Timer** — same goat voice call to both users after 24h of
  silence (Africa's Talking Voice API) — ✅ built (with dry-run + web demo)
- 🛡️ **Photo/location gating** — no photo until a mutual match; coarse location
  only after a double opt-in; blocking clears everything — ✅ built (with web demo)

## License

MIT. Go build the future of connection. The goat believes in you. 🐐
