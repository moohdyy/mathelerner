const { test } = require('node:test');
const assert = require('node:assert');
const ML = require('../logic.js');

test('recognises digits', () => {
  assert.strictEqual(ML.parseNumber('48', 'de'), 48);
  assert.strictEqual(ML.parseNumber('0', 'de'), 0);
  assert.strictEqual(ML.parseNumber('100', 'de'), 100);
});

test('recognises simple number words', () => {
  assert.strictEqual(ML.parseNumber('null', 'de'), 0);
  assert.strictEqual(ML.parseNumber('eins', 'de'), 1);
  assert.strictEqual(ML.parseNumber('ein', 'de'), 1);
  assert.strictEqual(ML.parseNumber('sieben', 'de'), 7);
  assert.strictEqual(ML.parseNumber('zehn', 'de'), 10);
  assert.strictEqual(ML.parseNumber('zwölf', 'de'), 12);
  assert.strictEqual(ML.parseNumber('sechzehn', 'de'), 16);
  assert.strictEqual(ML.parseNumber('siebzehn', 'de'), 17);
  assert.strictEqual(ML.parseNumber('dreißig', 'de'), 30);
  assert.strictEqual(ML.parseNumber('sechzig', 'de'), 60);
  assert.strictEqual(ML.parseNumber('achtundvierzig', 'de'), 48);
  assert.strictEqual(ML.parseNumber('hundert', 'de'), 100);
  assert.strictEqual(ML.parseNumber('einhundert', 'de'), 100);
  assert.strictEqual(ML.parseNumber('hundertfünf', 'de'), 105);
  assert.strictEqual(ML.parseNumber('einhundertfünf', 'de'), 105);
  assert.strictEqual(ML.parseNumber('hundertdreiundzwanzig', 'de'), 123);
  assert.strictEqual(ML.parseNumber('zwei hundert drei und vierzig', 'de'), 243);
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
    assert.strictEqual(ML.parseNumber(word, 'de'), n, `${n} -> "${word}"`);
  }
});

test('tolerates punctuation, capitalisation and embedding', () => {
  assert.strictEqual(ML.parseNumber('Achtundvierzig.', 'de'), 48);
  assert.strictEqual(ML.parseNumber('  ACHTUNDVIERZIG  ', 'de'), 48);
  assert.strictEqual(ML.parseNumber('acht und vierzig', 'de'), 48);
  assert.strictEqual(ML.parseNumber('das ist achtundvierzig', 'de'), 48);
  assert.strictEqual(ML.parseNumber('ich glaube acht und vierzig', 'de'), 48);
  assert.strictEqual(ML.parseNumber('das ist 48!', 'de'), 48);
});

test('knows the frequent misrecognition "zwo"', () => {
  assert.strictEqual(ML.parseNumber('zwo', 'de'), 2);
});

test('returns null when no number is contained', () => {
  assert.strictEqual(ML.parseNumber('keine Ahnung', 'de'), null);
  assert.strictEqual(ML.parseNumber('weiß nicht', 'de'), null);
  assert.strictEqual(ML.parseNumber('', 'de'), null);
  assert.strictEqual(ML.parseNumber(null, 'de'), null);
  assert.strictEqual(ML.parseNumber('einigermaßen', 'de'), null);
  assert.strictEqual(ML.parseNumber('eine Katze', 'de'), null);
});

test('recognises every number in a sentence', () => {
  assert.deepStrictEqual(ML.parseNumbers('sechs mal sieben ist zweiundvierzig', 'de'), [6, 7, 42]);
  assert.deepStrictEqual(ML.parseNumbers('8 mal 6 ist 48', 'de'), [8, 6, 48]);
  assert.deepStrictEqual(ML.parseNumbers('achtundvierzig', 'de'), [48]);
  assert.deepStrictEqual(ML.parseNumbers('keine Ahnung', 'de'), []);
  assert.deepStrictEqual(ML.parseNumbers('', 'de'), []);
  assert.deepStrictEqual(ML.parseNumbers(null, 'de'), []);
});

test('the whole sum spoken aloud yields the result as the last number', () => {
  // That is the most natural answer of a child when the question was read out
  // loud. Previously the first operand was taken from it.
  for (let a = 1; a <= 10; a++) {
    for (let b = 1; b <= 10; b++) {
      const sentence =
        `${ML._spellGerman(a)} mal ${ML._spellGerman(b)} ist ${ML._spellGerman(a * b)}`;
      const numbers = ML.parseNumbers(sentence, 'de');
      assert.strictEqual(numbers[numbers.length - 1], a * b, sentence);
    }
  }
});

