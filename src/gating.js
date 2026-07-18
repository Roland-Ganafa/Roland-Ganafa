// Photo & location gating after a mutual match.
//
// This is the safety / privacy / trust layer from the brief. The rules:
//
//   1. Nobody sees a photo until BOTH people like each other (a mutual match).
//   2. Location is stricter still: even after a mutual match, it stays hidden
//      until BOTH people explicitly opt in to share location — a double
//      consent. And it is NEVER exact: we only ever reveal a coarse area
//      (neighbourhood-level), never raw coordinates.
//   3. Either person can revoke photo sharing, or block the match. A block
//      instantly hides everything, both directions, and breaks the match.
//
// The vault holds private data; the gate decides what a given viewer is
// allowed to see. Private data never leaves the vault except through the gate.

/**
 * Holds each person's private profile, keyed by phone number. Raw location is
 * kept here and never exposed directly — the gate coarsens it on the way out.
 */
export class ProfileVault {
  constructor() {
    this.profiles = new Map();
  }

  /**
   * @param {string} phone
   * @param {object} data { displayName, photoUrl, area?, lat?, lng? }
   */
  setProfile(phone, data = {}) {
    if (!phone) throw new Error('A profile needs a phone number.');
    const prev = this.profiles.get(phone) || {};
    this.profiles.set(phone, { ...prev, ...data });
    return this.profiles.get(phone);
  }

  getRaw(phone) {
    return this.profiles.get(phone) || null;
  }
}

/**
 * Turn a precise location into a coarse, shareable one. We prefer an explicit
 * `area` label; otherwise we round coordinates to ~1km so an exact home address
 * can never be reconstructed from what we reveal.
 */
export function coarsenLocation(profile) {
  if (!profile) return null;
  if (profile.area) return { area: profile.area, precision: 'area' };
  if (typeof profile.lat === 'number' && typeof profile.lng === 'number') {
    // 2 decimal places ≈ 1.1km grid. Deliberately fuzzy.
    const lat = Math.round(profile.lat * 100) / 100;
    const lng = Math.round(profile.lng * 100) / 100;
    return { approxLat: lat, approxLng: lng, precision: '~1km' };
  }
  return null;
}

function maskName(displayName) {
  if (!displayName) return 'Someone';
  const first = displayName.trim().split(/\s+/)[0];
  return `${first[0].toUpperCase()}•••`;
}

/**
 * Per-match consent + visibility state machine.
 */
export class MatchGate {
  constructor() {
    this.gates = new Map(); // matchId -> gate state
  }

  register(matchId, participants) {
    if (!Array.isArray(participants) || participants.length !== 2) {
      throw new Error('A gate needs exactly two participants.');
    }
    if (!this.gates.has(matchId)) {
      this.gates.set(matchId, {
        participants: [...participants],
        likes: new Set(),
        photoShared: new Map(participants.map((p) => [p, true])), // shared by default once mutual
        locationConsent: new Set(),
        blocked: new Set(),
      });
    }
    return this.gates.get(matchId);
  }

  _get(matchId) {
    const g = this.gates.get(matchId);
    if (!g) throw new Error(`No such match gate: ${matchId}`);
    return g;
  }

  _assertParticipant(g, phone) {
    if (!g.participants.includes(phone)) {
      throw new Error('That phone is not part of this match.');
    }
  }

  /** Record a like. Returns { mutual }. */
  like(matchId, phone) {
    const g = this._get(matchId);
    this._assertParticipant(g, phone);
    g.likes.add(phone);
    return { mutual: this.isMutual(matchId) };
  }

  isMutual(matchId) {
    const g = this._get(matchId);
    if (g.blocked.size > 0) return false;
    return g.participants.every((p) => g.likes.has(p));
  }

  /** A matched user opts in (or out) of sharing location. */
  setLocationConsent(matchId, phone, grant = true) {
    const g = this._get(matchId);
    this._assertParticipant(g, phone);
    if (grant) g.locationConsent.add(phone);
    else g.locationConsent.delete(phone);
    return { bothConsented: g.participants.every((p) => g.locationConsent.has(p)) };
  }

  /** A matched user hides or re-shares their own photo. */
  setPhotoShared(matchId, phone, shared = true) {
    const g = this._get(matchId);
    this._assertParticipant(g, phone);
    g.photoShared.set(phone, Boolean(shared));
    return { photoShared: g.photoShared.get(phone) };
  }

  /** Block the match. Hides everything, both directions, breaks the mutual. */
  block(matchId, phone) {
    const g = this._get(matchId);
    this._assertParticipant(g, phone);
    g.blocked.add(phone);
    return { blocked: true };
  }

  /**
   * What is `viewer` allowed to see about the other participant right now?
   * Pure derivation from consent state — the single source of truth for the UI.
   */
  viewFor(matchId, viewer, vault) {
    const g = this._get(matchId);
    this._assertParticipant(g, viewer);
    const target = g.participants.find((p) => p !== viewer);
    const raw = vault.getRaw(target) || {};
    const mutual = this.isMutual(matchId);
    const blocked = g.blocked.size > 0;

    // Name.
    const name = mutual ? raw.displayName || 'Your match' : maskName(raw.displayName);

    // Photo: only on a mutual match, only if the owner still shares it.
    let photo;
    if (blocked) {
      photo = { visible: false, url: null, reason: 'This match is blocked.' };
    } else if (!mutual) {
      photo = { visible: false, url: null, reason: 'No photos until you both like each other.' };
    } else if (g.photoShared.get(target) === false) {
      photo = { visible: false, url: null, reason: `${name} has hidden their photo.` };
    } else {
      photo = { visible: true, url: raw.photoUrl || null, reason: 'Mutual match — photo unlocked.' };
    }

    // Location: mutual match AND both explicitly consented. Always coarse.
    const bothConsented = g.participants.every((p) => g.locationConsent.has(p));
    let location;
    if (blocked) {
      location = { visible: false, value: null, reason: 'This match is blocked.' };
    } else if (!mutual) {
      location = { visible: false, value: null, reason: 'No location until you both like each other.' };
    } else if (!bothConsented) {
      const need = g.locationConsent.has(viewer) ? `${name} hasn't` : 'You both must';
      location = {
        visible: false,
        value: null,
        reason: `${need} opt in to share location. It's always shown only as an approximate area.`,
      };
    } else {
      location = {
        visible: true,
        value: coarsenLocation(raw),
        reason: 'Both opted in — showing approximate area only.',
      };
    }

    return { matchId, viewer, target, mutual, name, photo, location };
  }
}
