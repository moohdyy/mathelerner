const test = require('node:test');
const assert = require('node:assert');
const ML = require('../logic.js');

/* The two-stage clock: threshold → grace → deadline.
   Only the pure logic is checked here; the drawing lives in index.html and is
   measured in the browser. */

test('the deadline is three times the time threshold', () => {
  assert.strictEqual(ML.TIME_LIMIT_FACTOR, 3);
  assert.strictEqual(ML.deadlineMs(3000), 9000);
  assert.strictEqual(ML.deadlineMs(1500), 4500);
});

test('the deadline in voice mode includes the bonus', () => {
  const threshold = ML.DEFAULT_THRESHOLD_MS + ML.STT_THRESHOLD_BONUS_MS;
  assert.strictEqual(ML.deadlineMs(threshold), 12000);
});

test('up to the threshold it counts as fast — the boundary still belongs to it', () => {
  assert.strictEqual(ML.timePhase(0, 3000), ML.TIME_FAST);
  assert.strictEqual(ML.timePhase(2999, 3000), ML.TIME_FAST);
  // gradeAnswer grades with `<=`; the display has to draw the same boundary,
  // otherwise it shows grace while the card is still moving up.
  assert.strictEqual(ML.timePhase(3000, 3000), ML.TIME_FAST);
});

test('between threshold and deadline it counts as grace', () => {
  assert.strictEqual(ML.timePhase(3001, 3000), ML.TIME_GRACE);
  assert.strictEqual(ML.timePhase(6000, 3000), ML.TIME_GRACE);
  assert.strictEqual(ML.timePhase(8999, 3000), ML.TIME_GRACE);
});

test('from the deadline on it counts as expired', () => {
  assert.strictEqual(ML.timePhase(9000, 3000), ML.TIME_EXPIRED);
  assert.strictEqual(ML.timePhase(60000, 3000), ML.TIME_EXPIRED);
});

test('an unusable threshold never expires', () => {
  // If the threshold ever drops to 0, NaN or negative, that must never turn
  // into a timeout — it would cost a card without the child doing anything.
  for (const broken of [0, -1, NaN, null, undefined, 'x']) {
    assert.strictEqual(ML.timePhase(999999, broken), ML.TIME_FAST);
    assert.strictEqual(ML.deadlineMs(broken), 0);
  }
});

test('negative or nonsensical elapsed time counts as the beginning', () => {
  assert.strictEqual(ML.timePhase(-500, 3000), ML.TIME_FAST);
  assert.strictEqual(ML.timePhase(NaN, 3000), ML.TIME_FAST);
  assert.strictEqual(ML.timeDisplay(-500, 3000).fraction, 1);
});

test('timeDisplay returns the remaining fraction of the deadline', () => {
  assert.strictEqual(ML.timeDisplay(0, 3000).fraction, 1);
  assert.strictEqual(ML.timeDisplay(4500, 3000).fraction, 0.5);
  assert.strictEqual(ML.timeDisplay(9000, 3000).fraction, 0);
  assert.strictEqual(ML.timeDisplay(20000, 3000).fraction, 0);
});

test('the mark sits where the grace period begins', () => {
  const a = ML.timeDisplay(0, 3000);
  assert.ok(Math.abs(a.thresholdFraction - 2 / 3) < 1e-9);
  // Exactly when the threshold is reached, the bar stands on the mark.
  const b = ML.timeDisplay(3000, 3000);
  assert.ok(Math.abs(b.fraction - a.thresholdFraction) < 1e-9);
});

test('timeDisplay names remaining time, deadline and phase together', () => {
  const a = ML.timeDisplay(5000, 4000);
  assert.strictEqual(a.totalMs, 12000);
  assert.strictEqual(a.remainingMs, 7000);
  assert.strictEqual(a.phase, ML.TIME_GRACE);
  assert.strictEqual(ML.timeDisplay(99999, 4000).remainingMs, 0);
});

test('the grace phase changes nothing about gradeAnswer: no step back', () => {
  // The timer must not undo the spec rule. A correct answer during grace
  // leaves the card where it is — no progress, no step back.
  const card = { box: 2, due: 0, refreshLevel: 0, seen: 4, correct: 3,
                 bestMs: 2500, lastMs: 2500 };
  const inGrace = 6000;
  assert.strictEqual(ML.timePhase(inGrace, 3000), ML.TIME_GRACE);
  const after = ML.gradeAnswer(card, {
    correct: true, elapsedMs: inGrace, thresholdMs: 3000, now: 1000
  });
  assert.strictEqual(after.box, 2);
});
