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

test('a transcript mixing digits and words is graded on the spoken result', () => {
  // The recogniser mixes formats within one sentence: "2 mal 2 ist vier".
  // Digits used to end the number search, the "vier" was never seen, and the
  // factor 2 was graded against the expected 4 — a correct answer thrown
  // onto box 0.
  const out = choose([seg(true, '2 mal 2 ist vier')], { expected: 4 });
  assert.strictEqual(out.status, 'value');
  assert.strictEqual(out.value, 4);
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

/* ---------- segments already dealt with stay out ---------- */

// In continuous mode one recogniser keeps running across several utterances:
// the segments of an utterance that was already reported pile up in front of
// the new one. Without a starting point the old ones would be graded again —
// and a card would be graded on words the child spoke before the question was
// asked anew.

test('from skips the segments of a previous utterance', () => {
  const out = choose([seg(true, 'keine ahnung'), seg(true, 'fünfundvierzig')], { from: 1 });
  assert.strictEqual(out.status, 'value');
  assert.strictEqual(out.value, 45);
  assert.strictEqual(out.text, 'fünfundvierzig');
});

test('what was heard also starts at from', () => {
  assert.strictEqual(
    choose([seg(true, 'keine ahnung'), seg(false, 'fünf')], { from: 1 }).heard, 'fünf');
});

test('a number in a skipped segment is not graded', () => {
  // The old utterance held the answer to the PREVIOUS question. Grading it
  // would answer the new question with the old words.
  assert.strictEqual(choose([seg(true, 'fünfundvierzig'), seg(true, 'weiß nicht')],
                            { from: 1 }).status, 'none');
});

test('from beyond the last segment grades nothing', () => {
  assert.strictEqual(choose([seg(true, 'fünfundvierzig')], { from: 1 }).status, 'pending');
  assert.strictEqual(choose([seg(true, 'fünfundvierzig')], { from: 9 }).status, 'pending');
});

test('a broken from heals to the beginning', () => {
  // Never to "everything skipped": that would swallow a correct answer in
  // silence, and the deadline would grade the card wrong.
  for (const bad of [undefined, null, -3, NaN, 'zwei', {}]) {
    assert.strictEqual(choose([seg(true, 'fünfundvierzig')], { from: bad }).value, 45,
                       'from=' + String(bad));
  }
});

test('assumeFinal applies to the segments from from on', () => {
  const out = choose([seg(true, 'vier'), seg(false, 'fünfundvierzig')],
                     { from: 1, assumeFinal: true });
  assert.strictEqual(out.status, 'value');
  assert.strictEqual(out.value, 45);
});

/* ---------- what an utterance reported on has used up ---------- */

// Which segments are used up is a decision of its own, and getting it wrong
// costs the correct answer. Measured against the real recogniser on 1x1:
// „And“ → „And I“ → „I“ → „1“ → „eins“, all of it in segment 0. The settle
// deadline finalised „I“ by force, found no number in it and marked the
// segment used up — so the „eins“ that arrived in that very slot a moment
// later was cut away by `from`. The child was told "not understood" for an
// answer it had given correctly. Only a final segment is beyond revision.

test('a final segment is used up', () => {
  assert.strictEqual(ML.consumedSegments([seg(true, 'keine ahnung')], 0), 1);
});

test('an interim segment is not used up — the recogniser may still revise it', () => {
  assert.strictEqual(ML.consumedSegments([seg(false, 'I')], 0), 0);
});

test('the revision of an interim segment reported on stays gradable', () => {
  // The exact sequence from the log: reported on „I“ without a number, then
  // the same slot turns into the correct „eins“.
  const consumed = ML.consumedSegments([seg(false, 'I')], 0);
  const out = ML.chooseSpokenAnswer([seg(true, 'eins')],
                                    { expected: 1, lang: 'de', from: consumed });
  assert.strictEqual(out.status, 'value');
  assert.strictEqual(out.value, 1);
});

test('everything up to the last final segment is used up', () => {
  // The recogniser finalises in order: an interim segment in front of a final
  // one will not be revised any more.
  assert.strictEqual(
    ML.consumedSegments([seg(true, 'äh'), seg(false, 'ja'), seg(true, 'nein')], 0), 3);
  assert.strictEqual(
    ML.consumedSegments([seg(true, 'äh'), seg(true, 'ja'), seg(false, 'fünf')], 0), 2);
});

test('what was used up never becomes available again', () => {
  // A recogniser that takes a segment back must not be able to hand the
  // previous utterance to the current question a second time.
  assert.strictEqual(ML.consumedSegments([seg(false, 'fünfundvierzig')], 2), 2);
  assert.strictEqual(ML.consumedSegments([], 3), 3);
});

test('a broken previous value heals to what is final, not to "everything"', () => {
  for (const bad of [undefined, null, -3, NaN, 'zwei', {}]) {
    assert.strictEqual(ML.consumedSegments([seg(true, 'vier'), seg(false, 'fünf')], bad), 1,
                       'previous=' + String(bad));
  }
});

test('without segments nothing is used up', () => {
  assert.strictEqual(ML.consumedSegments([], 0), 0);
  assert.strictEqual(ML.consumedSegments(null, 0), 0);
  assert.strictEqual(ML.consumedSegments(undefined, 0), 0);
});
