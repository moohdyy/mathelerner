const { test } = require('node:test');
const assert = require('node:assert');
const ML = require('../logic.js');

const JETZT = 1_700_000_000_000;

// Ein Profil mit lauter frischen Karten; einzelne werden gezielt umgesetzt.
function profil(aenderungen = {}) {
  const p = ML.newProfile('Test', JETZT);
  for (const [key, werte] of Object.entries(aenderungen)) {
    Object.assign(p.cards[key], werte);
  }
  return p;
}

test('die Boxen heißen beim Namen, Index ist die Boxnummer', () => {
  assert.deepStrictEqual(ML.BOX_NAMEN, ['neu', 'geübt', 'fast sicher', 'gemeistert']);
  assert.strictEqual(ML.BOX_NAMEN[ML.BOX_MASTERED], 'gemeistert');
});

test('ein frisches Profil hat alle 100 Karten in Box 0', () => {
  assert.deepStrictEqual(ML.boxVerteilung(profil()), [100, 0, 0, 0]);
});

test('die Verteilung zählt jede Box einzeln und ergibt zusammen 100', () => {
  const p = profil({
    '1x1': { box: 1 }, '1x2': { box: 1 }, '1x3': { box: 2 },
    '7x8': { box: 3, due: JETZT + ML.DAY_MS }
  });
  const v = ML.boxVerteilung(p);
  assert.deepStrictEqual(v, [96, 2, 1, 1]);
  assert.strictEqual(v.reduce((a, b) => a + b, 0), 100);
});

test('die Verteilung überlebt kaputte Boxwerte, statt die Anzeige zu sprengen', () => {
  const p = profil({ '2x2': { box: 99 }, '2x3': { box: -4 }, '2x4': { box: null } });
  const v = ML.boxVerteilung(p);
  assert.deepStrictEqual(v, [99, 0, 0, 1]);
});

test('zeitText schreibt deutsch, mit einer Nachkommastelle', () => {
  assert.strictEqual(ML.zeitText(2400), '2,4 s');
  assert.strictEqual(ML.zeitText(0), '0,0 s');
  assert.strictEqual(ML.zeitText(-500), '0,0 s'); // nie eine negative Zeit
  assert.strictEqual(ML.zeitText(null), null);
  assert.strictEqual(ML.zeitText(undefined), null);
});

test('nur gemeisterte Karten haben einen Auffrischungstermin', () => {
  for (const box of [0, 1, 2]) {
    const card = { ...ML.newCard(), box, due: JETZT + ML.DAY_MS };
    assert.strictEqual(ML.auffrischungText(card, JETZT), null);
  }
});

test('der Auffrischungstermin wird auf ganze Tage aufgerundet', () => {
  const card = (due) => ({ ...ML.newCard(), box: 3, due });
  assert.strictEqual(
    ML.auffrischungText(card(JETZT + 2 * ML.DAY_MS), JETZT), 'Auffrischung in 2 Tagen');
  assert.strictEqual(
    ML.auffrischungText(card(JETZT + 30 * ML.DAY_MS), JETZT), 'Auffrischung in 30 Tagen');
  // Einzahl, wenn weniger als ein Tag übrig ist
  assert.strictEqual(
    ML.auffrischungText(card(JETZT + 3600000), JETZT), 'Auffrischung in 1 Tag');
  // aufgerundet: 1,2 Tage sind noch nicht 2 Tage, heißen aber „in 2 Tagen“
  assert.strictEqual(
    ML.auffrischungText(card(JETZT + 1.2 * ML.DAY_MS), JETZT), 'Auffrischung in 2 Tagen');
});

test('eine überfällige Auffrischung ist fällig, keine Terminangabe', () => {
  const card = { ...ML.newCard(), box: 3, due: JETZT - ML.DAY_MS };
  assert.strictEqual(ML.auffrischungText(card, JETZT), 'Auffrischung fällig');
  assert.strictEqual(ML.auffrischungText({ ...card, due: JETZT }, JETZT), 'Auffrischung fällig');
  // gemeistert ohne Termin: nichts behaupten
  assert.strictEqual(ML.auffrischungText({ ...card, due: 0 }, JETZT), null);
});