test('spoken question: a leading 1 becomes „ein"', () => {
  assert.strictEqual(ML.spokenQuestion(1, 3, 'de'), 'ein mal 3');
  assert.strictEqual(ML.spokenQuestion(1, 10, 'de'), 'ein mal 10');
});

test('spoken question: the second factor is left alone', () => {
  // „drei mal eins" is correct German — the digit stays at the end and the
  // engine reads it as „eins" all by itself.
  assert.strictEqual(ML.spokenQuestion(3, 1, 'de'), '3 mal 1');
  assert.strictEqual(ML.spokenQuestion(1, 1, 'de'), 'ein mal 1');
});

test('spoken question: unremarkable cases stay digits', () => {
  assert.strictEqual(ML.spokenQuestion(7, 8, 'de'), '7 mal 8');
  assert.strictEqual(ML.spokenQuestion(2, 9, 'de'), '2 mal 9');
  assert.strictEqual(ML.spokenQuestion(10, 10, 'de'), '10 mal 10');
});

test('German stays intact: "und" is not a filler word', () => {
  // The English pack drops "and" before joining. Were that rule global,
  // "acht und vierzig" would join to "achtvierzig", match nothing and fall
  // apart into 8 and 40.
  assert.strictEqual(ML.parseNumber('acht und vierzig', 'de'), 48);
  assert.deepStrictEqual(ML.parseNumbers('acht und vierzig', 'de'), [48]);
});

test('English number words, written as one word', () => {
  assert.strictEqual(ML.parseNumber('fortyeight', 'en'), 48);
  assert.strictEqual(ML.parseNumber('twelve', 'en'), 12);
  assert.strictEqual(ML.parseNumber('seventy', 'en'), 70);
});

test('English number words with a hyphen', () => {
  assert.strictEqual(ML.parseNumber('forty-eight', 'en'), 48);
  assert.strictEqual(ML.parseNumber('twenty-one', 'en'), 21);
});

test('English number words split over several words', () => {
  assert.strictEqual(ML.parseNumber('forty eight', 'en'), 48);
  assert.strictEqual(ML.parseNumber('one hundred', 'en'), 100);
  assert.strictEqual(ML.parseNumber('one hundred five', 'en'), 105);
});

test('English drops "and" inside a number', () => {
  assert.strictEqual(ML.parseNumber('one hundred and five', 'en'), 105);
  assert.strictEqual(ML.parseNumber('one hundred and forty-eight', 'en'), 148);
});

test('English: the longest match wins', () => {
  // Not 8 followed by 40.
  assert.deepStrictEqual(ML.parseNumbers('forty eight', 'en'), [48]);
  assert.deepStrictEqual(ML.parseNumbers('sixteen', 'en'), [16]);
});

test('English finds every number in an utterance', () => {
  assert.deepStrictEqual(ML.parseNumbers('maybe twelve or twenty-four', 'en'), [12, 24]);
});

test('digits win in every language', () => {
  assert.strictEqual(ML.parseNumber('is it 48?', 'en'), 48);
  assert.deepStrictEqual(ML.parseNumbers('12 or 24', 'en'), [12, 24]);
});

test('English: hesitation is not a number', () => {
  // "a" and "oh" are deliberately not in the table — otherwise the first
  // number found would be 0 or 1 and the card would be graded on a hesitation.
  assert.strictEqual(ML.parseNumber('oh, twenty-four', 'en'), 24);
  assert.strictEqual(ML.parseNumber('maybe a moment', 'en'), null);
  assert.strictEqual(ML.parseNumber('erm', 'en'), null);
});

test('an unknown language parses with the default pack', () => {
  assert.strictEqual(ML.parseNumber('achtundvierzig', 'fr'), 48);
});

test('spokenQuestion depends on the language', () => {
  assert.strictEqual(ML.spokenQuestion(1, 3, 'de'), 'ein mal 3');
  assert.strictEqual(ML.spokenQuestion(3, 1, 'de'), '3 mal 1');
  assert.strictEqual(ML.spokenQuestion(1, 3, 'en'), '1 times 3');
  assert.strictEqual(ML.spokenQuestion(7, 8, 'en'), '7 times 8');
});

test('spellEnglish produces the forms the table is built from', () => {
  assert.strictEqual(ML._spellEnglish(48), 'forty-eight');
  assert.strictEqual(ML._spellEnglish(105), 'one hundred five');
  assert.strictEqual(ML._spellEnglish(100), 'one hundred');
  assert.strictEqual(ML._spellEnglish(0), 'zero');
});
