// The Awkward Silence Timer.
//
// Every match has a `lastActivityAt`. If two matched people go quiet for longer
// than `silenceMs` (24h in production), the timer places an Africa's Talking
// Voice call to BOTH of them that plays the exact same goat scream. Conversation
// tends to resume immediately, out of sheer confusion. This is the whole feature.
//
// The clock is injectable (`now()`), so tests fast-forward time instead of
// waiting a real 24 hours, and the voice client is injectable so nothing dials a
// real phone in CI.

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * In-memory store of matches and their silence state. One process = one store;
 * swap for a DB in production. Deliberately tiny and synchronous.
 */
export class MatchStore {
  constructor() {
    this.matches = new Map(); // id -> match
    this.seq = 0;
  }

  /**
   * Create a match between two phone numbers.
   * @returns the match record.
   */
  createMatch(phoneA, phoneB, now = Date.now()) {
    if (!phoneA || !phoneB) throw new Error('A match needs two phone numbers.');
    if (phoneA === phoneB) throw new Error('You cannot match with yourself. Heal first.');
    const id = `m${++this.seq}`;
    const match = {
      id,
      participants: [phoneA, phoneB],
      lastActivityAt: now, // matching counts as activity
      goatSentAt: null,
      goatCount: 0,
      createdAt: now,
    };
    this.matches.set(id, match);
    return match;
  }

  get(id) {
    return this.matches.get(id);
  }

  list() {
    return [...this.matches.values()];
  }

  /**
   * Record a message / any activity in a match. Resets the silence clock and
   * re-arms the goat (so a future silence can trigger it again).
   */
  recordActivity(id, now = Date.now()) {
    const match = this.matches.get(id);
    if (!match) throw new Error(`No such match: ${id}`);
    match.lastActivityAt = now;
    match.goatSentAt = null; // re-arm
    return match;
  }

  /** Milliseconds a match has been silent. */
  silenceFor(match, now = Date.now()) {
    return now - match.lastActivityAt;
  }
}

/**
 * Drives the goat. Pure logic in `tick()`; `start()` just schedules ticks.
 */
export class SilenceTimer {
  /**
   * @param {object} opts
   * @param {MatchStore} opts.store
   * @param {{call:(to:string)=>Promise<any>}} opts.voiceClient
   * @param {number} [opts.silenceMs] threshold before the goat calls (default 24h)
   * @param {number} [opts.checkIntervalMs] how often to scan (default 60s)
   * @param {()=>number} [opts.now] clock, injectable for tests
   */
  constructor({ store, voiceClient, silenceMs = DAY_MS, checkIntervalMs = 60_000, now = Date.now }) {
    this.store = store;
    this.voiceClient = voiceClient;
    this.silenceMs = silenceMs;
    this.checkIntervalMs = checkIntervalMs;
    this.now = now;
    this._interval = null;
  }

  /**
   * Scan all matches once. Any match that has been silent past the threshold
   * and hasn't already been goated gets a goat call to both participants.
   * Idempotent: won't re-goat a match until new activity re-arms it.
   *
   * @returns {Promise<Array>} the dispatch records created this tick.
   */
  async tick(now = this.now()) {
    const dispatched = [];
    for (const match of this.store.list()) {
      const silent = now - match.lastActivityAt;
      if (silent >= this.silenceMs && !match.goatSentAt) {
        const results = [];
        for (const phone of match.participants) {
          try {
            const r = await this.voiceClient.call(phone);
            results.push({ to: phone, ok: true, result: r });
          } catch (err) {
            results.push({ to: phone, ok: false, error: String(err.message || err) });
          }
        }
        match.goatSentAt = now;
        match.goatCount += 1;
        dispatched.push({ matchId: match.id, silentMs: silent, results });
      }
    }
    return dispatched;
  }

  /** Begin scanning on an interval. Returns a stop function. */
  start() {
    if (this._interval) return () => this.stop();
    this._interval = setInterval(() => {
      this.tick().catch((err) => console.error('SilenceTimer tick failed:', err));
    }, this.checkIntervalMs);
    if (this._interval.unref) this._interval.unref(); // don't keep process alive
    return () => this.stop();
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}
