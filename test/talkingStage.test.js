import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TalkingStageClock, WEEK_MS } from '../src/talkingStage.js';

const A = '+256700000001';
const B = '+256700000002';

test('register: matching starts the clock in the talking phase', () => {
  const clock = new TalkingStageClock({ stageMs: WEEK_MS });
  const m = clock.register('m1', [A, B], 0);
  assert.equal(m.status, 'talking');
  assert.equal(clock.phaseOf(m, 0), 'talking');
  assert.equal(clock.timeLeft(m, 0), WEEK_MS);
});

test('nudge: the app auto-proposes a plan at the halfway mark', async () => {
  const clock = new TalkingStageClock({ stageMs: 1000, nudgeFraction: 0.5 });
  const m = clock.register('m1', [A, B], 0);

  let events = await clock.tick(499); // before halfway
  assert.equal(events.length, 0);
  assert.equal(m.status, 'talking');

  events = await clock.tick(500); // at halfway
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'nudge');
  assert.equal(m.status, 'proposed');
  assert.equal(m.proposal.by, 'system');
  assert.equal(m.proposal.plan.activity, 'coffee');
});

test('nudge fires at most once', async () => {
  const clock = new TalkingStageClock({ stageMs: 1000, nudgeFraction: 0.5 });
  clock.register('m1', [A, B], 0);
  await clock.tick(500);
  const events = await clock.tick(600);
  assert.equal(events.length, 0, 'should not nudge twice');
});

test('accept: both saying yes sets the date and stops the clock', async () => {
  const clock = new TalkingStageClock({ stageMs: 1000, nudgeFraction: 0.5 });
  const m = clock.register('m1', [A, B], 0);
  await clock.tick(500); // app proposes
  clock.accept('m1', A);
  assert.equal(m.status, 'proposed', 'one yes is not enough');
  clock.accept('m1', B);
  assert.equal(m.status, 'planned');

  // A planned match never expires, even long past the deadline.
  const events = await clock.tick(10_000);
  assert.equal(events.length, 0);
  assert.equal(clock.phaseOf(m, 10_000), 'planned');
});

test('expire: no plan by the deadline gently ends the match', async () => {
  const clock = new TalkingStageClock({ stageMs: 1000, nudgeFraction: 0.5 });
  const m = clock.register('m1', [A, B], 0);
  const events = await clock.tick(1000);
  assert.ok(events.some((e) => e.type === 'expired'));
  assert.equal(m.status, 'expired');
});

test('a user proposing early prevents the auto-nudge', async () => {
  const clock = new TalkingStageClock({ stageMs: 1000, nudgeFraction: 0.5 });
  const m = clock.register('m1', [A, B], 0);
  clock.propose('m1', A, undefined, 100); // A proposes before halfway
  assert.equal(m.status, 'proposed');
  const events = await clock.tick(500);
  assert.equal(events.length, 0, 'no auto-nudge once a plan exists');
  assert.equal(m.proposal.by, A);
});

test('onNudge hook fires when the app auto-proposes', async () => {
  const nudged = [];
  const clock = new TalkingStageClock({
    stageMs: 1000,
    nudgeFraction: 0.5,
    onNudge: (m) => nudged.push(m.id),
  });
  clock.register('m1', [A, B], 0);
  await clock.tick(500);
  assert.deepEqual(nudged, ['m1']);
});

test('accept without a proposal throws', () => {
  const clock = new TalkingStageClock({ stageMs: 1000 });
  clock.register('m1', [A, B], 0);
  assert.throws(() => clock.accept('m1', A), /no plan to accept/i);
});
