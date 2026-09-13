const { test } = require('node:test');
const assert = require('node:assert');
const ML = require('../logic.js');

test('there are ten rows and a set of hard ones for the quick choice', () => {
  assert.deepStrictEqual(ML.ALL_ROWS, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepStrictEqual(ML.HARD_ROWS, [3, 4, 6, 7, 8, 9]);
});

test('a missing or broken selection heals to all rows', () => {
  for (const broken of [undefined, null, 'alle', {}, [], [0], [11], ['x'], [2.5], [NaN]]) {
    assert.deepStrictEqual(ML.normalizeRows(broken), ML.ALL_ROWS,
      'broken value: ' + JSON.stringify(broken));
  }
});

test('a selection is sorted, deduplicated and stripped of nonsense', () => {
  assert.deepStrictEqual(ML.normalizeRows([7, 3, 7, 0, 11, 3]), [3, 7]);
  assert.deepStrictEqual(ML.normalizeRows(['7', 3]), [3, 7], 'digit strings count');
});

test('normalizeRows never hands back the caller its own array', () => {
  const rows = [3, 4];
  assert.notStrictEqual(ML.normalizeRows(rows), rows);
  assert.notStrictEqual(ML.normalizeRows(undefined), ML.ALL_ROWS, 'no reference to the constant');
});

test('a card is asked only when both of its factors are selected', () => {
  assert.ok(!ML.cardSelected(7, 3, [7]), 'the three is switched off, so 7x3 is out');
  assert.ok(ML.cardSelected(7, 3, [3, 7]));
  assert.ok(!ML.cardSelected(3, 4, [7]));
});

test('both directions are treated alike', () => {
  assert.strictEqual(ML.cardSelected(7, 3, [3, 7]), ML.cardSelected(3, 7, [3, 7]));
  assert.strictEqual(ML.cardSelected(7, 10, [3, 7]), ML.cardSelected(10, 7, [3, 7]));
});

test('dropping the ones and the tens leaves 64 of the 100 cards', () => {
  const rows = [2, 3, 4, 5, 6, 7, 8, 9];
  assert.strictEqual(ML.selectedCardKeys(rows).length, 64);
  assert.ok(!ML.selectedCardKeys(rows).includes('3x10'));
  assert.ok(!ML.selectedCardKeys(rows).includes('1x8'));
});

test('the selected keys keep the order of the full pool', () => {
  const keys = ML.selectedCardKeys([3, 7]);
  assert.deepStrictEqual(keys, ['3x3', '3x7', '7x3', '7x7']);
});

test('a single row leaves its square alone', () => {
  assert.deepStrictEqual(ML.selectedCardKeys([7]), ['7x7']);
});

test('the hard rows are 36 of the 100 cards', () => {
  assert.strictEqual(ML.selectedCardKeys(ML.HARD_ROWS).length, 36);
});

test('a broken selection selects every card instead of none', () => {
  assert.strictEqual(ML.selectedCardKeys(undefined).length, 100);
  assert.strictEqual(ML.selectedCardKeys([]).length, 100);
});

test('toggling adds a row and removes it again', () => {
  assert.deepStrictEqual(ML.toggleRow([3, 7], 5), [3, 5, 7]);
  assert.deepStrictEqual(ML.toggleRow([3, 5, 7], 5), [3, 7]);
});

test('the last row cannot be switched off — there would be nothing to ask', () => {
  assert.deepStrictEqual(ML.toggleRow([4], 4), [4]);
});

test('toggling an impossible row changes nothing', () => {
  assert.deepStrictEqual(ML.toggleRow([3, 7], 11), [3, 7]);
  assert.deepStrictEqual(ML.toggleRow([3, 7], 0), [3, 7]);
});

test('toggling leaves the given selection untouched', () => {
  const rows = [3, 7];
  ML.toggleRow(rows, 5);
  assert.deepStrictEqual(rows, [3, 7]);
});
