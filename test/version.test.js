const test = require('node:test');
const assert = require('node:assert');
const ML = require('../logic.js');

test('the version is exported as MAJOR.MINOR.PATCH', () => {
  assert.match(ML.VERSION, /^\d+\.\d+\.\d+$/);
});

test('every pack renders the version line with the number filled in', () => {
  ML.LANGUAGE_ORDER.forEach((lang) => {
    const line = ML.t(lang, 'menu.version', { version: ML.VERSION });
    assert.ok(line.includes(ML.VERSION), lang + ': version missing in "' + line + '"');
    assert.ok(!line.includes('{'), lang + ': placeholder left in "' + line + '"');
  });
});
