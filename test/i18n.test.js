const test = require('node:test');
const assert = require('node:assert');
const ML = require('../logic.js');

// Collects all leaf text keys of a pack. A value is either a string or an
// object of plural forms; only the top level carries keys.
function keysOf(lang) {
  return Object.keys(ML.locale(lang).texts).sort();
}

function placeholdersOf(value) {
  const found = new Set();
  const collect = (s) => {
    const m = String(s).match(/\{(\w+)\}/g) || [];
    m.forEach((p) => found.add(p));
  };
  if (typeof value === 'object') Object.keys(value).forEach((f) => collect(value[f]));
  else collect(value);
  return [...found].sort();
}

test('every language is reachable through LANGUAGES', () => {
  assert.deepStrictEqual(ML.LANGUAGES.map((l) => l.id), ['de', 'en']);
  ML.LANGUAGES.forEach((l) => {
    assert.strictEqual(typeof l.label, 'string');
    assert.ok(l.label.length > 0);
  });
});

test('every pack carries the same text keys as the default language', () => {
  const reference = keysOf(ML.DEFAULT_LANGUAGE);
  ML.LANGUAGES.forEach((l) => {
    assert.deepStrictEqual(keysOf(l.id), reference,
      'pack ' + l.id + ' does not match the key set of ' + ML.DEFAULT_LANGUAGE);
  });
});

test('every pack carries every required field', () => {
  ML.LANGUAGES.forEach((l) => {
    const pack = ML.locale(l.id);
    ML.REQUIRED_LOCALE_FIELDS.forEach((field) => {
      assert.ok(pack[field] !== undefined && pack[field] !== null,
        'pack ' + l.id + ' is missing ' + field);
    });
    assert.strictEqual(typeof pack.spell, 'function');
    assert.strictEqual(typeof pack.plural, 'function');
    assert.strictEqual(typeof pack.spokenQuestion, 'function');
    assert.ok(Array.isArray(pack.fillerWords));
  });
});

test('translations keep the placeholders of the default language', () => {
  const reference = ML.locale(ML.DEFAULT_LANGUAGE).texts;
  ML.LANGUAGES.forEach((l) => {
    const texts = ML.locale(l.id).texts;
    Object.keys(reference).forEach((key) => {
      assert.deepStrictEqual(placeholdersOf(texts[key]), placeholdersOf(reference[key]),
        'placeholders differ in ' + l.id + ' for ' + key);
    });
  });
});

test('plural values carry the forms the pack asks for', () => {
  ML.LANGUAGES.forEach((l) => {
    const pack = ML.locale(l.id);
    Object.keys(pack.texts).forEach((key) => {
      const value = pack.texts[key];
      if (typeof value !== 'object') return;
      [0, 1, 2, 11, 100].forEach((n) => {
        const form = pack.plural(n);
        assert.strictEqual(typeof value[form], 'string',
          'pack ' + l.id + ', key ' + key + ' has no form ' + form);
      });
    });
  });
});

test('resolveLanguage reduces a tag to a known language', () => {
  assert.strictEqual(ML.resolveLanguage('de'), 'de');
  assert.strictEqual(ML.resolveLanguage('de-AT'), 'de');
  assert.strictEqual(ML.resolveLanguage('en-GB'), 'en');
  assert.strictEqual(ML.resolveLanguage('EN-us'), 'en');
  assert.strictEqual(ML.resolveLanguage('fr-FR'), 'de');
  assert.strictEqual(ML.resolveLanguage('nonsense'), 'de');
  assert.strictEqual(ML.resolveLanguage(''), 'de');
  assert.strictEqual(ML.resolveLanguage(null), 'de');
  assert.strictEqual(ML.resolveLanguage(undefined), 'de');
});

test('locale falls back to the default pack', () => {
  assert.strictEqual(ML.locale('fr').id, ML.DEFAULT_LANGUAGE);
  assert.strictEqual(ML.locale(null).id, ML.DEFAULT_LANGUAGE);
});

test('t replaces placeholders', () => {
  assert.strictEqual(ML.t('de', 'card.score', { correct: 3, seen: 4 }), '3 von 4 richtig');
  assert.strictEqual(ML.t('en', 'card.score', { correct: 3, seen: 4 }), '3 of 4 correct');
});

test('t picks the plural form from n', () => {
  assert.strictEqual(ML.t('de', 'card.refreshIn', { n: 1 }), 'Auffrischung in 1 Tag');
  assert.strictEqual(ML.t('de', 'card.refreshIn', { n: 3 }), 'Auffrischung in 3 Tagen');
  assert.strictEqual(ML.t('en', 'card.refreshIn', { n: 1 }), 'refresher in 1 day');
  assert.strictEqual(ML.t('en', 'card.refreshIn', { n: 3 }), 'refresher in 3 days');
});

test('t never throws — an unknown key becomes its own name', () => {
  assert.strictEqual(ML.t('de', 'no.such.key'), 'no.such.key');
  assert.strictEqual(ML.t('fr', 'box.name.0'), ML.t('de', 'box.name.0'));
});

test('t leaves an unfilled placeholder visible instead of printing undefined', () => {
  assert.strictEqual(ML.t('de', 'card.score', {}), '{correct} von {seen} richtig');
});
