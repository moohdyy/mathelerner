const { test } = require('node:test');
const assert = require('node:assert');
const ML = require('../logic.js');

test('recognises digits', () => {
  assert.strictEqual(ML.parseGermanNumber('48'), 48);
  assert.strictEqual(ML.parseGermanNumber('0'), 0);
  assert.strictEqual(ML.parseGermanNumber('100'), 100);
});

test('recognises simple number words', () => {
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

test('no word stands for two different numbers', () => {
  // Guards the generated table against collisions.
  const seen = new Map();
  for (let n = 0; n <= 999; n++) {
    const w = ML._spellGerman(n);
    assert.ok(!seen.has(w), `"${w}" stands for ${seen.get(w)} and ${n}`);
    seen.set(w, n);
  }
});

test('recognises every number from 0 to 999 in its word form', () => {
  // Counter-check on the generated table: every number must return itself.
  for (let n = 0; n <= 999; n++) {
    const word = ML._spellGerman(n);
    assert.strictEqual(ML.parseGermanNumber(word), n, `${n} -> "${word}"`);
  }
});

test('tolerates punctuation, capitalisation and embedding', () => {
  assert.strictEqual(ML.parseGermanNumber('Achtundvierzig.'), 48);
  assert.strictEqual(ML.parseGermanNumber('  ACHTUNDVIERZIG  '), 48);
  assert.strictEqual(ML.parseGermanNumber('acht und vierzig'), 48);
  assert.strictEqual(ML.parseGermanNumber('das ist achtundvierzig'), 48);
  assert.strictEqual(ML.parseGermanNumber('ich glaube acht und vierzig'), 48);
  assert.strictEqual(ML.parseGermanNumber('das ist 48!'), 48);
});

test('knows the frequent misrecognition "zwo"', () => {
  assert.strictEqual(ML.parseGermanNumber('zwo'), 2);
});

test('returns null when no number is contained', () => {
  assert.strictEqual(ML.parseGermanNumber('keine Ahnung'), null);
  assert.strictEqual(ML.parseGermanNumber('weiß nicht'), null);
  assert.strictEqual(ML.parseGermanNumber(''), null);
  assert.strictEqual(ML.parseGermanNumber(null), null);
  assert.strictEqual(ML.parseGermanNumber('einigermaßen'), null);
  assert.strictEqual(ML.parseGermanNumber('eine Katze'), null);
});

test('recognises every number in a sentence', () => {
  assert.deepStrictEqual(ML.parseGermanNumbers('sechs mal sieben ist zweiundvierzig'), [6, 7, 42]);
  assert.deepStrictEqual(ML.parseGermanNumbers('8 mal 6 ist 48'), [8, 6, 48]);
  assert.deepStrictEqual(ML.parseGermanNumbers('achtundvierzig'), [48]);
  assert.deepStrictEqual(ML.parseGermanNumbers('keine Ahnung'), []);
  assert.deepStrictEqual(ML.parseGermanNumbers(''), []);
  assert.deepStrictEqual(ML.parseGermanNumbers(null), []);
});

test('the whole sum spoken aloud yields the result as the last number', () => {
  // That is the most natural answer of a child when the question was read out
  // loud. Previously the first operand was taken from it.
  for (let a = 1; a <= 10; a++) {
    for (let b = 1; b <= 10; b++) {
      const sentence =
        `${ML._spellGerman(a)} mal ${ML._spellGerman(b)} ist ${ML._spellGerman(a * b)}`;
      const numbers = ML.parseGermanNumbers(sentence);
      assert.strictEqual(numbers[numbers.length - 1], a * b, sentence);
    }
  }
});

test('spoken question: a leading 1 becomes „ein"', () => {
  assert.strictEqual(ML.spokenQuestion(1, 3), 'ein mal 3');
  assert.strictEqual(ML.spokenQuestion(1, 10), 'ein mal 10');
});

test('spoken question: the second factor is left alone', () => {
  // „drei mal eins" is correct German — the digit stays at the end and the
  // engine reads it as „eins" all by itself.
  assert.strictEqual(ML.spokenQuestion(3, 1), '3 mal 1');
  assert.strictEqual(ML.spokenQuestion(1, 1), 'ein mal 1');
});

test('spoken question: unremarkable cases stay digits', () => {
  assert.strictEqual(ML.spokenQuestion(7, 8), '7 mal 8');
  assert.strictEqual(ML.spokenQuestion(2, 9), '2 mal 9');
  assert.strictEqual(ML.spokenQuestion(10, 10), '10 mal 10');
});
