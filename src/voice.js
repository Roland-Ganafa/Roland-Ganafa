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

/**
 * Build the AT Voice XML played when a goat call connects.
 * If GOAT_AUDIO_URL is set we <Play> it; otherwise we <Say> a goat scream so
 * the demo still works with zero assets.
 *
 * @param {string} [goatAudioUrl]
 * @returns {string} XML
 */
export function goatVoiceXml(goatAudioUrl) {
  const middle = goatAudioUrl
    ? `  <Play url="${escapeXml(goatAudioUrl)}"/>`
    : `  <Say voice="man">Maaaaaaaaaaaaaa. Maaaaaa.</Say>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    '  <Say>Hello. This is an automated wellness check from Ex-Files.</Say>',
    middle,
    '  <Say>That was a goat. You have been silent for 24 hours. Please say something to your match.</Say>',
    '</Response>',
  ].join('\n');
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
