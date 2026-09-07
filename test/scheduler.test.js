const { test } = require('node:test');
const assert = require('node:assert');
const ML = require('../logic.js');

test('Kartenschlüssel wird gebildet und wieder zerlegt', () => {
  assert.strictEqual(ML.cardKey(7, 8), '7x8');
  assert.deepStrictEqual(ML.parseCardKey('7x8'), { a: 7, b: 8 });
  assert.deepStrictEqual(ML.parseCardKey('10x10'), { a: 10, b: 10 });
});

test('der Pool umfasst 100 Karten, kommutativ getrennt', () => {
  assert.strictEqual(ML.ALL_CARD_KEYS.length, 100);
  assert.ok(ML.ALL_CARD_KEYS.includes('7x8'));
  assert.ok(ML.ALL_CARD_KEYS.includes('8x7'));
  assert.strictEqual(new Set(ML.ALL_CARD_KEYS).size, 100, 'keine Duplikate');
});

test('eine neue Karte startet in Box 0 ohne Statistik', () => {
  assert.deepStrictEqual(ML.newCard(), {
    box: 0, due: 0, refreshLevel: 0,
    seen: 0, correct: 0, bestMs: null, lastMs: null
  });
});
