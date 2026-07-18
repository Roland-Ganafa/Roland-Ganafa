// Africa's Talking Voice integration for the Awkward Silence Timer.
//
// How AT Voice works:
//   1. We place an OUTBOUND call: POST https://voice.africastalking.com/call
//      with form fields { username, to, from }.
//   2. When the callee picks up, AT fetches OUR voice callback URL (POST /voice)
//      and expects XML telling it what to do on the call.
//   3. We return <Response><Play url="...goat..."/></Response> — AT plays the
//      goat scream down the line. Romance, restored. 🐐
//
// The VoiceClient talks to the real API. The DryRunVoiceClient records calls
// instead of placing them, so the whole feature runs (and is testable) with no
// credentials — which is also exactly what you want on a hackathon stage.

// A <Play> only works if the URL is a real, directly-downloadable audio file.
// A non-audio URL (an HTML page, a redirect) makes Africa's Talking's media
// server fail and DROP the call — so we only emit <Play> for a clear audio
// extension, and otherwise fall back to a spoken goat that always works.
function isDirectAudio(url) {
  return typeof url === 'string' && /\.(mp3|wav|ogg|m4a)(\?.*)?$/i.test(url.trim());
}

/**
 * Build the AT Voice XML played when a goat call connects.
 *
 * Uses the documented call actions: a <GetDigits> block wraps the prompt
 * (<Say> the coffee invite, plus an optional sound via <Play>) so the callee
 * can press a key. Africa's Talking submits the pressed digit to `callbackUrl`
 * (or the number's default callback if omitted) — handled by
 * goatDigitsResponseXml. If they press nothing, the trailing <Say> plays.
 *
 * @param {string} [goatAudioUrl] optional DIRECT mp3/wav to play as intro flair
 * @param {string} [callbackUrl] absolute URL AT should post the pressed key to
 * @returns {string} XML
 */
export function goatVoiceXml(goatAudioUrl, callbackUrl) {
  const sound = isDirectAudio(goatAudioUrl)
    ? [`    <Play url="${escapeXml(goatAudioUrl)}"/>`]
    : [];
  const cb = callbackUrl ? ` callbackUrl="${escapeXml(callbackUrl)}"` : '';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    `  <GetDigits timeout="20" numDigits="1" finishOnKey="#"${cb}>`,
    '    <Say>Hi! Someone on Ex-Files has a crush on you.</Say>',
    ...sound,
    '    <Say>Can we meet up and have a coffee sometime? Press 1 if yes, let us do it. Press 2 for maybe later.</Say>',
    '  </GetDigits>',
    '  <Say>We did not catch that. We will ask again another time. Goodbye.</Say>',
    '</Response>',
  ].join('\n');
}

/**
 * Follow-up XML after the callee presses a key. Africa's Talking POSTs the
 * pressed key as `dtmfDigits` to the voice callback; we branch on it.
 *
 * @param {string} digits the dtmfDigits value from AT
 * @returns {string} XML
 */
export function goatDigitsResponseXml(digits) {
  let lines;
  if (digits === '1') {
    lines = ['  <Say>Amazing! We will let them know and send you both a time to meet. Enjoy the coffee. Goodbye.</Say>'];
  } else if (digits === '2') {
    lines = ['  <Say>No problem at all. Maybe another time. Goodbye.</Say>'];
  } else {
    lines = ['  <Say>That was not 1 or 2. We will ask again later. Goodbye.</Say>'];
  }
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<Response>', ...lines, '</Response>'].join('\n');
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Real Africa's Talking Voice client.
 * Needs AT_USERNAME, AT_API_KEY and a caller id (AT_VOICE_NUMBER).
 */
export class VoiceClient {
  constructor(config = {}, fetchImpl = globalThis.fetch) {
    this.username = config.username;
    this.apiKey = config.apiKey;
    this.from = config.from; // your AT voice number / caller id
    this.baseUrl = config.baseUrl || 'https://voice.africastalking.com';
    this.fetch = fetchImpl;
  }

  get configured() {
    return Boolean(this.username && this.apiKey && this.from);
  }

  /**
   * Place an outbound goat call to a single number.
   * @param {string} to E.164 phone number, e.g. +2567...
   */
  async call(to) {
    const body = new URLSearchParams({
      username: this.username,
      to,
      from: this.from,
    });
    const res = await this.fetch(`${this.baseUrl}/call`, {
      method: 'POST',
      headers: {
        apiKey: this.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`AT Voice call failed: ${res.status} ${await safeText(res)}`);
    }
    return res.json();
  }
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

/**
 * Dry-run client: records the goat calls it "would" have placed.
 * Used when AT credentials are absent (local dev, tests, live demo).
 */
export class DryRunVoiceClient {
  constructor() {
    this.calls = [];
  }

  get configured() {
    return true; // always ready to pretend
  }

  async call(to) {
    const record = { to, at: new Date().toISOString(), goat: true };
    this.calls.push(record);
    console.log(`🐐 [dry-run] goat call placed to ${to}`);
    return { status: 'Queued', to, dryRun: true };
  }
}

// Our Africa's Talking Voice caller id (the number the goat calls come from).
// A phone number, not a secret — override with AT_VOICE_NUMBER if it changes.
export const DEFAULT_VOICE_NUMBER = '+256200600600';

/**
 * Pick a client based on the environment: real if credentials exist, else
 * a dry-run so nothing breaks without secrets. The caller id defaults to our
 * AT voice number, but real calls still require AT_USERNAME + AT_API_KEY.
 */
export function voiceClientFromEnv(env = process.env) {
  const cfg = {
    username: env.AT_USERNAME,
    apiKey: env.AT_API_KEY,
    from: env.AT_VOICE_NUMBER || DEFAULT_VOICE_NUMBER,
  };
  const client = new VoiceClient(cfg);
  return client.configured ? client : new DryRunVoiceClient();
}
