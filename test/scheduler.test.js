const { test } = require('node:test');
const assert = require('node:assert');
const ML = require('../logic.js');

const T = ML.DEFAULT_THRESHOLD_MS; // 3000
const NOW = 1_000_000_000_000;

function grade(card, correct, elapsedMs, now = NOW) {
  return ML.gradeAnswer(card, { correct, elapsedMs, thresholdMs: T, now });
}

function masteredCard(refreshLevel = 0) {
  return { ...ML.newCard(), box: ML.BOX_MASTERED, refreshLevel, due: NOW - 1000 };
}

test('a card key is built and taken apart again', () => {
  assert.strictEqual(ML.cardKey(7, 8), '7x8');
  assert.deepStrictEqual(ML.parseCardKey('7x8'), { a: 7, b: 8 });
  assert.deepStrictEqual(ML.parseCardKey('10x10'), { a: 10, b: 10 });
});

test('the pool holds 100 cards, commutative pairs kept apart', () => {
  assert.strictEqual(ML.ALL_CARD_KEYS.length, 100);
  assert.ok(ML.ALL_CARD_KEYS.includes('7x8'));
  assert.ok(ML.ALL_CARD_KEYS.includes('8x7'));
  assert.strictEqual(new Set(ML.ALL_CARD_KEYS).size, 100, 'no duplicates');
});

test('a new card starts in box 0 without statistics', () => {
  assert.deepStrictEqual(ML.newCard(), {
    box: 0, due: 0, refreshLevel: 0,
    seen: 0, correct: 0, bestMs: null, lastMs: null
  });
});

test('a hit pushes the card up one box', () => {
  const c = grade(ML.newCard(), true, 2000);
  assert.strictEqual(c.box, 1);
  assert.strictEqual(c.seen, 1);
  assert.strictEqual(c.correct, 1);
});

test('correct but too slow leaves the box where it is', () => {
  const start = { ...ML.newCard(), box: 1 };
  const c = grade(start, true, 5000);
  assert.strictEqual(c.box, 1, 'no progress');
  assert.strictEqual(c.correct, 1, 'still counts as correct');
});

test('wrong throws the card back to box 0', () => {
  const start = { ...ML.newCard(), box: 2 };
  const c = grade(start, false, 1000);
  assert.strictEqual(c.box, 0);
  assert.strictEqual(c.correct, 0);
  assert.strictEqual(c.seen, 1);
});

test('exactly on the threshold still counts as a hit', () => {
  assert.strictEqual(grade(ML.newCard(), true, T).box, 1);
  assert.strictEqual(grade(ML.newCard(), true, T + 1).box, 0);
});

test('three hits master a card and set the due date', () => {
  let c = ML.newCard();
  c = grade(c, true, 1000); assert.strictEqual(c.box, 1);
  c = grade(c, true, 1000); assert.strictEqual(c.box, 2);
  c = grade(c, true, 1000);
  assert.strictEqual(c.box, ML.BOX_MASTERED);
  assert.strictEqual(c.refreshLevel, 0);
  assert.strictEqual(c.due, NOW + ML.REFRESH_INTERVALS_MS[0], 'first refresh after 2 days');
});

test('bestMs counts correct answers only, lastMs counts every one', () => {
  let c = grade(ML.newCard(), true, 2500);
  assert.strictEqual(c.bestMs, 2500);
  assert.strictEqual(c.lastMs, 2500);
  c = grade(c, false, 400);
  assert.strictEqual(c.bestMs, 2500, 'a fast wrong answer is not a best time');
  assert.strictEqual(c.lastMs, 400);
  c = grade(c, true, 1200);
  assert.strictEqual(c.bestMs, 1200);
});

test('gradeAnswer does not mutate the card handed to it', () => {
  const original = ML.newCard();
  const snapshot = { ...original };
  grade(original, true, 1000);
  assert.deepStrictEqual(original, snapshot);
});

test('a successful refresh stretches the interval 2 -> 7 -> 30 days', () => {
  let c = grade(masteredCard(0), true, 1000);
  assert.strictEqual(c.box, ML.BOX_MASTERED);
  assert.strictEqual(c.refreshLevel, 1);
  assert.strictEqual(c.due, NOW + ML.REFRESH_INTERVALS_MS[1], '7 days');

  c = grade({ ...c, due: NOW - 1000 }, true, 1000);
  assert.strictEqual(c.refreshLevel, 2);
  assert.strictEqual(c.due, NOW + ML.REFRESH_INTERVALS_MS[2], '30 days');

  c = grade({ ...c, due: NOW - 1000 }, true, 1000);
  assert.strictEqual(c.refreshLevel, 3);
  assert.strictEqual(c.due, NOW + ML.REFRESH_INTERVALS_MS[2], 'stays at 30 days');
});

test('a slow refresh stays mastered and repeats the same interval', () => {
  const c = grade(masteredCard(1), true, 9000);
  assert.strictEqual(c.box, ML.BOX_MASTERED);
  assert.strictEqual(c.refreshLevel, 1, 'no step up');
  assert.strictEqual(c.due, NOW + ML.REFRESH_INTERVALS_MS[1], 'the same interval again');
});

test('a botched refresh resets the card completely', () => {
  const c = grade(masteredCard(2), false, 1000);
  assert.strictEqual(c.box, 0);
  assert.strictEqual(c.refreshLevel, 0);
  assert.strictEqual(c.due, 0);
});

function cardsFrom(spec) {
  // spec: { "1x1": 0, "2x2": 3, ... }  value = box
  const cards = {};
  for (const [key, box] of Object.entries(spec)) {
    cards[key] = { ...ML.newCard(), box };
  }
  return cards;
}

