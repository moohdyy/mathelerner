const { test } = require('node:test');
const assert = require('node:assert');
const ML = require('../logic.js');

// The level detector answers exactly one question: WHEN did speaking stop.
// That timestamp is what the answer time is measured against, so it has to be
// the moment silence began — not the moment the detector became sure of it.

// Feeds a series of [rms, now] through the detector and collects the events.
function run(steps, opts) {
  let state = ML.newVoiceState();
  const events = [];
  for (const [rms, now] of steps) {
    const out = ML.voiceStep(state, rms, now, opts);
    state = out.state;
    if (out.event !== null) events.push({ event: out.event, at: out.at });
  }
  return { events, state };
}

const LOUD = 0.4;
const QUIET = 0.001;

test('speech begins above the upper threshold', () => {
  const { events } = run([[QUIET, 0], [LOUD, 100]]);
  assert.deepStrictEqual(events, [{ event: 'start', at: 100 }]);
});

test('a level between the thresholds does not start speech', () => {
  // Hysteresis: room noise sits between the two thresholds. Without the gap
  // the detector would toggle on every breath.
  const { events } = run([[0.015, 0], [0.015, 100], [0.015, 200]]);
  assert.deepStrictEqual(events, []);
});

test('silence shorter than the hang time ends nothing', () => {
  // A pause between two syllables is not the end of the utterance.
  const { events } = run([[LOUD, 0], [QUIET, 100], [LOUD, 300]]);
  assert.deepStrictEqual(events, [{ event: 'start', at: 0 }]);
});

test('the end is reported at the beginning of the silence, not at its confirmation', () => {
  // This is the whole point: the detector only knows 400 ms later that the
  // utterance was over. Timestamping it then would push the recognised
  // answer time up by exactly that hang time, on every single answer.
  const { events } = run([[LOUD, 0], [LOUD, 1000], [QUIET, 1100], [QUIET, 1550]]);
  assert.deepStrictEqual(events, [{ event: 'start', at: 0 }, { event: 'end', at: 1100 }]);
});

test('a level between the thresholds keeps running speech alive', () => {
  const { events } = run([[LOUD, 0], [0.015, 100], [0.015, 600], [0.015, 1000]]);
  assert.deepStrictEqual(events, [{ event: 'start', at: 0 }]);
});

test('a new utterance starts again after the end', () => {
  const { events } = run([[LOUD, 0], [QUIET, 100], [QUIET, 600], [LOUD, 2000],
                          [QUIET, 2100], [QUIET, 2600]]);
  assert.deepStrictEqual(events, [
    { event: 'start', at: 0 }, { event: 'end', at: 100 },
    { event: 'start', at: 2000 }, { event: 'end', at: 2100 }
  ]);
});

test('the end is reported exactly once', () => {
  const { events } = run([[LOUD, 0], [QUIET, 100], [QUIET, 600], [QUIET, 1200],
                          [QUIET, 2000]]);
  assert.strictEqual(events.filter(e => e.event === 'end').length, 1);
});

test('an unusable level changes nothing', () => {
  // The analyser delivers NaN when the audio graph is being torn down. A NaN
  // must not silently look like silence and end the utterance.
  const { events, state } = run([[LOUD, 0], [NaN, 100], [undefined, 600], [null, 1200]]);
  assert.deepStrictEqual(events, [{ event: 'start', at: 0 }]);
  assert.strictEqual(state.speaking, true);
});

test('the thresholds and the hang time can be handed in', () => {
  const opts = { on: 0.5, off: 0.4, hangMs: 100 };
  const { events } = run([[0.45, 0], [0.6, 100], [0.3, 200], [0.3, 350]], opts);
  assert.deepStrictEqual(events, [{ event: 'start', at: 100 }, { event: 'end', at: 200 }]);
});

test('a fresh state is not speaking', () => {
  const s = ML.newVoiceState();
  assert.strictEqual(s.speaking, false);
});

test('the step does not modify the state handed in', () => {
  // The state travels through the render loop; a mutated one would make the
  // detector untestable and its history unreconstructable.
  const before = ML.newVoiceState();
  ML.voiceStep(before, LOUD, 100);
  assert.strictEqual(before.speaking, false);
});
