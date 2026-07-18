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
answer five questions about **yourself**, then the same five about your **most
recent ex**. The gap between the two is where the truth lives — and it becomes
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
- **`src/server.js`** — Express server: USSD webhook + JSON APIs + web demo.
- **`public/index.html`** — a styled web prototype of the Red Flag Index for the
  stage demo.

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
# Here: 1 (menu), then five "No" about you, five "No" about your ex.
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
- ⏳ **Awkward Silence Timer** — sends both users the same goat voice note after
  24h of silence (Africa's Talking Voice API) — 🚧 next
- 🛡️ Photo/location gating after mutual match — 🚧 next

## License

MIT. Go build the future of connection. The goat believes in you. 🐐