function pick(cards, over = {}) {
  return ML.pickNext(cards, {
    now: NOW, recent: [], answered: 0, refreshesShown: 0,
    rng: () => 0, ...over
  });
}

test('picks from the learning phase and ignores mastered cards', () => {
  const cards = cardsFrom({ '1x1': ML.BOX_MASTERED, '2x2': 1 });
  cards['1x1'].due = NOW + ML.DAY_MS; // not due
  assert.strictEqual(pick(cards), '2x2');
});

test('box weights 3/2/1 define the hit ranges', () => {
  // Key order: 1x1 (box 0, weight 3), 2x2 (box 1, weight 2),
  // 3x3 (box 2, weight 1). Sum 6.
  const cards = cardsFrom({ '1x1': 0, '2x2': 1, '3x3': 2 });
  const at = (r) => pick(cards, { rng: () => r });
  assert.strictEqual(at(0.0), '1x1');
  assert.strictEqual(at(0.49), '1x1');  // share 0   to 3/6
  assert.strictEqual(at(0.5), '2x2');   // share 3/6 to 5/6
  assert.strictEqual(at(0.8), '2x2');
  assert.strictEqual(at(0.9), '3x3');   // share 5/6 to 1
  assert.strictEqual(at(0.999), '3x3');
});

test('the last three cards are skipped', () => {
  const cards = cardsFrom({ '1x1': 0, '2x2': 0, '3x3': 0, '4x4': 0 });
  const got = pick(cards, { recent: ['1x1', '2x2', '3x3'] });
  assert.strictEqual(got, '4x4');
});

test('with too small a pool the repetition block does not apply', () => {
  const cards = cardsFrom({ '1x1': 0 });
  assert.strictEqual(pick(cards, { recent: ['1x1'] }), '1x1');
});

test('RECENT_MEMORY is 3 and BOX_WEIGHTS are 3/2/1', () => {
  assert.strictEqual(ML.RECENT_MEMORY, 3);
  assert.deepStrictEqual(ML.BOX_WEIGHTS, [3, 2, 1]);
});

function dueRefresh(cards, key, dueAt) {
  cards[key] = { ...ML.newCard(), box: ML.BOX_MASTERED, due: dueAt };
  return cards;
}

test('a due refresh takes precedence as long as the quota allows it', () => {
  const cards = dueRefresh(cardsFrom({ '2x2': 0 }), '1x1', NOW - 1000);
  assert.strictEqual(pick(cards, { answered: 0, refreshesShown: 0 }), '1x1');
});

test('mastered cards that are not due are not asked', () => {
  const cards = dueRefresh(cardsFrom({ '2x2': 0 }), '1x1', NOW + ML.DAY_MS);
  assert.strictEqual(pick(cards, { answered: 0, refreshesShown: 0 }), '2x2');
});

test('the quota lets at most every fifth question be a refresh', () => {
  const cards = dueRefresh(cardsFrom({ '2x2': 0 }), '1x1', NOW - 1000);
  // One refresh has already been shown: no further one until the 5th answer.
  assert.strictEqual(pick(cards, { answered: 1, refreshesShown: 1 }), '2x2');
  assert.strictEqual(pick(cards, { answered: 4, refreshesShown: 1 }), '2x2');
  assert.strictEqual(pick(cards, { answered: 5, refreshesShown: 1 }), '1x1');
});

test('without learning cards the refresh is asked even against the quota', () => {
  const cards = dueRefresh({}, '1x1', NOW - 1000);
  assert.strictEqual(pick(cards, { answered: 1, refreshesShown: 1 }), '1x1');
});

test('a refresh just asked is not repeated immediately', () => {
  const cards = dueRefresh(cardsFrom({ '2x2': 0 }), '1x1', NOW - 1000);
  assert.strictEqual(pick(cards, { recent: ['1x1'] }), '2x2', 'falls back to the learning card');
});

test('without learning cards the refresh is asked despite recency', () => {
  const cards = dueRefresh({}, '1x1', NOW - 1000);
  assert.strictEqual(pick(cards, { recent: ['1x1'] }), '1x1');
});

test('the most overdue card comes first', () => {
  let cards = dueRefresh({}, '1x1', NOW - 1000);
  cards = dueRefresh(cards, '2x2', NOW - 90000);
  assert.strictEqual(pick(cards), '2x2');
});

test('everything mastered and nothing due yields null', () => {
  const cards = dueRefresh({}, '1x1', NOW + ML.DAY_MS);
  assert.strictEqual(pick(cards), null);
});

test('REFRESH_EVERY is 5', () => {
  assert.strictEqual(ML.REFRESH_EVERY, 5);
});


test('cards outside the selected rows are never picked', () => {
  const cards = cardsFrom({ '1x1': 0, '3x3': 0, '3x10': 0 });
  for (const rng of [0, 0.3, 0.6, 0.99]) {
    assert.strictEqual(pick(cards, { rows: [3], rng: () => rng }), '3x3');
  }
});

test('without a selection the whole pool is in play', () => {
  const cards = cardsFrom({ '1x1': 0 });
  assert.strictEqual(pick(cards), '1x1');
  assert.strictEqual(pick(cards, { rows: undefined }), '1x1');
});

test('a due refresh outside the selected rows is not shown', () => {
  const cards = cardsFrom({ '3x3': 0 });
  dueRefresh(cards, '1x10', NOW - 1000);
  assert.strictEqual(pick(cards, { rows: [3], answered: 100 }), '3x3');
});

test('all selected cards mastered means there is nothing left to ask', () => {
  const cards = cardsFrom({ '3x3': ML.BOX_MASTERED, '1x1': 0 });
  cards['3x3'].due = NOW + ML.DAY_MS;
  assert.strictEqual(pick(cards, { rows: [3] }), null);
});
