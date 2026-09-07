const { test } = require('node:test');
const assert = require('node:assert');
const ML = require('../logic.js');

test('erkennt Ziffernform', () => {
  assert.strictEqual(ML.parseGermanNumber('48'), 48);
  assert.strictEqual(ML.parseGermanNumber('0'), 0);
  assert.strictEqual(ML.parseGermanNumber('100'), 100);
});

test('erkennt einfache Zahlwörter', () => {
  assert.strictEqual(ML.parseGermanNumber('null'), 0);
  assert.strictEqual(ML.parseGermanNumber('eins'), 1);
  assert.strictEqual(ML.parseGermanNumber('ein'), 1);
  assert.strictEqual(ML.parseGermanNumber('sieben'), 7);
  assert.strictEqual(ML.parseGermanNumber('zehn'), 10);
  assert.strictEqual(ML.parseGermanNumber('zwölf'), 12);
  assert.strictEqual(ML.parseGermanNumber('sechzehn'), 16);
  assert.strictEqual(ML.parseGermanNumber('siebzehn'), 17);
  assert.strictEqual(ML.parseGermanNumber('dreißig'), 30);
  assert.strictEqual(ML.parseGermanNumber('sechzig'), 60);
  assert.strictEqual(ML.parseGermanNumber('achtundvierzig'), 48);
  assert.strictEqual(ML.parseGermanNumber('hundert'), 100);
  assert.strictEqual(ML.parseGermanNumber('einhundert'), 100);
  assert.strictEqual(ML.parseGermanNumber('hundertfünf'), 105);
  assert.strictEqual(ML.parseGermanNumber('einhundertfünf'), 105);
  assert.strictEqual(ML.parseGermanNumber('hundertdreiundzwanzig'), 123);
  assert.strictEqual(ML.parseGermanNumber('zwei hundert drei und vierzig'), 243);
});

test('kein Wort steht für zwei verschiedene Zahlen', () => {
  // Absicherung der generativen Tabelle gegen Kollisionen.
  const seen = new Map();
  for (let n = 0; n <= 999; n++) {
    const w = ML._spellGerman(n);
    assert.ok(!seen.has(w), `"${w}" steht für ${seen.get(w)} und ${n}`);
    seen.set(w, n);
  }
});

test('erkennt jede Zahl von 0 bis 999 in ihrer Wortform', () => {
  // Gegenprobe zur generativen Tabelle: jede Zahl muss sich selbst zurückliefern.
  for (let n = 0; n <= 999; n++) {
    const word = ML._spellGerman(n);
    assert.strictEqual(ML.parseGermanNumber(word), n, `${n} -> "${word}"`);
  }
});

test('toleriert Satzzeichen, Großschreibung und Einbettung', () => {
  assert.strictEqual(ML.parseGermanNumber('Achtundvierzig.'), 48);
  assert.strictEqual(ML.parseGermanNumber('  ACHTUNDVIERZIG  '), 48);
  assert.strictEqual(ML.parseGermanNumber('acht und vierzig'), 48);
  assert.strictEqual(ML.parseGermanNumber('das ist achtundvierzig'), 48);
  assert.strictEqual(ML.parseGermanNumber('ich glaube acht und vierzig'), 48);
  assert.strictEqual(ML.parseGermanNumber('das ist 48!'), 48);
});

test('kennt die häufige Fehlerkennung "zwo"', () => {
  assert.strictEqual(ML.parseGermanNumber('zwo'), 2);
});

test('liefert null, wenn keine Zahl enthalten ist', () => {
  assert.strictEqual(ML.parseGermanNumber('keine Ahnung'), null);
  assert.strictEqual(ML.parseGermanNumber('weiß nicht'), null);
  assert.strictEqual(ML.parseGermanNumber(''), null);
  assert.strictEqual(ML.parseGermanNumber(null), null);
  assert.strictEqual(ML.parseGermanNumber('einigermaßen'), null);
});
