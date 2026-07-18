// The Talking-Stage Clock — Ex-Files' flagship anti-boredom mechanic.
//
// Every other app is built to keep you texting forever. Ex-Files does the
// opposite: its job is to END the talking stage. Each match gets a shelf life.
//
//   talking  -> the early phase, just after matching.
//   nudge    -> at the halfway mark, if no plan exists yet, the app AUTO-
//               proposes a tiny, concrete date (coffee, 20 min). Momentum, forced.
//   planned  -> both people accepted a plan. Success. The clock stops. Go meet.
//   expired  -> the deadline passed with no plan. The match gently dies, so
//               nobody wastes three weeks typing "wyd" into the void.
//
// The clock is injectable (`now`) so tests fast-forward instead of waiting days.

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// The default plan the app proposes when it nudges a match. Deliberately tiny
// and low-stakes — the whole point is to lower the activation energy to meet.
export function defaultPlan() {
  return { activity: 'coffee', duration: '20 minutes', when: 'this week', place: 'a café near you both' };
}

export class TalkingStageClock {
  /**
   * @param {object} opts
   * @param {number} [opts.stageMs] shelf life of a match (default 7 days)
   * @param {number} [opts.nudgeFraction] when to auto-propose, as a fraction (default 0.5)
   * @param {()=>number} [opts.now] injectable clock
   * @param {(match:object)=>any} [opts.onNudge] optional hook fired when the app auto-proposes
   */
  constructor({ stageMs = WEEK_MS, nudgeFraction = 0.5, now = Date.now, onNudge } = {}) {
    this.stageMs = stageMs;
    this.nudgeAt = Math.round(stageMs * nudgeFraction);
    this.now = now;
    this.onNudge = onNudge;
    this.matches = new Map();
    this._interval = null;
  }

  /** Start tracking a match. Matching starts the clock. */
  register(matchId, participants, createdAt = this.now()) {
    if (!Array.isArray(participants) || participants.length !== 2) {
      throw new Error('A talking stage needs exactly two participants.');
    }
    if (!this.matches.has(matchId)) {
      this.matches.set(matchId, {
        id: matchId,
        participants: [...participants],
        createdAt,
        status: 'talking', // talking | proposed | planned | expired
        proposal: null, // { by, plan, at }
        acceptedBy: [], // phones (or 'system') that are in
        nudged: false,
        plannedAt: null,
      });
    }
    return this.matches.get(matchId);
  }

  _get(matchId) {
    const m = this.matches.get(matchId);
    if (!m) throw new Error(`No such talking stage: ${matchId}`);
    return m;
  }

  list() {
    return [...this.matches.values()];
  }

  /** Someone proposes a concrete plan. Proposing counts as being in. */
  propose(matchId, by, plan = defaultPlan(), at = this.now()) {
    const m = this._get(matchId);
    if (m.status === 'planned' || m.status === 'expired') return m;
    if (!m.participants.includes(by) && by !== 'system') {
      throw new Error('Only a participant (or the app) can propose.');
    }
    m.proposal = { by, plan, at };
    m.acceptedBy = by === 'system' ? [] : [by]; // an app proposal needs both to say yes
    m.status = 'proposed';
    return m;
  }

  /** The other person accepts the current plan. Both in => date is set. */
  accept(matchId, phone, at = this.now()) {
    const m = this._get(matchId);
    if (!m.proposal) throw new Error('There is no plan to accept yet.');
    if (!m.participants.includes(phone)) throw new Error('That phone is not in this match.');
    if (!m.acceptedBy.includes(phone)) m.acceptedBy.push(phone);
    if (m.participants.every((p) => m.acceptedBy.includes(p))) {
      m.status = 'planned';
      m.plannedAt = at;
    }
    return m;
  }

  /** Decline the current plan: back to talking (but no re-nudge). */
  decline(matchId, phone) {
    const m = this._get(matchId);
    if (m.status === 'planned' || m.status === 'expired') return m;
    if (!m.participants.includes(phone)) throw new Error('That phone is not in this match.');
    m.proposal = null;
    m.acceptedBy = [];
    m.status = 'talking';
    return m;
  }

  elapsed(m, now = this.now()) {
    return now - m.createdAt;
  }

  timeLeft(m, now = this.now()) {
    return Math.max(0, m.createdAt + this.stageMs - now);
  }

  /** The human-facing phase for a match right now. */
  phaseOf(m, now = this.now()) {
    if (m.status === 'planned') return 'planned';
    if (m.status === 'expired') return 'expired';
    if (this.elapsed(m, now) >= this.stageMs) return 'expired';
    if (m.status === 'proposed') return 'nudge';
    if (this.elapsed(m, now) >= this.nudgeAt) return 'nudge';
    return 'talking';
  }

  /**
   * Drive the lifecycle once: auto-propose at the nudge mark, expire at the
   * deadline. Idempotent — a match is nudged at most once and expired once.
   * @returns {Promise<Array>} events created this tick.
   */
  async tick(now = this.now()) {
    const events = [];
    for (const m of this.matches.values()) {
      if (m.status === 'planned' || m.status === 'expired') continue;
      const elapsed = this.elapsed(m, now);

      // Deadline reached with no plan set -> expire.
      if (elapsed >= this.stageMs) {
        m.status = 'expired';
        events.push({ matchId: m.id, type: 'expired' });
        continue;
      }

      // Halfway with nobody having proposed -> the app proposes for them.
      if (!m.nudged && m.status === 'talking' && elapsed >= this.nudgeAt) {
        m.nudged = true;
        const plan = defaultPlan();
        this.propose(m.id, 'system', plan, now);
        events.push({ matchId: m.id, type: 'nudge', plan });
        if (this.onNudge) {
          try {
            await this.onNudge(m);
          } catch {
            /* a failing nudge hook must not stop the clock */
          }
        }
      }
    }
    return events;
  }

  start(intervalMs = 60_000) {
    if (this._interval) return () => this.stop();
    this._interval = setInterval(() => {
      this.tick().catch((err) => console.error('TalkingStageClock tick failed:', err));
    }, intervalMs);
    if (this._interval.unref) this._interval.unref();
    return () => this.stop();
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}
