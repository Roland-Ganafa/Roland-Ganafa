import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProfileVault, MatchGate, coarsenLocation } from '../src/gating.js';

const A = '+256700000001';
const B = '+256700000002';

function setup() {
  const vault = new ProfileVault();
  vault.setProfile(A, { displayName: 'Amara N', photoUrl: 'https://x/a.jpg', area: 'Ntinda, Kampala' });
  vault.setProfile(B, { displayName: 'Brian K', photoUrl: 'https://x/b.jpg', lat: 0.34765, lng: 32.61234 });
  const gate = new MatchGate();
  gate.register('m1', [A, B]);
  return { vault, gate };
}

test('no photo and no location before a mutual match', () => {
  const { vault, gate } = setup();
  gate.like('m1', A); // only A likes
  const v = gate.viewFor('m1', A, vault);
  assert.equal(v.mutual, false);
  assert.equal(v.photo.visible, false);
  assert.equal(v.location.visible, false);
  assert.equal(v.name, 'B•••'); // name is masked pre-match
  assert.match(v.photo.reason, /both like each other/);
});

test('mutual match unlocks the photo but NOT location', () => {
  const { vault, gate } = setup();
  gate.like('m1', A);
  const { mutual } = gate.like('m1', B);
  assert.equal(mutual, true);
  const v = gate.viewFor('m1', A, vault);
  assert.equal(v.photo.visible, true);
  assert.equal(v.photo.url, 'https://x/b.jpg');
  assert.equal(v.location.visible, false, 'location still needs explicit consent');
  assert.equal(v.name, 'Brian K'); // name now unmasked
});

test('location needs a mutual match AND both to opt in, and stays coarse', () => {
  const { vault, gate } = setup();
  gate.like('m1', A);
  gate.like('m1', B);
  gate.setLocationConsent('m1', A, true);
  // only A consented so far
  let v = gate.viewFor('m1', A, vault);
  assert.equal(v.location.visible, false);

  const res = gate.setLocationConsent('m1', B, true);
  assert.equal(res.bothConsented, true);
  v = gate.viewFor('m1', A, vault); // A views B, whose location is lat/lng
  assert.equal(v.location.visible, true);
  // must be coarsened, never the raw coordinates
  assert.equal(v.location.value.precision, '~1km');
  assert.equal(v.location.value.approxLat, 0.35);
  assert.equal(v.location.value.approxLng, 32.61);
  assert.equal(v.location.value.lat, undefined, 'raw lat must never leak');
});

test('an owner can hide their photo even after matching', () => {
  const { vault, gate } = setup();
  gate.like('m1', A);
  gate.like('m1', B);
  gate.setPhotoShared('m1', B, false); // B hides their photo
  const v = gate.viewFor('m1', A, vault); // A tries to view B
  assert.equal(v.photo.visible, false);
  assert.match(v.photo.reason, /hidden their photo/);
});

test('blocking hides everything and breaks the mutual', () => {
  const { vault, gate } = setup();
  gate.like('m1', A);
  gate.like('m1', B);
  gate.setLocationConsent('m1', A, true);
  gate.setLocationConsent('m1', B, true);
  gate.block('m1', A);
  assert.equal(gate.isMutual('m1'), false);
  const v = gate.viewFor('m1', B, vault);
  assert.equal(v.photo.visible, false);
  assert.equal(v.location.visible, false);
  assert.match(v.photo.reason, /blocked/);
});

test('coarsenLocation prefers an area label and never returns raw coords', () => {
  assert.deepEqual(coarsenLocation({ area: 'Ntinda' }), { area: 'Ntinda', precision: 'area' });
  const c = coarsenLocation({ lat: 0.3476, lng: 32.6123 });
  assert.equal(c.precision, '~1km');
  assert.equal(c.approxLat, 0.35);
  assert.equal(coarsenLocation({}), null);
});

test('non-participants cannot be viewed or act on a match', () => {
  const { vault, gate } = setup();
  assert.throws(() => gate.like('m1', '+000'), /not part of this match/);
  assert.throws(() => gate.viewFor('m1', '+000', vault), /not part of this match/);
});
