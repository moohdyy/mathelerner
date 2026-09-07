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

test('Treffer schiebt die Karte eine Box hoch', () => {
  const c = grade(ML.newCard(), true, 2000);
  assert.strictEqual(c.box, 1);
  assert.strictEqual(c.seen, 1);
  assert.strictEqual(c.correct, 1);
});

test('richtig aber zu langsam lässt die Box stehen', () => {
  const start = { ...ML.newCard(), box: 1 };
  const c = grade(start, true, 5000);
  assert.strictEqual(c.box, 1, 'kein Fortschritt');
  assert.strictEqual(c.correct, 1, 'zählt trotzdem als richtig');
});

test('falsch wirft die Karte auf Box 0 zurück', () => {
  const start = { ...ML.newCard(), box: 2 };
  const c = grade(start, false, 1000);
  assert.strictEqual(c.box, 0);
  assert.strictEqual(c.correct, 0);
  assert.strictEqual(c.seen, 1);
});

test('genau an der Schwelle zählt noch als Treffer', () => {
  assert.strictEqual(grade(ML.newCard(), true, T).box, 1);
  assert.strictEqual(grade(ML.newCard(), true, T + 1).box, 0);
});

test('drei Treffer machen eine Karte gemeistert und setzen die Fälligkeit', () => {
  let c = ML.newCard();
  c = grade(c, true, 1000); assert.strictEqual(c.box, 1);
  c = grade(c, true, 1000); assert.strictEqual(c.box, 2);
  c = grade(c, true, 1000);
  assert.strictEqual(c.box, ML.BOX_MASTERED);
  assert.strictEqual(c.refreshLevel, 0);
  assert.strictEqual(c.due, NOW + ML.REFRESH_INTERVALS_MS[0], 'erste Auffrischung nach 2 Tagen');
});

test('bestMs zählt nur richtige Antworten, lastMs jede', () => {
  let c = grade(ML.newCard(), true, 2500);
  assert.strictEqual(c.bestMs, 2500);
  assert.strictEqual(c.lastMs, 2500);
  c = grade(c, false, 400);
  assert.strictEqual(c.bestMs, 2500, 'schnelle falsche Antwort ist keine Bestzeit');
  assert.strictEqual(c.lastMs, 400);
  c = grade(c, true, 1200);
  assert.strictEqual(c.bestMs, 1200);
});

test('gradeAnswer mutiert die übergebene Karte nicht', () => {
  const original = ML.newCard();
  const snapshot = { ...original };
  grade(original, true, 1000);
  assert.deepStrictEqual(original, snapshot);
});

test('erfolgreiche Auffrischung verlängert das Intervall 2 -> 7 -> 30 Tage', () => {
  let c = grade(masteredCard(0), true, 1000);
  assert.strictEqual(c.box, ML.BOX_MASTERED);
  assert.strictEqual(c.refreshLevel, 1);
  assert.strictEqual(c.due, NOW + ML.REFRESH_INTERVALS_MS[1], '7 Tage');

  c = grade({ ...c, due: NOW - 1000 }, true, 1000);
  assert.strictEqual(c.refreshLevel, 2);
  assert.strictEqual(c.due, NOW + ML.REFRESH_INTERVALS_MS[2], '30 Tage');

  c = grade({ ...c, due: NOW - 1000 }, true, 1000);
  assert.strictEqual(c.refreshLevel, 3);
  assert.strictEqual(c.due, NOW + ML.REFRESH_INTERVALS_MS[2], 'bleibt bei 30 Tagen');
});

test('langsame Auffrischung bleibt gemeistert und wiederholt dasselbe Intervall', () => {
  const c = grade(masteredCard(1), true, 9000);
  assert.strictEqual(c.box, ML.BOX_MASTERED);
  assert.strictEqual(c.refreshLevel, 1, 'kein Aufstieg');
  assert.strictEqual(c.due, NOW + ML.REFRESH_INTERVALS_MS[1], 'dasselbe Intervall erneut');
});

test('verpatzte Auffrischung setzt die Karte komplett zurück', () => {
  const c = grade(masteredCard(2), false, 1000);
  assert.strictEqual(c.box, 0);
  assert.strictEqual(c.refreshLevel, 0);
  assert.strictEqual(c.due, 0);
});

function cardsFrom(spec) {
  // spec: { "1x1": 0, "2x2": 3, ... }  Wert = Box
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

test('wählt aus der Lernphase und ignoriert gemeisterte Karten', () => {
  const cards = cardsFrom({ '1x1': ML.BOX_MASTERED, '2x2': 1 });
  cards['1x1'].due = NOW + ML.DAY_MS; // nicht fällig
  assert.strictEqual(pick(cards), '2x2');
});

test('Box-Gewichte 3/2/1 bestimmen die Trefferbereiche', () => {
  // Reihenfolge der Schlüssel: 1x1 (Box 0, Gewicht 3),
  // 2x2 (Box 1, Gewicht 2), 3x3 (Box 2, Gewicht 1). Summe 6.
  const cards = cardsFrom({ '1x1': 0, '2x2': 1, '3x3': 2 });
  const at = (r) => pick(cards, { rng: () => r });
  assert.strictEqual(at(0.0), '1x1');
  assert.strictEqual(at(0.49), '1x1');  // Anteil 0   bis 3/6
  assert.strictEqual(at(0.5), '2x2');   // Anteil 3/6 bis 5/6
  assert.strictEqual(at(0.8), '2x2');
  assert.strictEqual(at(0.9), '3x3');   // Anteil 5/6 bis 1
  assert.strictEqual(at(0.999), '3x3');
});

test('die letzten drei Karten werden übersprungen', () => {
  const cards = cardsFrom({ '1x1': 0, '2x2': 0, '3x3': 0, '4x4': 0 });
  const got = pick(cards, { recent: ['1x1', '2x2', '3x3'] });
  assert.strictEqual(got, '4x4');
});

test('bei zu kleinem Pool greift die Wiederholungssperre nicht', () => {
  const cards = cardsFrom({ '1x1': 0 });
  assert.strictEqual(pick(cards, { recent: ['1x1'] }), '1x1');
});

test('RECENT_MEMORY ist 3 und BOX_WEIGHTS sind 3/2/1', () => {
  assert.strictEqual(ML.RECENT_MEMORY, 3);
  assert.deepStrictEqual(ML.BOX_WEIGHTS, [3, 2, 1]);
});
