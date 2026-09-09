const test = require('node:test');
const assert = require('node:assert');
const ML = require('../logic.js');

/* Die zweistufige Uhr: Zeitschwelle → Kulanz → Gesamtfrist.
   Geprüft wird ausschließlich die reine Logik; das Zeichnen liegt in
   index.html und wird im Browser gemessen. */

test('die Gesamtfrist ist das Dreifache der Zeitschwelle', () => {
  assert.strictEqual(ML.ZEIT_FRIST_FAKTOR, 3);
  assert.strictEqual(ML.gesamtfristMs(3000), 9000);
  assert.strictEqual(ML.gesamtfristMs(1500), 4500);
});

test('die Gesamtfrist im Sprachmodus rechnet den Bonus mit', () => {
  const schwelle = ML.DEFAULT_THRESHOLD_MS + ML.STT_THRESHOLD_BONUS_MS;
  assert.strictEqual(ML.gesamtfristMs(schwelle), 12000);
});

test('bis zur Zeitschwelle gilt schnell — die Grenze gehört noch dazu', () => {
  assert.strictEqual(ML.zeitPhase(0, 3000), ML.ZEIT_SCHNELL);
  assert.strictEqual(ML.zeitPhase(2999, 3000), ML.ZEIT_SCHNELL);
  // gradeAnswer wertet mit `<=`; die Anzeige muss dieselbe Grenze ziehen,
  // sonst zeigt sie Kulanz an, während die Karte noch steigt.
  assert.strictEqual(ML.zeitPhase(3000, 3000), ML.ZEIT_SCHNELL);
});

test('zwischen Schwelle und Gesamtfrist gilt Kulanz', () => {
  assert.strictEqual(ML.zeitPhase(3001, 3000), ML.ZEIT_KULANZ);
  assert.strictEqual(ML.zeitPhase(6000, 3000), ML.ZEIT_KULANZ);
  assert.strictEqual(ML.zeitPhase(8999, 3000), ML.ZEIT_KULANZ);
});

test('ab der Gesamtfrist gilt abgelaufen', () => {
  assert.strictEqual(ML.zeitPhase(9000, 3000), ML.ZEIT_ABGELAUFEN);
  assert.strictEqual(ML.zeitPhase(60000, 3000), ML.ZEIT_ABGELAUFEN);
});

test('eine unbrauchbare Schwelle läuft nie ab', () => {
  // Fällt die Schwelle je auf 0, NaN oder negativ, darf daraus niemals ein
  // Timeout werden — das kostete eine Karte ohne jedes Zutun des Kindes.
  for (const kaputt of [0, -1, NaN, null, undefined, 'x']) {
    assert.strictEqual(ML.zeitPhase(999999, kaputt), ML.ZEIT_SCHNELL);
    assert.strictEqual(ML.gesamtfristMs(kaputt), 0);
  }
});

test('negative oder unsinnige verstrichene Zeit gilt als Beginn', () => {
  assert.strictEqual(ML.zeitPhase(-500, 3000), ML.ZEIT_SCHNELL);
  assert.strictEqual(ML.zeitPhase(NaN, 3000), ML.ZEIT_SCHNELL);
  assert.strictEqual(ML.zeitAnzeige(-500, 3000).anteil, 1);
});

test('zeitAnzeige liefert den verbleibenden Anteil der Gesamtfrist', () => {
  assert.strictEqual(ML.zeitAnzeige(0, 3000).anteil, 1);
  assert.strictEqual(ML.zeitAnzeige(4500, 3000).anteil, 0.5);
  assert.strictEqual(ML.zeitAnzeige(9000, 3000).anteil, 0);
  assert.strictEqual(ML.zeitAnzeige(20000, 3000).anteil, 0);
});

test('die Marke steht dort, wo die Kulanz beginnt', () => {
  const a = ML.zeitAnzeige(0, 3000);
  assert.ok(Math.abs(a.schwellenAnteil - 2 / 3) < 1e-9);
  // Genau beim Erreichen der Schwelle steht der Balken auf der Marke.
  const b = ML.zeitAnzeige(3000, 3000);
  assert.ok(Math.abs(b.anteil - a.schwellenAnteil) < 1e-9);
});

test('zeitAnzeige nennt Restzeit, Gesamtfrist und Phase zusammen', () => {
  const a = ML.zeitAnzeige(5000, 4000);
  assert.strictEqual(a.gesamtMs, 12000);
  assert.strictEqual(a.restMs, 7000);
  assert.strictEqual(a.phase, ML.ZEIT_KULANZ);
  assert.strictEqual(ML.zeitAnzeige(99999, 4000).restMs, 0);
});

test('die Kulanzphase ändert an gradeAnswer nichts: kein Rückschritt', () => {
  // Der Timer darf die Spec-Regel nicht aushebeln. Eine richtige Antwort in
  // der Kulanz lässt die Karte stehen — kein Fortschritt, kein Rückschritt.
  const karte = { box: 2, due: 0, refreshLevel: 0, seen: 4, correct: 3,
                  bestMs: 2500, lastMs: 2500 };
  const kulanz = 6000;
  assert.strictEqual(ML.zeitPhase(kulanz, 3000), ML.ZEIT_KULANZ);
  const danach = ML.gradeAnswer(karte, {
    correct: true, elapsedMs: kulanz, thresholdMs: 3000, now: 1000
  });
  assert.strictEqual(danach.box, 2);
});
