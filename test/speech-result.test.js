const { test } = require('node:test');
const assert = require('node:assert');
const ML = require('../logic.js');

// A recognition result as the DOM hands it over, reduced to what the decision
// needs: per segment whether it is final and its alternatives in order.
function seg(final, ...alternatives) {
  return { final: final, alternatives: alternatives };
}

function choose(segments, extra = {}) {
  return ML.chooseSpokenAnswer(segments, { expected: 45, lang: 'de', ...extra });
}

/* ---------- only a finished utterance is graded ---------- */

test('a growing interim result grades nothing', () => {
  // The on-device recogniser streams prefixes: "4" stands there long before
  // "45" does. Grading the prefix costs the card a box.
  assert.strictEqual(choose([seg(false, 'nein ich glaube nicht 4')]).status, 'pending');
  assert.strictEqual(choose([seg(false, 'nein ich glaube nicht 4')]).value, null);
});

test('an interim result still reports what was heard', () => {
  assert.strictEqual(choose([seg(false, 'nein ich glaube')]).heard, 'nein ich glaube');
});

test('the final result of the same utterance is graded', () => {
  const out = choose([seg(true, 'nein ich glaube nicht 45')]);
  assert.strictEqual(out.status, 'value');
  assert.strictEqual(out.value, 45);
});

test('an interim segment behind a final one keeps the utterance open', () => {
  // Chrome appends; as long as the last segment is still running, the child is
  // still speaking.
  assert.strictEqual(choose([seg(true, 'das ist'), seg(false, '4')]).status, 'pending');
});

test('without any segment nothing is graded', () => {
  assert.strictEqual(choose([]).status, 'pending');
  assert.strictEqual(choose([]).heard, '');
  assert.strictEqual(choose(null).status, 'pending');
  assert.strictEqual(choose(undefined).status, 'pending');
});

/* ---------- the end of a pass finishes what is there ---------- */

test('assumeFinal grades segments the recogniser never marked final', () => {
  // Some engines end the pass without ever setting isFinal. The end of the
  // pass is the last point at which the utterance can still be worth
  // something — otherwise the microphone would be mute for good.
  const out = choose([seg(false, 'das ist die 45')], { assumeFinal: true });
  assert.strictEqual(out.status, 'value');
  assert.strictEqual(out.value, 45);
});

test('assumeFinal without a number reports nothing understood, not a value', () => {
  const out = choose([seg(false, 'also jetzt gehe ich spielen')], { assumeFinal: true });
  assert.strictEqual(out.status, 'none');
  assert.strictEqual(out.value, null);
});

test('assumeFinal on an empty pass stays pending', () => {
  // Nothing was heard at all — that is not "not understood", it is nothing.
  assert.strictEqual(choose([], { assumeFinal: true }).status, 'pending');
});

/* ---------- every final segment counts, not just the first ---------- */

test('the number in a later segment is graded', () => {
  // Observed: results[0] "das frustrierend", results[1] "18" — the answer sat
  // in the segment the grading never looked at.
  const out = choose([seg(true, 'das frustrierend'), seg(true, '18')], { expected: 18 });
  assert.strictEqual(out.status, 'value');
  assert.strictEqual(out.value, 18);
});

test('the heard text joins all segments', () => {
  assert.strictEqual(
    choose([seg(true, 'das frustrierend'), seg(true, '18')], { expected: 18 }).heard,
    'das frustrierend 18');
});

/* ---------- which value out of the alternatives ---------- */

test('the expected number counts wherever it appears', () => {
  const out = choose([seg(true, 'vierzig', 'fünfundvierzig')]);
  assert.strictEqual(out.value, 45);
  assert.strictEqual(out.alternative, 1);
  assert.strictEqual(out.text, 'fünfundvierzig');
});

test('the first alternative wins when it already holds the expected number', () => {
  const out = choose([seg(true, 'fünfundvierzig', 'fünfundvierzig')]);
  assert.strictEqual(out.alternative, 0);
});

test('without the expected number the last number of the first alternative counts', () => {
  // Whoever says the whole sum out loud means their result with the last
  // number.
  const out = choose([seg(true, 'neun mal fünf ist vierzig')]);
  assert.strictEqual(out.value, 40);
  assert.strictEqual(out.text, 'neun mal fünf ist vierzig');
});

test('an alternative without a number is skipped', () => {
  const out = choose([seg(true, 'karotte', 'vierzig')]);
  assert.strictEqual(out.value, 40);
  assert.strictEqual(out.alternative, 1);
});

test('filler words around the number do not prevent grading', () => {
  assert.strictEqual(choose([seg(true, 'das ist die 45')]).value, 45);
  assert.strictEqual(choose([seg(true, 'karotja genau 40')], { expected: 40 }).value, 40);
});

test('a final result without any number is not graded', () => {
  const out = choose([seg(true, 'karotte')]);
  assert.strictEqual(out.status, 'none');
  assert.strictEqual(out.value, null);
  assert.strictEqual(out.heard, 'karotte');
});

/* ---------- segments with differing alternative counts ---------- */

test('a segment with fewer alternatives falls back to its last one', () => {
  const out = choose([seg(true, 'also'), seg(true, 'vierzig', 'fünfundvierzig')]);
  assert.strictEqual(out.value, 45);
  assert.strictEqual(out.text, 'also fünfundvierzig');
});

test('empty alternatives do not produce a candidate', () => {
  assert.strictEqual(choose([seg(true)]).status, 'none');
  assert.strictEqual(choose([seg(true, '')]).status, 'none');
});

/* ---------- the language is handed in, never read ---------- */

test('the same words are graded per language', () => {
  assert.strictEqual(
    choose([seg(true, 'forty five')], { lang: 'en' }).value, 45);
  assert.strictEqual(
    choose([seg(true, 'forty five')], { lang: 'de' }).status, 'none');
});
