const { test } = require('node:test');
const assert = require('node:assert');
const ML = require('../logic.js');

const NOW = 1_700_000_000_000;

// A profile with nothing but fresh cards; individual ones are changed on purpose.
function profile(changes = {}) {
  const p = ML.newProfile('Test', NOW);
  for (const [key, values] of Object.entries(changes)) {
    Object.assign(p.cards[key], values);
  }
  return p;
}

test('the boxes have names, the index is the box number', () => {
  assert.deepStrictEqual(ML.BOX_NAMES, ['neu', 'geübt', 'fast sicher', 'gemeistert']);
  assert.strictEqual(ML.BOX_NAMES[ML.BOX_MASTERED], 'gemeistert');
});

test('a fresh profile has all 100 cards in box 0', () => {
  assert.deepStrictEqual(ML.boxDistribution(profile()), [100, 0, 0, 0]);
});

test('the distribution counts every box separately and adds up to 100', () => {
  const p = profile({
    '1x1': { box: 1 }, '1x2': { box: 1 }, '1x3': { box: 2 },
    '7x8': { box: 3, due: NOW + ML.DAY_MS }
  });
  const v = ML.boxDistribution(p);
  assert.deepStrictEqual(v, [96, 2, 1, 1]);
  assert.strictEqual(v.reduce((a, b) => a + b, 0), 100);
});

test('the distribution survives broken box values instead of blowing up the display', () => {
  const p = profile({ '2x2': { box: 99 }, '2x3': { box: -4 }, '2x4': { box: null } });
  const v = ML.boxDistribution(p);
  assert.deepStrictEqual(v, [99, 0, 0, 1]);
});

test('timeText writes German, with one decimal place', () => {
  assert.strictEqual(ML.timeText(2400), '2,4 s');
  assert.strictEqual(ML.timeText(0), '0,0 s');
  assert.strictEqual(ML.timeText(-500), '0,0 s'); // never a negative time
  assert.strictEqual(ML.timeText(null), null);
  assert.strictEqual(ML.timeText(undefined), null);
});

test('only mastered cards have a refresh date', () => {
  for (const box of [0, 1, 2]) {
    const card = { ...ML.newCard(), box, due: NOW + ML.DAY_MS };
    assert.strictEqual(ML.refreshText(card, NOW), null);
  }
});

test('the refresh date is rounded up to whole days', () => {
  const card = (due) => ({ ...ML.newCard(), box: 3, due });
  assert.strictEqual(
    ML.refreshText(card(NOW + 2 * ML.DAY_MS), NOW), 'Auffrischung in 2 Tagen');
  assert.strictEqual(
    ML.refreshText(card(NOW + 30 * ML.DAY_MS), NOW), 'Auffrischung in 30 Tagen');
  // singular when less than a day is left
  assert.strictEqual(
    ML.refreshText(card(NOW + 3600000), NOW), 'Auffrischung in 1 Tag');
  // rounded up: 1.2 days are not yet 2 days, but are called „in 2 Tagen“
  assert.strictEqual(
    ML.refreshText(card(NOW + 1.2 * ML.DAY_MS), NOW), 'Auffrischung in 2 Tagen');
});

test('an overdue refresh is due, without a date', () => {
  const card = { ...ML.newCard(), box: 3, due: NOW - ML.DAY_MS };
  assert.strictEqual(ML.refreshText(card, NOW), 'Auffrischung fällig');
  assert.strictEqual(ML.refreshText({ ...card, due: NOW }, NOW), 'Auffrischung fällig');
  // mastered without a date: claim nothing
  assert.strictEqual(ML.refreshText({ ...card, due: 0 }, NOW), null);
});

test('the score names correct and asked answers', () => {
  assert.strictEqual(ML.scoreText({ ...ML.newCard() }), 'noch nicht drangekommen');
  assert.strictEqual(ML.scoreText({ ...ML.newCard(), seen: 7, correct: 5 }), '5 von 7 richtig');
});

test('an untouched card is described as new', () => {
  const v = ML.cardView(ML.newCard(), '7x8', NOW);
  assert.strictEqual(v.a, 7);
  assert.strictEqual(v.b, 8);
  assert.strictEqual(v.box, 0);
  assert.strictEqual(v.name, 'neu');
  assert.strictEqual(v.refreshDue, false);
  assert.strictEqual(v.description, '7 × 8 · neu (Box 0) · noch nicht drangekommen');
});

test('the description names time, score and refresh', () => {
  const card = { box: 3, due: NOW + 7 * ML.DAY_MS, refreshLevel: 1,
                 seen: 4, correct: 4, bestMs: 1800, lastMs: 2100 };
  assert.strictEqual(
    ML.cardView(card, '9x6', NOW).description,
    '9 × 6 · gemeistert (Box 3) · beste Zeit 1,8 s · 4 von 4 richtig · Auffrischung in 7 Tagen');
});

test('a due mastered card is marked as due', () => {
  const card = { box: 3, due: NOW - 1, refreshLevel: 0,
                 seen: 3, correct: 3, bestMs: 2000, lastMs: 2000 };
  const v = ML.cardView(card, '3x4', NOW);
  assert.strictEqual(v.refreshDue, true);
  assert.match(v.description, /Auffrischung fällig$/);
});

test('the grid always has exactly 100 cards in a fixed order', () => {
  const list = ML.cardViews(profile(), NOW);
  assert.strictEqual(list.length, 100);
  assert.deepStrictEqual(list.map((v) => v.key), ML.ALL_CARD_KEYS);
  assert.strictEqual(list[0].key, '1x1');
  assert.strictEqual(list[99].key, '10x10');
});

test('a missing card does not tear a hole into the grid', () => {
  const p = profile();
  delete p.cards['5x5'];
  const list = ML.cardViews(p, NOW);
  assert.strictEqual(list.length, 100);
  const missing = list.find((v) => v.key === '5x5');
  assert.strictEqual(missing.box, 0);
  assert.strictEqual(missing.description, '5 × 5 · neu (Box 0) · noch nicht drangekommen');
});

test('7x8 and 8x7 are separate cards and may stand separately', () => {
  const p = profile({ '7x8': { box: 3, due: NOW + ML.DAY_MS }, '8x7': { box: 0 } });
  const list = ML.cardViews(p, NOW);
  assert.strictEqual(list.find((v) => v.key === '7x8').name, 'gemeistert');
  assert.strictEqual(list.find((v) => v.key === '8x7').name, 'neu');
});

test('the display only reads — gradeAnswer stays the only place that grades', () => {
  const p = profile({ '6x6': { box: 2, seen: 3, correct: 3, bestMs: 2500 } });
  const before = JSON.stringify(p);
  ML.cardViews(p, NOW);
  ML.boxDistribution(p);
  assert.strictEqual(JSON.stringify(p), before);
});