test('die Trefferquote nennt richtige und gestellte Antworten', () => {
  assert.strictEqual(ML.trefferText({ ...ML.newCard() }), 'noch nicht drangekommen');
  assert.strictEqual(ML.trefferText({ ...ML.newCard(), seen: 7, correct: 5 }), '5 von 7 richtig');
});

test('eine unangetastete Karte wird als neu beschrieben', () => {
  const v = ML.kartenAnsicht(ML.newCard(), '7x8', JETZT);
  assert.strictEqual(v.a, 7);
  assert.strictEqual(v.b, 8);
  assert.strictEqual(v.box, 0);
  assert.strictEqual(v.name, 'neu');
  assert.strictEqual(v.faellig, false);
  assert.strictEqual(v.beschreibung, '7 × 8 · neu (Box 0) · noch nicht drangekommen');
});

test('die Beschreibung nennt Zeit, Quote und Auffrischung', () => {
  const card = { box: 3, due: JETZT + 7 * ML.DAY_MS, refreshLevel: 1,
                 seen: 4, correct: 4, bestMs: 1800, lastMs: 2100 };
  assert.strictEqual(
    ML.kartenAnsicht(card, '9x6', JETZT).beschreibung,
    '9 × 6 · gemeistert (Box 3) · beste Zeit 1,8 s · 4 von 4 richtig · Auffrischung in 7 Tagen');
});

test('eine fällige gemeisterte Karte ist als fällig markiert', () => {
  const card = { box: 3, due: JETZT - 1, refreshLevel: 0,
                 seen: 3, correct: 3, bestMs: 2000, lastMs: 2000 };
  const v = ML.kartenAnsicht(card, '3x4', JETZT);
  assert.strictEqual(v.faellig, true);
  assert.match(v.beschreibung, /Auffrischung fällig$/);
});

test('das Raster hat immer genau 100 Karten in fester Reihenfolge', () => {
  const liste = ML.kartenAnsichten(profil(), JETZT);
  assert.strictEqual(liste.length, 100);
  assert.deepStrictEqual(liste.map((v) => v.key), ML.ALL_CARD_KEYS);
  assert.strictEqual(liste[0].key, '1x1');
  assert.strictEqual(liste[99].key, '10x10');
});

test('eine fehlende Karte reißt kein Loch ins Raster', () => {
  const p = profil();
  delete p.cards['5x5'];
  const liste = ML.kartenAnsichten(p, JETZT);
  assert.strictEqual(liste.length, 100);
  const fehlend = liste.find((v) => v.key === '5x5');
  assert.strictEqual(fehlend.box, 0);
  assert.strictEqual(fehlend.beschreibung, '5 × 5 · neu (Box 0) · noch nicht drangekommen');
});

test('7x8 und 8x7 sind getrennte Karten und können getrennt stehen', () => {
  const p = profil({ '7x8': { box: 3, due: JETZT + ML.DAY_MS }, '8x7': { box: 0 } });
  const liste = ML.kartenAnsichten(p, JETZT);
  assert.strictEqual(liste.find((v) => v.key === '7x8').name, 'gemeistert');
  assert.strictEqual(liste.find((v) => v.key === '8x7').name, 'neu');
});

test('die Anzeige liest nur — gradeAnswer bleibt die einzige Stelle, die wertet', () => {
  const p = profil({ '6x6': { box: 2, seen: 3, correct: 3, bestMs: 2500 } });
  const vorher = JSON.stringify(p);
  ML.kartenAnsichten(p, JETZT);
  ML.boxVerteilung(p);
  assert.strictEqual(JSON.stringify(p), vorher);
});
