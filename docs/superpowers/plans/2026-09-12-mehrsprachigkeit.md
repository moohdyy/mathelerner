# Mehrsprachigkeit — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Sprache der Oberfläche, der Sprachausgabe und der Spracherkennung wird eine Profileinstellung; Deutsch und Englisch sind verfügbar, weitere Sprachen brauchen nur ein neues Paket in `logic.js`.

**Architecture:** Alles Sprachliche zieht in Sprachpakete (`LOCALES`) in `logic.js` — Oberflächentexte, Zahlwörter des Parsers, Sprachcode für TTS/STT, Pluralregel, Dezimalzeichen. Ein Übersetzer `ML.t(lang, key, params)` löst Schlüssel auf; jede Funktion, die Text erzeugt, bekommt die Sprache hineingereicht, genau wie heute `now`, `rng` und das Storage-Objekt. `index.html` hält nur noch Schlüssel, keine deutschen Texte.

**Tech Stack:** Reines ES5-taugliches JavaScript ohne Abhängigkeit, UMD-Hülle, `node --test` als Testrunner, Python-HTTP-Server zum Ausprobieren.

**Spec:** `docs/superpowers/specs/2026-09-11-mehrsprachigkeit-design.md`

## Global Constraints

- **Keine neue Abhängigkeit, keine `package.json`, kein Build-Schritt, kein Linter** — auch keine Entwicklungsabhängigkeit.
- **Genau zwei ausgelieferte Dateien:** `logic.js` und `index.html` im Wurzelverzeichnis. Keine dritte.
- **`logic.js` fasst niemals `window`, `document`, `localStorage`, `Date.now()` oder `Math.random()` an.** Einzige Ausnahme: `typeof self !== 'undefined' ? self : this` in der UMD-Hülle.
- **`logic.js` bleibt CommonJS-kompatibel** — kein `import`/`export`, sonst brechen die Tests.
- **Der Code ist Englisch, die sichtbaren Texte sind Deutsch bzw. Englisch.** Bezeichner, Kommentare, Testnamen, CSS-Klassen, DOM-IDs und Konsolenausgaben: Englisch. Die deutschen Texte tragen echte Umlaute und ß — `ae`/`oe`/`ue`/`ss` sind ein Verstoß.
- **`STATE_VERSION` bleibt `1`.** Ein Versionssprung verwirft in `loadState` alle bestehenden Profile und damit den gesamten Lernfortschritt.
- **Vorgabesprache ist `'de'`** (`ML.DEFAULT_LANGUAGE`). Die englische Variante ist genau eine: `en-US`.
- **Tests laufen mit `node --test`** (nackter Aufruf, ohne Verzeichnisangabe — `node --test test/` bricht mit `MODULE_NOT_FOUND` ab). Einzelne Dateien nur mit vollem Pfad: `node --test test/parser.test.js`.
- **Kein Erkennungsfehler und kein Sprachwechsel darf eine Karte werten.**
- Gearbeitet wird in einem eigenen Worktree (`superpowers:using-git-worktrees`).

---

## Dateiübersicht

| Datei | Verantwortung | Änderung |
|---|---|---|
| `logic.js` | reine Logik; neu: Abschnitt 0 „languages" mit `LOCALES`, Übersetzer, Zahlwort-Funktionen | ändern |
| `index.html` | Markup, Styles, DOM-/Sprach-/Ereignisanbindung; hält nur noch i18n-Schlüssel | ändern |
| `test/i18n.test.js` | Vollständigkeit und Struktur der Pakete, `t`, `resolveLanguage`, Plural | **neu** |
| `test/parser.test.js` | Zahlwörter beider Sprachen | ändern |
| `test/progress.test.js` | Anzeigetexte beider Sprachen | ändern |
| `test/storage.test.js` | `settings.lang`, Heilung, Erhalt alter Stände | ändern |
| `README.md`, `CLAUDE.md` | Sprachwahl dokumentieren | ändern |

`logic.js` wird nicht aufgeteilt: die Zwei-Dateien-Vorgabe ist ausdrücklich Entwurf, nicht Zufall.

---

### Task 1: Sprachpakete und Übersetzer

**Files:**
- Modify: `logic.js` (neuer Abschnitt direkt nach `'use strict';`, vor „Section 1 — number parser"; Export-Objekt am Ende)
- Test: `test/i18n.test.js` (neu)

**Interfaces:**
- Consumes: nichts
- Produces:
  - `ML.DEFAULT_LANGUAGE` → `'de'`
  - `ML.LANGUAGES` → `[{ id: 'de', label: 'Deutsch' }, { id: 'en', label: 'English' }]`
  - `ML.locale(lang)` → Paketobjekt mit `id, label, htmlLang, speechLang, decimal, spell, extraWords, extraForms?, fillerWords, plural, spokenQuestion, texts`; unbekannte Sprache liefert das deutsche Paket
  - `ML.resolveLanguage(tag)` → `'de' | 'en'`
  - `ML.t(lang, key, params)` → String; unbekannter Schlüssel liefert den Schlüsselnamen
  - `ML.REQUIRED_LOCALE_FIELDS` → Array der Pflichtfeldnamen (für den Strukturtest)

In diesem Task enthält `texts` nur die Schlüssel, die `logic.js` selbst braucht. Die Oberflächenschlüssel kommen in Task 5 dazu.

- [ ] **Step 1: Den Test schreiben**

`test/i18n.test.js` neu anlegen:

```js
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
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `node --test test/i18n.test.js`
Expected: FAIL — `ML.locale is not a function`

- [ ] **Step 3: Den Abschnitt in `logic.js` schreiben**

Direkt nach `'use strict';` einfügen — **vor** „Section 1 — number parser", weil der Parser in Task 2 auf die Pakete zugreift. Die bestehenden Abschnittsnummern bleiben, wie sie sind; der neue heißt „Section 0".

```js
  /* ===================================================================
     Section 0 — languages
     ===================================================================

     Everything language-specific lives in a pack here, and nothing
     language-specific lives outside one. A pack holds the visible texts, the
     number words the parser needs, the speech tag for synthesis and
     recognition, the plural rule and the decimal separator.

     `spell` and `spokenQuestion` are functions rather than data on purpose:
     German composition ("achtundvierzig") and the German special case
     "ein mal drei" cannot be expressed as a table.

     Adding a language means adding one object here plus its id in
     LANGUAGE_ORDER. index.html is not touched for that — if it has to be,
     the separation is incomplete at that spot and belongs fixed. */

  var DEFAULT_LANGUAGE = 'de';

  var REQUIRED_LOCALE_FIELDS = ['id', 'label', 'htmlLang', 'speechLang', 'decimal',
                                'spell', 'extraWords', 'fillerWords', 'plural',
                                'spokenQuestion', 'texts'];

  // Two forms are enough for German and English. A language that needs more
  // brings its own selector in its pack.
  function pluralOneOther(n) { return n === 1 ? 'one' : 'other'; }
```

Die deutschen Zahlwort-Funktionen (`ONES`, `TEENS`, `TENS`, `spellBelow100`, `spellGerman`) bleiben, wo sie sind — in Abschnitt 1, also **hinter** diesem neuen Abschnitt. Das deutsche Paket greift trotzdem darauf zu: Funktionsdeklarationen werden im Modulabschluss hochgezogen, und `spell` wird ohnehin erst beim Parsen gerufen. Im deutschen Paket steht der Zugriff dennoch als Wrapper (`function (n) { return spellGerman(n); }`) und nicht als nackte Referenz — so ist die Richtung der Abhängigkeit beim Lesen sichtbar.

Die englischen Zahlwörter gehören dagegen in diesen Abschnitt, weil sie außer vom Paket von nichts gebraucht werden:

```js
  var EN_ONES = ['zero', 'one', 'two', 'three', 'four',
                 'five', 'six', 'seven', 'eight', 'nine'];
  var EN_TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
                  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  var EN_TENS = ['', '', 'twenty', 'thirty', 'forty',
                 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function spellEnglishBelow100(n) {
    if (n < 10) return EN_ONES[n];
    if (n < 20) return EN_TEENS[n - 10];
    var t = Math.floor(n / 10), o = n % 10;
    return o === 0 ? EN_TENS[t] : EN_TENS[t] + '-' + EN_ONES[o];
  }

  // The hyphen and the space survive only until normalizeWord runs over it;
  // both spellings therefore end up as the same table key.
  function spellEnglish(n) {
    if (n < 100) return spellEnglishBelow100(n);
    var h = Math.floor(n / 100), r = n % 100;
    return EN_ONES[h] + ' hundred' + (r === 0 ? '' : ' ' + spellEnglishBelow100(r));
  }

  var LOCALES = {

    de: {
      id: 'de',
      label: 'Deutsch',
      htmlLang: 'de',
      speechLang: 'de-DE',
      decimal: ',',
      spell: function (n) { return spellGerman(n); },
      // Forms the generated table does not produce.
      // "eine" is deliberately absent: the article hides inside hesitation
      // phrases like "vielleicht eine" and would turn those into a wrong
      // answer. Recognisers return "eins" or "1" for the number itself.
      extraWords: { eins: 1, zwo: 2 },
      // "hundertfünf" is more common than "einhundertfünf"; the generated
      // table only produces the long form.
      extraForms: function (map, norm) {
        for (var h = 100; h <= 199; h++) map[norm(spellGerman(h)).slice(3)] = h;
      },
      // "und" must NOT be dropped: "acht und vierzig" joins to
      // "achtundvierzig". Dropping it would give "achtvierzig", which is in no
      // table, and the utterance would fall apart into 8 and 40.
      fillerWords: [],
      plural: pluralOneOther,
      // The factors deliberately stay digits — that leaves the stress to the
      // engine. The only exception is a leading 1: the engine reads the digit
      // as „eins", but in German it is „ein mal drei" before the „mal". The
      // second factor is left alone, where „drei mal eins" is correct.
      spokenQuestion: function (a, b) {
        return (a === 1 ? 'ein' : String(a)) + ' mal ' + b;
      },
      texts: {
        'box.name.0': 'neu',
        'box.name.1': 'geübt',
        'box.name.2': 'fast sicher',
        'box.name.3': 'gemeistert',
        'card.box': '{name} (Box {box})',
        'card.bestTime': 'beste Zeit {time}',
        'card.notSeen': 'noch nicht drangekommen',
        'card.score': '{correct} von {seen} richtig',
        'card.refreshDue': 'Auffrischung fällig',
        'card.refreshIn': { one: 'Auffrischung in {n} Tag',
                            other: 'Auffrischung in {n} Tagen' },
        'time.seconds': '{value} s'
      }
    },

    en: {
      id: 'en',
      label: 'English',
      htmlLang: 'en',
      speechLang: 'en-US',
      decimal: '.',
      spell: spellEnglish,
      // Deliberately empty. Neither the article "a" nor the spoken "oh" for
      // zero belongs in here: both hide inside hesitation phrases ("maybe
      // a…", "oh, twenty-four"), and because parseNumber takes the FIRST
      // number found, "oh, twenty-four" would be graded as 0 and the card
      // would fall back. Hesitating must not cost a card.
      extraWords: {},
      // "one hundred and five" has to join to "onehundredfive".
      fillerWords: ['and'],
      plural: pluralOneOther,
      spokenQuestion: function (a, b) { return a + ' times ' + b; },
      texts: {
        'box.name.0': 'new',
        'box.name.1': 'practised',
        'box.name.2': 'almost solid',
        'box.name.3': 'mastered',
        'card.box': '{name} (box {box})',
        'card.bestTime': 'best time {time}',
        'card.notSeen': 'not come up yet',
        'card.score': '{correct} of {seen} correct',
        'card.refreshDue': 'refresher due',
        'card.refreshIn': { one: 'refresher in {n} day',
                            other: 'refresher in {n} days' },
        'time.seconds': '{value} s'
      }
    }
  };

  // Fixed order for the menu.
  var LANGUAGE_ORDER = ['de', 'en'];

  var LANGUAGES = LANGUAGE_ORDER.map(function (id) {
    return { id: id, label: LOCALES[id].label };
  });

  // A broken stored value must never kill the page: anything unknown gets the
  // default pack. That a translation is missing is reported by the
  // completeness test, not by an exception at runtime.
  function locale(lang) {
    return LOCALES[lang] || LOCALES[DEFAULT_LANGUAGE];
  }

  // Compares only the part before the hyphen and is therefore independent of
  // which regional variants a browser reports.
  function resolveLanguage(tag) {
    if (tag === null || tag === undefined) return DEFAULT_LANGUAGE;
    var base = String(tag).toLowerCase().split('-')[0];
    return LOCALES[base] ? base : DEFAULT_LANGUAGE;
  }

  // An unfilled placeholder stays visible. "undefined" in the middle of a
  // sentence looks like a working text and hides the mistake.
  function fillPlaceholders(template, params) {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(params, name)
        ? String(params[name]) : whole;
    });
  }

  function t(lang, key, params) {
    var loc = locale(lang);
    var value = loc.texts[key];
    if (value === undefined) return key;
    if (typeof value === 'object') {
      var n = params && params.n !== undefined ? Number(params.n) : 0;
      var form = loc.plural(n);
      value = value[form] !== undefined ? value[form] : value.other;
    }
    return fillPlaceholders(String(value), params);
  }
```

Und im Export-Objekt am Ende ergänzen:

```js
    DEFAULT_LANGUAGE: DEFAULT_LANGUAGE,
    REQUIRED_LOCALE_FIELDS: REQUIRED_LOCALE_FIELDS,
    LANGUAGES: LANGUAGES,
    locale: locale,
    resolveLanguage: resolveLanguage,
    t: t,
    _spellEnglish: spellEnglish,
```

(`_spellEnglish` mit Unterstrich wie das bestehende `_spellGerman`: nur für Tests.)

- [ ] **Step 4: Tests laufen lassen und Erfolg bestätigen**

Run: `node --test test/i18n.test.js`
Expected: PASS, jeder Test der neuen Datei

Run: `node --test`
Expected: PASS — die 90 bestehenden Tests laufen unverändert weiter, die neuen kommen dazu. Dieser Task ändert noch keine bestehende Signatur; bricht hier etwas, liegt es am neuen Abschnitt.

- [ ] **Step 5: Committen**

```bash
git add logic.js test/i18n.test.js
git commit -m "Sprachpakete und Übersetzer in logic.js"
```

---

### Task 2: Der Parser wird sprachfähig

**Files:**
- Modify: `logic.js` — Abschnitt 1 (`normalizeWord`, `WORD_TO_NUMBER`, `parseGermanNumbers`, `parseGermanNumber`, `spokenQuestion`), Export-Objekt
- Test: `test/parser.test.js`

**Interfaces:**
- Consumes: `locale(lang)` mit `spell`, `extraWords`, `extraForms`, `fillerWords`, `spokenQuestion` (Task 1)
- Produces:
  - `ML.parseNumbers(text, lang)` → Array von Zahlen, in Reihenfolge des Vorkommens
  - `ML.parseNumber(text, lang)` → erste Zahl oder `null`
  - `ML.spokenQuestion(a, b, lang)` → String
  - `ML.parseGermanNumbers` / `ML.parseGermanNumber` sind **entfernt**

- [ ] **Step 1: Die Tests schreiben**

`test/parser.test.js`: alle Aufrufe von `ML.parseGermanNumber(x)` auf `ML.parseNumber(x, 'de')` und `ML.parseGermanNumbers(x)` auf `ML.parseNumbers(x, 'de')` ziehen; `ML.spokenQuestion(a, b)` auf `ML.spokenQuestion(a, b, 'de')`. Die bestehenden Erwartungen bleiben unverändert.

Dann am Ende der Datei anfügen:

```js
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
```

- [ ] **Step 2: Tests laufen lassen und Fehlschlag bestätigen**

Run: `node --test test/parser.test.js`
Expected: FAIL — `ML.parseNumber is not a function`

- [ ] **Step 3: Den Parser umbauen**

In Abschnitt 1 von `logic.js`:

`normalizeWord` verliert seine deutsche Prägung:

```js
  // Normalisation: lowercase, ß -> ss, everything but letters and digits
  // removed. Applied identically to the input AND to the lookup table, so
  // "forty-eight", "forty eight" and "fortyeight" all end up the same. The
  // unicode classes keep the letters of every language instead of only
  // a-z plus äöü.
  function normalizeWord(s) {
    return String(s).toLowerCase().replace(/ß/g, 'ss').replace(/[^\p{L}\p{N}]/gu, '');
  }
```

`WORD_TO_NUMBER` als feste Tabelle entfällt und wird pro Paket gebaut und dort zwischengespeichert:

```js
  // The word table is built from the pack's spell() for 0-999 and cached on
  // the pack — building it costs a thousand calls and must not happen per
  // utterance.
  function numberWords(loc) {
    if (loc._words) return loc._words;
    var map = Object.create(null);
    for (var n = 0; n <= 999; n++) map[normalizeWord(loc.spell(n))] = n;
    if (typeof loc.extraForms === 'function') loc.extraForms(map, normalizeWord);
    var extra = loc.extraWords || {};
    var words = Object.keys(extra);
    for (var i = 0; i < words.length; i++) map[normalizeWord(words[i])] = extra[words[i]];
    loc._words = map;
    return map;
  }
```

`parseGermanNumbers` wird `parseNumbers(text, lang)`; nur Tabelle und Füllwörter kommen neu hinzu, der Suchlauf bleibt Zeichen für Zeichen derselbe:

```js
  function parseNumbers(text, lang) {
    if (text == null) return [];
    var loc = locale(lang);
    var raw = String(text);
    var matches = [];

    // Digits take precedence and are collected in full.
    var digits = raw.match(/\d+/g);
    if (digits) {
      for (var d = 0; d < digits.length; d++) matches.push(parseInt(digits[d], 10));
      return matches;
    }

    var table = numberWords(loc);
    var fillers = loc.fillerWords || [];
    var words = raw.split(/\s+/).map(normalizeWord).filter(function (w) {
      return w.length > 0 && fillers.indexOf(w) === -1;
    });
    var i = 0;
    while (i < words.length) {
      var best = null, bestLen = 0, joined = '';
      for (var len = 1; len <= MAX_NUMBER_WORDS && i + len <= words.length; len++) {
        joined += words[i + len - 1];
        var hit = table[joined];
        if (hit !== undefined) { best = hit; bestLen = len; }
      }
      if (best !== null) { matches.push(best); i += bestLen; }
      else i += 1;
    }
    return matches;
  }

  // The first number of the utterance — a view on parseNumbers so that there
  // is only one implementation.
  function parseNumber(text, lang) {
    var all = parseNumbers(text, lang);
    return all.length > 0 ? all[0] : null;
  }
```

`spokenQuestion` gibt die Entscheidung ans Paket ab; der lange Kommentar über „ein mal" wandert mit ins deutsche Paket (Task 1 hat ihn dort bereits):

```js
  function spokenQuestion(a, b, lang) {
    return locale(lang).spokenQuestion(a, b);
  }
```

Im Export-Objekt `parseGermanNumber` und `parseGermanNumbers` **löschen** und ersetzen:

```js
    parseNumber: parseNumber,
    parseNumbers: parseNumbers,
```

Keine Übergangsfassung der alten Namen stehen lassen: ein Aufrufer, der den alten Weg nimmt, bleibt deutsch, ohne dass es jemand bemerkt.

- [ ] **Step 4: Tests laufen lassen und Erfolg bestätigen**

Run: `node --test test/parser.test.js`
Expected: PASS

Run: `grep -rn "parseGerman" test/ logic.js`
Expected: kein Treffer mehr. Findet sich einer, ist dort eine Fundstelle übersehen worden — der alte Name existiert nach diesem Task nicht mehr.

Run: `node --test`
Expected: PASS

- [ ] **Step 5: Committen**

```bash
git add logic.js test/parser.test.js
git commit -m "Zahlwortparser sprachfähig gemacht, Englisch ergänzt"
```

---

### Task 3: Anzeigetexte in `logic.js`

**Files:**
- Modify: `logic.js` — Abschnitt 6 („progress display"), Export-Objekt
- Test: `test/progress.test.js`

**Interfaces:**
- Consumes: `t(lang, key, params)`, `locale(lang).decimal` (Task 1)
- Produces:
  - `ML.boxNames(lang)` → `['neu','geübt','fast sicher','gemeistert']` bzw. englisch
  - `ML.timeText(ms, lang)` → `'1,4 s'` / `'1.4 s'`, `null` bei `null`/`NaN`
  - `ML.refreshText(card, now, lang)` → String oder `null`
  - `ML.scoreText(card, lang)` → String
  - `ML.cardView(card, key, now, lang)` → `{ key, a, b, box, name, refreshDue, description }`
  - `ML.cardViews(profile, now, lang)` → Array von 100 Kartenansichten
  - `ML.BOX_NAMES` ist **entfernt**

- [ ] **Step 1: Die Tests schreiben**

In `test/progress.test.js` alle Aufrufe um das Sprachargument erweitern (`ML.timeText(1400)` → `ML.timeText(1400, 'de')` usw.), `ML.BOX_NAMES[n]` durch `ML.boxNames('de')[n]` ersetzen, bestehende Erwartungen unverändert lassen. Dann anfügen:

```js
test('box names come in the chosen language', () => {
  assert.deepStrictEqual(ML.boxNames('de'), ['neu', 'geübt', 'fast sicher', 'gemeistert']);
  assert.deepStrictEqual(ML.boxNames('en'), ['new', 'practised', 'almost solid', 'mastered']);
});

test('timeText uses the decimal separator of the language', () => {
  assert.strictEqual(ML.timeText(1400, 'de'), '1,4 s');
  assert.strictEqual(ML.timeText(1400, 'en'), '1.4 s');
  assert.strictEqual(ML.timeText(-5, 'en'), '0.0 s');
  assert.strictEqual(ML.timeText(null, 'en'), null);
  assert.strictEqual(ML.timeText(NaN, 'en'), null);
});

test('refreshText comes in the chosen language', () => {
  const now = 1000000;
  const due = { box: ML.BOX_MASTERED, due: now - 1, seen: 3, correct: 3, bestMs: 900 };
  const soon = { box: ML.BOX_MASTERED, due: now + ML.DAY_MS, seen: 3, correct: 3, bestMs: 900 };
  const later = { box: ML.BOX_MASTERED, due: now + 3 * ML.DAY_MS, seen: 3, correct: 3, bestMs: 900 };
  assert.strictEqual(ML.refreshText(due, now, 'en'), 'refresher due');
  assert.strictEqual(ML.refreshText(soon, now, 'en'), 'refresher in 1 day');
  assert.strictEqual(ML.refreshText(later, now, 'en'), 'refresher in 3 days');
  assert.strictEqual(ML.refreshText(soon, now, 'de'), 'Auffrischung in 1 Tag');
  assert.strictEqual(ML.refreshText(later, now, 'de'), 'Auffrischung in 3 Tagen');
});

test('scoreText comes in the chosen language', () => {
  assert.strictEqual(ML.scoreText({ seen: 0, correct: 0 }, 'en'), 'not come up yet');
  assert.strictEqual(ML.scoreText({ seen: 4, correct: 3 }, 'en'), '3 of 4 correct');
});

test('cardView describes the card in the chosen language', () => {
  const now = 1000000;
  const card = { box: 1, due: 0, seen: 4, correct: 3, bestMs: 1400 };
  const view = ML.cardView(card, '7x8', now, 'en');
  assert.strictEqual(view.name, 'practised');
  assert.strictEqual(view.description,
    '7 × 8 · practised (box 1) · best time 1.4 s · 3 of 4 correct');
});

test('refreshDue is computed, not read off the text', () => {
  // A comparison against the German string would silently report false in
  // every other language.
  const now = 1000000;
  const due = { box: ML.BOX_MASTERED, due: now - 1, seen: 3, correct: 3, bestMs: 900 };
  const notDue = { box: ML.BOX_MASTERED, due: now + ML.DAY_MS, seen: 3, correct: 3, bestMs: 900 };
  ['de', 'en'].forEach((lang) => {
    assert.strictEqual(ML.cardView(due, '7x8', now, lang).refreshDue, true, lang);
    assert.strictEqual(ML.cardView(notDue, '7x8', now, lang).refreshDue, false, lang);
  });
});

test('an unknown language falls back to the default without throwing', () => {
  assert.deepStrictEqual(ML.boxNames('fr'), ML.boxNames('de'));
  assert.strictEqual(ML.timeText(1400, 'fr'), '1,4 s');
});

test('cardViews delivers all 100 cards in every language', () => {
  const profile = ML.newProfile('Test', 0);
  assert.strictEqual(ML.cardViews(profile, 0, 'en').length, 100);
  assert.strictEqual(ML.cardViews(profile, 0, 'en')[0].name, 'new');
});
```

- [ ] **Step 2: Tests laufen lassen und Fehlschlag bestätigen**

Run: `node --test test/progress.test.js`
Expected: FAIL — `ML.boxNames is not a function`

- [ ] **Step 3: Abschnitt 6 umbauen**

```js
  // The box number alone tells nobody anything. For the display every box gets
  // a name; the index is the box number.
  function boxNames(lang) {
    return [t(lang, 'box.name.0'), t(lang, 'box.name.1'),
            t(lang, 'box.name.2'), t(lang, 'box.name.3')];
  }
```

`BOX_NAMES` als Konstante entfällt, auch aus dem Export.

`boxDistribution` und `clampBox` bleiben unverändert — sie liefern Zahlen.

```js
  // Never a negative time; the decimal separator comes from the pack.
  function timeText(ms, lang) {
    if (ms === null || ms === undefined || isNaN(ms)) return null;
    var value = (Math.max(0, ms) / 1000).toFixed(1).replace('.', locale(lang).decimal);
    return t(lang, 'time.seconds', { value: value });
  }

  // Whether a mastered card is due again. Computed from due and now — never by
  // comparing the text, which would report false in every other language.
  function refreshDue(card, now) {
    if (clampBox(card.box) !== BOX_MASTERED) return false;
    if (!card.due || card.due <= 0) return false;
    return card.due <= now;
  }

  // When a mastered card comes up again. For every other box there is no
  // refresh date — the result is null there.
  function refreshText(card, now, lang) {
    if (clampBox(card.box) !== BOX_MASTERED) return null;
    if (!card.due || card.due <= 0) return null;
    if (card.due <= now) return t(lang, 'card.refreshDue');
    var days = Math.ceil((card.due - now) / DAY_MS);
    return t(lang, 'card.refreshIn', { n: days });
  }

  function scoreText(card, lang) {
    if (!card.seen) return t(lang, 'card.notSeen');
    return t(lang, 'card.score', { correct: card.correct, seen: card.seen });
  }

  // One card, ready for display: box number, name, whether a refresh is due,
  // and a sentence that states everything worth knowing.
  function cardView(card, key, now, lang) {
    var ab = parseCardKey(key);
    var box = clampBox(card.box);
    var names = boxNames(lang);
    var parts = [ab.a + ' × ' + ab.b, t(lang, 'card.box', { name: names[box], box: box })];
    var time = timeText(card.bestMs, lang);
    if (time !== null) parts.push(t(lang, 'card.bestTime', { time: time }));
    parts.push(scoreText(card, lang));
    var refresh = refreshText(card, now, lang);
    if (refresh !== null) parts.push(refresh);
    return {
      key: key, a: ab.a, b: ab.b,
      box: box, name: names[box],
      refreshDue: refreshDue(card, now),
      description: parts.join(' · ')
    };
  }

  // Always all 100 cards in a fixed order — a profile missing a card would
  // otherwise tear a hole into the grid.
  function cardViews(profile, now, lang) {
    var list = [];
    for (var i = 0; i < ALL_CARD_KEYS.length; i++) {
      var key = ALL_CARD_KEYS[i];
      list.push(cardView(profile.cards[key] || newCard(), key, now, lang));
    }
    return list;
  }
```

Export: `BOX_NAMES: BOX_NAMES,` **löschen**, dafür `boxNames: boxNames,` und `refreshDue: refreshDue,`.

- [ ] **Step 4: Tests laufen lassen und Erfolg bestätigen**

Run: `node --test test/progress.test.js`
Expected: PASS

Run: `node --test`
Expected: PASS

- [ ] **Step 5: Committen**

```bash
git add logic.js test/progress.test.js
git commit -m "Anzeigetexte nehmen die Sprache als Parameter"
```

---

### Task 4: Sprache in der Speicherschicht

**Files:**
- Modify: `logic.js` — Abschnitt 5 („storage layer"): `DEFAULT_SETTINGS`, `newProfile`, `loadState`, `createProfile`
- Test: `test/storage.test.js`

**Interfaces:**
- Consumes: `LOCALES`, `DEFAULT_LANGUAGE` (Task 1)
- Produces:
  - `ML.DEFAULT_SETTINGS` → `{ tts: false, stt: false, thresholdMs: 6000, lang: 'de' }`
  - `ML.newProfile(name, now, lang)` — unbekanntes oder fehlendes `lang` ergibt `'de'`
  - `ML.createProfile(state, name, now, lang)` → `{ state, id }`
  - `ML.loadState(storage)` ergänzt fehlendes oder ungültiges `settings.lang` mit `'de'`
  - `ML.STATE_VERSION` bleibt bei 1 — nicht angefasst

- [ ] **Step 1: Die Tests schreiben**

An `test/storage.test.js` anfügen:

```js
test('a new profile carries the language it was created with', () => {
  assert.strictEqual(ML.newProfile('Kind', 0, 'en').settings.lang, 'en');
  assert.strictEqual(ML.newProfile('Kind', 0, 'de').settings.lang, 'de');
});

test('a new profile falls back to the default language', () => {
  assert.strictEqual(ML.newProfile('Kind', 0).settings.lang, ML.DEFAULT_LANGUAGE);
  assert.strictEqual(ML.newProfile('Kind', 0, 'fr').settings.lang, ML.DEFAULT_LANGUAGE);
  assert.strictEqual(ML.newProfile('Kind', 0, null).settings.lang, ML.DEFAULT_LANGUAGE);
});

test('createProfile passes the language through', () => {
  const made = ML.createProfile(ML.defaultState(), 'Kind', 0, 'en');
  assert.strictEqual(made.state.profiles[made.id].settings.lang, 'en');
});

test('DEFAULT_SETTINGS names a language', () => {
  assert.strictEqual(ML.DEFAULT_SETTINGS.lang, 'de');
});

// The important one: a state written by the single-language version must keep
// every card. A bump of STATE_VERSION would throw all of it away.
test('a stored state without lang keeps all its progress', () => {
  const profile = ML.newProfile('Kind', 0, 'de');
  profile.cards['7x8'].box = 3;
  profile.cards['7x8'].seen = 9;
  delete profile.settings.lang;                       // as the old version wrote it
  const stored = { version: 1, activeProfile: 'p1', profiles: { p1: profile } };
  const storage = { getItem: () => JSON.stringify(stored), setItem: () => {} };

  const loaded = ML.loadState(storage);
  assert.strictEqual(loaded.activeProfile, 'p1');
  assert.strictEqual(Object.keys(loaded.profiles.p1.cards).length, 100);
  assert.strictEqual(loaded.profiles.p1.cards['7x8'].box, 3);
  assert.strictEqual(loaded.profiles.p1.cards['7x8'].seen, 9);
  assert.strictEqual(loaded.profiles.p1.settings.lang, 'de');
});

test('loadState heals an unusable lang', () => {
  const cases = ['fr', '', 42, null, {}];
  cases.forEach((bad) => {
    const profile = ML.newProfile('Kind', 0, 'de');
    profile.settings.lang = bad;
    const stored = { version: 1, activeProfile: 'p1', profiles: { p1: profile } };
    const storage = { getItem: () => JSON.stringify(stored), setItem: () => {} };
    assert.strictEqual(ML.loadState(storage).profiles.p1.settings.lang, 'de',
      'lang ' + JSON.stringify(bad));
  });
});

test('loadState keeps a valid lang', () => {
  const profile = ML.newProfile('Kind', 0, 'en');
  const stored = { version: 1, activeProfile: 'p1', profiles: { p1: profile } };
  const storage = { getItem: () => JSON.stringify(stored), setItem: () => {} };
  assert.strictEqual(ML.loadState(storage).profiles.p1.settings.lang, 'en');
});
```

Falls `ML.defaultState` noch nicht exportiert ist: es steht bereits im Export-Objekt (`defaultState: defaultState`) — prüfen mit `grep -n "defaultState" logic.js`.

- [ ] **Step 2: Tests laufen lassen und Fehlschlag bestätigen**

Run: `node --test test/storage.test.js`
Expected: FAIL — `settings.lang` ist `undefined`

- [ ] **Step 3: Die Speicherschicht ergänzen**

```js
  var DEFAULT_SETTINGS = { tts: false, stt: false, thresholdMs: DEFAULT_THRESHOLD_MS,
                           lang: DEFAULT_LANGUAGE };
```

```js
  function newProfile(name, now, lang) {
    var cards = {};
    for (var i = 0; i < ALL_CARD_KEYS.length; i++) cards[ALL_CARD_KEYS[i]] = newCard();
    return {
      name: name,
      created: now,
      settings: { tts: DEFAULT_SETTINGS.tts, stt: DEFAULT_SETTINGS.stt,
                  thresholdMs: DEFAULT_SETTINGS.thresholdMs,
                  lang: LOCALES[lang] ? lang : DEFAULT_LANGUAGE },
      cards: cards,
      stats: { sessions: 0, totalAnswers: 0 }
    };
  }
```

In `loadState`, in der Schleife über die Profile, direkt vor `healthy[ids[i]] = pr;`:

```js
        // STATE_VERSION stays 1 on purpose: a bump would discard every
        // existing profile here — weeks of progress for the sake of one new
        // setting. The missing field is healed instead. Existing profiles come
        // from the single-language app, so German is the right assumption, and
        // it stays right no matter what the browser reports.
        if (typeof pr.settings.lang !== 'string' || !LOCALES[pr.settings.lang]) {
          pr.settings.lang = DEFAULT_LANGUAGE;
        }
```

```js
  function createProfile(state, name, now, lang) {
    var profiles = {}, keys = Object.keys(state.profiles), i;
    for (i = 0; i < keys.length; i++) profiles[keys[i]] = state.profiles[keys[i]];
    var id = nextProfileId(profiles);
    profiles[id] = newProfile(name, now, lang);
    return {
      state: { version: STATE_VERSION, activeProfile: id, profiles: profiles },
      id: id
    };
  }
```

- [ ] **Step 4: Tests laufen lassen und Erfolg bestätigen**

Run: `node --test test/storage.test.js`
Expected: PASS

Run: `node --test`
Expected: PASS

- [ ] **Step 5: Committen**

```bash
git add logic.js test/storage.test.js
git commit -m "Sprache als Profileinstellung, ohne alte Profile zu verwerfen"
```

---

### Task 5: Oberflächentexte in die Pakete, Schlüssel ins Markup

**Files:**
- Modify: `logic.js` — `texts` beider Pakete um die Oberflächenschlüssel erweitern
- Modify: `index.html` — Markup (`data-i18n`-Attribute), `applyLanguage()`, alle dynamischen Texte
- Test: `test/i18n.test.js` läuft unverändert mit und deckt die Vollständigkeit ab

**Interfaces:**
- Consumes: `ML.t`, `ML.locale`, `ML.boxNames`, `ML.cardViews` (Tasks 1 und 3)
- Produces (in `index.html`, modulintern):
  - `lang()` → Sprachkennung des aktiven Profils
  - `t(key, params)` → `ML.t(lang(), key, params)`
  - `applyLanguage()` → setzt `<html lang>`, Titel und jeden mit `data-i18n*` markierten Knoten
  - `ackFeedbackText()` → der Rückmeldesatz nach einer falschen Antwort, in der aktuellen Sprache

- [ ] **Step 1: Beide `texts`-Tabellen um die Oberflächenschlüssel erweitern**

Ins deutsche Paket:

```js
        'app.title': 'Einmaleins',

        'menu.profile': 'Profil',
        'menu.activeProfile': 'Aktives Profil',
        'menu.delete': 'Löschen',
        'menu.deleteConfirm': 'Wirklich löschen?',
        'menu.newProfile': 'Neues Profil',
        'menu.namePlaceholder': 'Name',
        'menu.add': 'Anlegen',
        'menu.settings': 'Einstellungen',
        'menu.threshold': 'Zeitschwelle in Sekunden',
        'menu.language': 'Sprache',
        'menu.progress': 'Fortschritt',
        'menu.allCards': 'Alle 100 Aufgaben',
        'menu.close': 'Zurück zum Üben',

        'stats.open': 'offen: {n} von 100',
        'stats.mastered': 'gemeistert: {n}',
        'stats.totalAnswers': 'Antworten insgesamt: {n}',
        'stats.sessions': 'Sitzungen: {n}',
        'stats.slowest': 'Langsamste offene Aufgaben',

        'box.legendName': '{name} · Box {box}',
        'box.count': { one: '1 Aufgabe', other: '{n} Aufgaben' },
        'box.refreshDaysJoin': ', dann ',
        'box.explain.0': 'Noch nie richtig und schnell genug beantwortet — oder zuletzt danebengegangen.',
        'box.explain.1': 'Einmal richtig und schnell genug geschafft.',
        'box.explain.2': 'Zweimal hintereinander richtig und schnell genug — fehlt noch einmal.',
        'box.explain.3': 'Dreimal geschafft. Kommt nur noch zur Auffrischung dran: nach {days} Tagen.',
        'box.rules': 'So wandern die Aufgaben: richtig und schnell genug — eine Box weiter. ' +
          'Richtig, aber zu langsam — die Aufgabe bleibt stehen, geht aber auch nicht ' +
          'zurück. Falsch — zurück in Box 0. Ein ↻ statt des Hakens heißt: Diese ' +
          'gemeisterte Aufgabe ist zur Auffrischung fällig.',
        'grid.hint': 'Tippe eine Aufgabe an, um zu sehen, wie sie steht.',

        'trainer.answerLabel': 'Antwort',
        'trainer.ok': 'OK',
        'trainer.next': 'Weiter',
        'trainer.progress': 'noch {n} von 100 offen',
        'trainer.wrong': 'Richtig wäre {expected} — mit Enter oder dem Knopf weiter',
        'trainer.wrongTimeUp': 'Zeit ist um. Richtig wäre {expected} — mit Enter oder dem Knopf weiter',

        'done.all': 'Alles gemeistert. Nichts steht zur Auffrischung an.',
        'done.freeplay': 'Trotzdem weiterüben',

        'storage.warning': 'Achtung: Der Fortschritt kann in diesem Browser nicht gespeichert werden.',

        'mic.paused': 'Mikrofon pausiert',
        'mic.reading': 'Noch nicht sprechen',
        'mic.starting': 'Mikrofon startet …',
        'mic.ready': 'Jetzt sprechen',
        'mic.hearing': 'Ich höre dich',
        'mic.processing': 'Einen Moment …',
        'mic.heard': 'gehört: „{text}“',
        'mic.understood': 'Verstanden: {value}',
        'mic.noNumber': 'Keine Zahl verstanden',
        'mic.notUnderstood': 'Nicht verstanden — bitte nochmal',
        'mic.nothingHeard': 'Nichts gehört',
        'mic.nothingHeardRetry': 'Nichts gehört — bitte nochmal',
        'mic.problem': 'Mikrofon-Problem',
        'mic.problemRetry': 'Mikrofon-Problem — bitte nochmal',
        'mic.broken': 'Mikrofon funktioniert gerade nicht — bitte tippen',
        'mic.denied': 'Kein Zugriff auf das Mikrofon — Tastatur geht weiter',

        'toolbar.tts': 'Aufgabe vorlesen',
        'toolbar.ttsUnsupported': 'Dieser Browser kann nicht vorlesen',
        'toolbar.stt': 'Antwort sprechen',
        'toolbar.sttInsecure': 'Das Mikrofon braucht HTTPS — über GitHub Pages oder localhost öffnen',
        'toolbar.menu': 'Profile und Einstellungen',

        'profile.defaultName': 'Ich'
```

Ins englische Paket, dieselben Schlüssel in derselben Reihenfolge:

```js
        'app.title': 'Times Tables',

        'menu.profile': 'Profile',
        'menu.activeProfile': 'Active profile',
        'menu.delete': 'Delete',
        'menu.deleteConfirm': 'Really delete?',
        'menu.newProfile': 'New profile',
        'menu.namePlaceholder': 'Name',
        'menu.add': 'Create',
        'menu.settings': 'Settings',
        'menu.threshold': 'Time threshold in seconds',
        'menu.language': 'Language',
        'menu.progress': 'Progress',
        'menu.allCards': 'All 100 questions',
        'menu.close': 'Back to practice',

        'stats.open': 'open: {n} of 100',
        'stats.mastered': 'mastered: {n}',
        'stats.totalAnswers': 'answers in total: {n}',
        'stats.sessions': 'sessions: {n}',
        'stats.slowest': 'Slowest open questions',

        'box.legendName': '{name} · box {box}',
        'box.count': { one: '1 question', other: '{n} questions' },
        'box.refreshDaysJoin': ', then ',
        'box.explain.0': 'Never yet answered correctly and fast enough — or missed last time.',
        'box.explain.1': 'Managed once, correctly and fast enough.',
        'box.explain.2': 'Twice in a row, correctly and fast enough — one more to go.',
        'box.explain.3': 'Managed three times. Only comes up for a refresher now: after {days} days.',
        'box.rules': 'This is how the questions move: correct and fast enough — one box up. ' +
          'Correct but too slow — the question stays where it is, but it does not fall ' +
          'back either. Wrong — back to box 0. A ↻ instead of the tick means: this ' +
          'mastered question is due for a refresher.',
        'grid.hint': 'Tap a question to see how it is doing.',

        'trainer.answerLabel': 'Answer',
        'trainer.ok': 'OK',
        'trainer.next': 'Continue',
        'trainer.progress': '{n} of 100 still open',
        'trainer.wrong': 'The answer is {expected} — press Enter or the button to continue',
        'trainer.wrongTimeUp': 'Time is up. The answer is {expected} — press Enter or the button to continue',

        'done.all': 'All mastered. Nothing is due for a refresher.',
        'done.freeplay': 'Keep practising anyway',

        'storage.warning': 'Careful: progress cannot be saved in this browser.',

        'mic.paused': 'Microphone paused',
        'mic.reading': 'Do not speak yet',
        'mic.starting': 'Microphone starting …',
        'mic.ready': 'Speak now',
        'mic.hearing': 'I can hear you',
        'mic.processing': 'One moment …',
        'mic.heard': 'heard: “{text}”',
        'mic.understood': 'Understood: {value}',
        'mic.noNumber': 'No number understood',
        'mic.notUnderstood': 'Not understood — please try again',
        'mic.nothingHeard': 'Nothing heard',
        'mic.nothingHeardRetry': 'Nothing heard — please try again',
        'mic.problem': 'Microphone problem',
        'mic.problemRetry': 'Microphone problem — please try again',
        'mic.broken': 'The microphone is not working right now — please type',
        'mic.denied': 'No access to the microphone — the keyboard still works',

        'toolbar.tts': 'Read the question aloud',
        'toolbar.ttsUnsupported': 'This browser cannot read aloud',
        'toolbar.stt': 'Speak the answer',
        'toolbar.sttInsecure': 'The microphone needs HTTPS — open via GitHub Pages or localhost',
        'toolbar.menu': 'Profiles and settings',

        'profile.defaultName': 'Me'
```

- [ ] **Step 2: Tests laufen lassen — der Vollständigkeitstest muss grün bleiben**

Run: `node --test test/i18n.test.js`
Expected: PASS. Bei FAIL nennt die Meldung genau den Schlüssel, der in einem Paket fehlt oder dessen Platzhalter abweichen — genau dafür ist der Test da.

- [ ] **Step 3: Committen**

```bash
git add logic.js
git commit -m "Oberflächentexte in die Sprachpakete übernommen"
```

- [ ] **Step 4: Das Markup auf Schlüssel umstellen**

Jeder sichtbare Text im Markup wird durch ein `data-i18n`-Attribut ersetzt; der Textinhalt bleibt leer, `applyLanguage()` füllt ihn. Vollständige neue Fassung von `#menu`, `#trainer` und `#done`:

```html
<section id="menu" hidden>
  <h2 data-i18n="menu.profile"></h2>
  <div class="row">
    <div>
      <label for="profile-select" data-i18n="menu.activeProfile"></label>
      <select id="profile-select"></select>
    </div>
    <button id="profile-delete"></button>
  </div>
  <div class="row">
    <div>
      <label for="profile-name" data-i18n="menu.newProfile"></label>
      <input id="profile-name" type="text" autocomplete="off"
             data-i18n-placeholder="menu.namePlaceholder">
    </div>
    <button id="profile-add" data-i18n="menu.add"></button>
  </div>

  <h2 data-i18n="menu.settings"></h2>
  <div>
    <label for="threshold" data-i18n="menu.threshold"></label>
    <input id="threshold" type="number" min="1" max="30" step="0.5">
  </div>
  <div>
    <label for="language" data-i18n="menu.language"></label>
    <select id="language"></select>
  </div>

  <h2 data-i18n="menu.progress"></h2>
  <div id="stats"></div>

  <h2 data-i18n="menu.allCards"></h2>
  <ul id="box-legend"></ul>
  <p id="box-rules"></p>
  <div id="card-grid"></div>
  <p id="card-detail" aria-live="polite"></p>

  <button id="menu-close" data-i18n="menu.close"></button>
</section>
```

`#profile-delete` bekommt **kein** `data-i18n`: sein Text wechselt zwischen `menu.delete` und `menu.deleteConfirm` und wird von `renderMenu()` gesetzt.

Im Trainer nur zwei Stellen:

```html
  <input id="answer" type="text" inputmode="numeric" autocomplete="off"
         autocorrect="off" spellcheck="false" data-i18n-aria-label="trainer.answerLabel">
  <button id="confirm" type="button"></button>
```

```html
<div id="done" hidden>
  <p data-i18n="done.all"></p>
  <button id="freeplay" data-i18n="done.freeplay"></button>
</div>
```

Der Sprachwähler steht mit `flex: none` im Menü richtig — `#menu > * { flex: none; }` greift auch für das neue `<div>`. Kein neues `position`/`z-index` im Trainer: der Timerbalken und der Blitz sollen weiterhin unter dem Menü liegen.

- [ ] **Step 5: `applyLanguage()` und die Übersetzerbrücke einbauen**

`el` um den Sprachwähler erweitern:

```js
    language: document.getElementById('language'),
```

Direkt nach der `profile()`-Funktion:

```js
  /* ---------- language ---------- */

  function lang() { return profile().settings.lang; }

  // Short bridge to ML.t so that every call site reads the same and nobody
  // has to remember to pass the language.
  function t(key, params) { return ML.t(lang(), key, params); }

  // Attribute texts: the data attribute names the key, the second entry the
  // attribute it fills.
  var I18N_ATTRS = [
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-title', 'title'],
    ['data-i18n-aria-label', 'aria-label']
  ];

  // Rewrites every marked node. Called at startup, on a language change and
  // after a profile switch. Elements created in script carry the same data
  // attributes, so the buttons in the toolbar are covered too — including the
  // case where their title names the unsupported variant of the key.
  function applyLanguage() {
    document.documentElement.lang = ML.locale(lang()).htmlLang;
    document.title = t('app.title');

    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    }
    for (var a = 0; a < I18N_ATTRS.length; a++) {
      var marked = document.querySelectorAll('[' + I18N_ATTRS[a][0] + ']');
      for (var j = 0; j < marked.length; j++) {
        marked[j].setAttribute(I18N_ATTRS[a][1],
          t(marked[j].getAttribute(I18N_ATTRS[a][0])));
      }
    }
  }
```

- [ ] **Step 6: Alle dynamischen Texte auf `t()` umstellen**

Der Reihenfolge der Datei nach — jede Stelle einzeln:

```js
  // storage warning (bisher Zeile ~476)
      el.storageWarning.textContent = t('storage.warning');

  // progress line
  function render() {
    el.progress.textContent = t('trainer.progress', { n: ML.openCount(profile()) });
  }
```

Die Rückmeldung nach einer falschen Antwort wird zu einer eigenen Funktion, weil sie an zwei Stellen gebraucht wird — beim Antworten und beim Sprachwechsel (Task 7):

```js
  // The sentence that stands while the mistake is shown. Its own function
  // because a language change has to be able to rewrite it.
  function ackFeedbackText() {
    return t(session.ackTimeUp ? 'trainer.wrongTimeUp' : 'trainer.wrong',
             { expected: session.expected });
  }
```

`session` bekommt dazu ein Feld (bei `awaitingAck: false` einfügen):

```js
    ackTimeUp: false,      // the standing acknowledgement came from the deadline
```

In `submitAnswer`, im `else`-Zweig:

```js
      showFlash('bad');
      session.ackTimeUp = timeUp;
      el.feedback.textContent = ackFeedbackText();
      el.confirm.textContent = t('trainer.next');
```

In `nextQuestion`:

```js
    el.feedback.textContent = '';
    el.confirm.textContent = t('trainer.ok');
```
und `session.ackTimeUp = false;` neben `session.awaitingAck = false;`.

Vorlesen:

```js
      speak(ML.spokenQuestion(ab.a, ab.b, lang()), function () {
```

Die Mikrofontexte werden eine Schlüsseltabelle:

```js
  var MIC_TEXT_KEYS = {};
  MIC_TEXT_KEYS[ML.MIC_PAUSED] = 'mic.paused';
  MIC_TEXT_KEYS[ML.MIC_READING] = 'mic.reading';
  MIC_TEXT_KEYS[ML.MIC_STARTING] = 'mic.starting';
  MIC_TEXT_KEYS[ML.MIC_READY] = 'mic.ready';
  MIC_TEXT_KEYS[ML.MIC_HEARING] = 'mic.hearing';
  MIC_TEXT_KEYS[ML.MIC_PROCESSING] = 'mic.processing';
```

`MIC_TEXTS` und seine sechs Zuweisungen ersatzlos löschen; in `micUpdate`:

```js
    micWrite(MIC_SHAPES[state], t(MIC_TEXT_KEYS[state]));
```

`micSetEcho` (bisher `'gehört: „' + clean + '“'`):

```js
      el.micHeard.textContent = t('mic.heard', { text: clean });
```

Die Meldungen im Erkenner:

```js
        micReport('error', t('mic.noNumber'));
        retryUnderstood(t('mic.notUnderstood'));
...
        micReport('understood', t('mic.understood', { value: value }));
...
      if (event.error === 'no-speech') {
        micReport('error', t('mic.nothingHeard'));
        retryUnderstood(t('mic.nothingHeardRetry'));
      } else {
        micReport('error', t('mic.problem'));
        retryUnderstood(t('mic.problemRetry'));
      }
```

Die beiden Watchdog- bzw. Fehlerzeilen in `#feedback`:

```js
        el.feedback.textContent = t('mic.broken');       // zwei Stellen
        el.feedback.textContent = t('mic.denied');       // not-allowed
```

Die Erkennungsergebnisse gehen jetzt mit Sprache in den Parser:

```js
        var numbers = ML.parseNumbers(alts[i].transcript, lang());
```

Die drei Knöpfe der Werkzeugleiste bekommen Schlüssel statt Texte, damit `applyLanguage()` sie mit erwischt:

```js
  ttsButton.textContent = '🔊';
  ttsButton.setAttribute('data-i18n-title', 'toolbar.tts');
  if (!tts.supported) {
    ttsButton.disabled = true;
    ttsButton.setAttribute('data-i18n-title', 'toolbar.ttsUnsupported');
  }
```

```js
    sttButton.textContent = '🎤';
    sttButton.setAttribute('data-i18n-title', 'toolbar.stt');
    if (!stt.secure) {
      sttButton.disabled = true;
      sttButton.setAttribute('data-i18n-title', 'toolbar.sttInsecure');
    }
```

```js
  menuButton.textContent = '☰';
  menuButton.setAttribute('data-i18n-title', 'toolbar.menu');
```

Die Statistik (`renderStats`) — die Zahlen werden weiterhin als `<strong>` eingesetzt, und nur Zahlen aus dem eigenen Code gehen in `innerHTML`, nie ein Profilname:

```js
    var strong = function (n) { return '<strong>' + n + '</strong>'; };
    var html = '<div>' + t('stats.open', { n: strong(ML.openCount(p)) }) +
               ' &middot; ' + t('stats.mastered', { n: strong(boxes[ML.BOX_MASTERED]) }) + '</div>' +
               '<div>' + t('stats.totalAnswers', { n: p.stats.totalAnswers }) +
               ' &middot; ' + t('stats.sessions', { n: p.stats.sessions }) + '</div>';

    if (timed.length > 0) {
      html += '<div style="margin-top:.6rem">' + t('stats.slowest') + '</div><table>';
      timed.slice(0, 5).forEach(function (row) {
        var ab = ML.parseCardKey(row.key);
        html += '<tr><td>' + ab.a + ' × ' + ab.b + '</td><td>' +
                ML.timeText(row.ms, lang()) + '</td></tr>';
      });
      html += '</table>';
    }
```

Boxerklärungen und Regelsatz werden Funktionen, weil sie die Sprache erst zur Zeichenzeit kennen:

```js
  // What a box means — in one sentence a child understands too. The refresh
  // intervals come from REFRESH_INTERVALS_MS so that the text cannot diverge
  // from the code.
  function refreshDaysText() {
    return ML.REFRESH_INTERVALS_MS.map(function (ms) {
      return ms / ML.DAY_MS;
    }).join(t('box.refreshDaysJoin'));
  }

  function boxExplanation(box) {
    return t('box.explain.' + box, { days: refreshDaysText() });
  }
```

`REFRESH_DAYS_TEXT`, `BOX_EXPLANATIONS`, `BOX_RULES_TEXT` und `DETAIL_HINT` als Konstanten ersatzlos löschen. In `renderBoxLegend` die Schleife über die Boxnummern statt über die Erklärungen führen:

```js
  function renderBoxLegend() {
    var boxes = ML.boxDistribution(profile());
    var names = ML.boxNames(lang());
    el.boxLegend.innerHTML = '';
    for (var box = 0; box <= ML.BOX_MASTERED; box++) {
      var li = document.createElement('li');
      li.appendChild(buildLevel(document.createElement('span'), box, false));

      var text = document.createElement('span');
      text.className = 'text';
      var head = document.createElement('span');
      head.className = 'head';
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = t('box.legendName', { name: names[box], box: box });
      var count = document.createElement('span');
      count.className = 'count';
      count.textContent = t('box.count', { n: boxes[box] });
      var sentence = document.createElement('span');
      sentence.className = 'explanation';
      sentence.textContent = boxExplanation(box);
      ...   // Anhängen wie bisher
      el.boxLegend.appendChild(li);
    }
  }
```

(Die bestehende Fassung nutzt `BOX_EXPLANATIONS.forEach(function (explanation, box) {…})`; der Rumpf bleibt inhaltlich gleich, nur `explanation` wird `boxExplanation(box)` und die Namens- und Zählzeile gehen über `t()`.)

Regelsatz und Rasterhinweis:

```js
    el.boxRules.textContent = t('box.rules');
...
    el.cardDetail.textContent = t('grid.hint');
```

Das Raster holt seine Kartenansichten mit Sprache:

```js
    var views = ML.cardViews(profile(), Date.now(), lang());
```

(Die Zeile steht in `renderGrid`; `grep -n "cardViews" index.html` findet sie.)

Der Löschknopf in `renderMenu` und im Klickhandler:

```js
    el.profileDelete.textContent = t('menu.delete');
...
      el.profileDelete.textContent = t('menu.deleteConfirm');
```

- [ ] **Step 7: `applyLanguage()` beim Start aufrufen**

Am Ende des Scripts, vor `renderTtsButton(); renderSttButton();`:

```js
  applyLanguage();
```

Die Werkzeugleistenknöpfe werden vorher erzeugt, also erwischt der Aufruf sie mit. `document.title` und `<html lang>` stimmen damit ab dem ersten Zeichnen.

- [ ] **Step 8: Im Browser prüfen, dass nichts verschwunden ist**

Run: `python3 -m http.server 8000` und `http://localhost:8000/` öffnen, **mit abgeschaltetem Cache**.
Expected: Die Oberfläche sieht aus wie vorher, alles deutsch. Kein leeres Element, kein Schlüsselname als Text. Menü öffnen: Profil, Einstellungen, Fortschritt, alle 100 Aufgaben mit Legende, Regelsatz und Raster vollständig. Eine Aufgabe im Raster antippen zeigt den Satz. Eine richtige und eine falsche Antwort geben: Blitz, Rückmeldung und Knopfbeschriftung wie bisher.

Prüfen, dass kein deutscher Text mehr im Script steht:
Run: `grep -nP '[äöüßÄÖÜ]' index.html`
Expected: Treffer nur in Kommentaren, nirgends in einem Stringliteral, das angezeigt wird.

- [ ] **Step 9: Committen**

```bash
git add index.html
git commit -m "index.html hält nur noch i18n-Schlüssel"
```

---

### Task 6: Sprachausgabe und Spracherkennung nehmen den Sprachcode aus dem Paket

**Files:**
- Modify: `index.html` — `pickGermanVoice`, `speak`, `requestLocalProcessing`, `buildRecognizer`

**Interfaces:**
- Consumes: `ML.locale(lang()).speechLang` (Task 1), `lang()` (Task 5)
- Produces: `pickVoice()` ersetzt `pickGermanVoice()`; der Erkenner wird je Zuhör-Durchgang mit dem aktuellen `speechLang` gebaut

- [ ] **Step 1: Die Stimmenwahl sprachfähig machen**

`pickGermanVoice` vollständig ersetzen:

```js
  // Prefers an exact match on the pack's speech tag, then any voice of the
  // same language. Some engines report "en_US" with an underscore.
  function pickVoice() {
    if (!tts.supported) return;
    tts.voice = null;
    var want = ML.locale(lang()).speechLang.toLowerCase();
    var base = want.split('-')[0];
    var voices = window.speechSynthesis.getVoices();
    var i;
    for (i = 0; i < voices.length; i++) {
      if (voices[i].lang && voices[i].lang.toLowerCase().replace('_', '-') === want) {
        tts.voice = voices[i];
        return;
      }
    }
    for (i = 0; i < voices.length; i++) {
      if (voices[i].lang && voices[i].lang.toLowerCase().indexOf(base) === 0) {
        tts.voice = voices[i];
        return;
      }
    }
    // Nothing fitting: the browser's default voice stays, exactly as before.
  }

  if (tts.supported) {
    pickVoice();
    // On the first call the voice list is often still empty.
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
  }
```

In `speak`:

```js
    u.lang = ML.locale(lang()).speechLang;
```

Und in `applyLanguage()` ganz am Ende ergänzen, damit ein Sprachwechsel die Stimme mitzieht:

```js
    pickVoice();
```

Weil `applyLanguage()` erst nach der Definition von `pickVoice` aufgerufen wird (der Startaufruf steht am Dateiende), ist die Reihenfolge in Ordnung; Funktionsdeklarationen werden ohnehin hochgezogen.

- [ ] **Step 2: Die lokale Erkennung je Sprache abfragen**

`localAvailable` und `localQueried` sind heute ein einziges Paar für die gesamte Sitzung. Dass Deutsch lokal verfügbar ist, sagt nichts über Englisch — beide werden zu Tabellen über den Sprachcode:

```js
  // The answer applies per speech tag, not per session: that German is
  // available locally says nothing about English.
  var localAvailable = {};   // speechLang -> true/false, absent = no answer yet
  var localQueried = {};

  function requestLocalProcessing(rec) {
    if (typeof SR.available !== 'function') return;
    var tag = ML.locale(lang()).speechLang;
    if (localAvailable[tag] !== undefined) {
      if (localAvailable[tag]) rec.processLocally = true;
      return;
    }
    if (localQueried[tag]) return;   // the answer is still pending
    localQueried[tag] = true;
    try {
      Promise.resolve(SR.available({ langs: [tag], processLocally: true }))
        .then(function (status) {
          if (status === 'available') {
            localAvailable[tag] = true;
            rec.processLocally = true;
          } else if (status === 'downloadable' && typeof SR.install === 'function') {
            SR.install({ langs: [tag], processLocally: true });
          }
        })
        .catch(function () { /* the server route stays */ });
    } catch (e) { /* the server route stays */ }
  }
```

- [ ] **Step 3: Den Erkenner mit dem Sprachcode des Pakets bauen**

In `buildRecognizer`:

```js
    rec.lang = ML.locale(lang()).speechLang;
```

Das genügt, weil pro Zuhör-Durchgang ein eigener Erkenner gebaut wird. Ein laufender Erkenner ändert seine Sprache nicht mehr — deshalb muss ein Sprachwechsel ihn verwerfen (Task 7).

- [ ] **Step 4: Im Browser prüfen**

Run: `python3 -m http.server 8000`, Cache abschalten, 🔊 einschalten und eine Aufgabe abwarten.
Expected: Vorlesen wie bisher deutsch, „ein mal drei" bei führender 1.
In der Konsole `document.querySelector('#tts-toggle')` und `window.speechSynthesis.getVoices()` prüfen — die gewählte Stimme trägt `de`.

- [ ] **Step 5: Committen**

```bash
git add index.html
git commit -m "Sprachcode für Vorlesen und Erkennung kommt aus dem Sprachpaket"
```

---

### Task 7: Der Sprachwähler im Menü

**Files:**
- Modify: `index.html` — `renderLanguageSelect`, `renderMenu`, Wechsel-Handler, `relabelQuestion`, Ableitung aus `navigator.language`, Profilanlage

**Interfaces:**
- Consumes: `ML.LANGUAGES`, `ML.resolveLanguage`, `ML.t` (Task 1), `ML.createProfile(state, name, now, lang)` (Task 4), `applyLanguage()`, `t()`, `ackFeedbackText()` (Task 5), `pickVoice()` (Task 6)
- Produces: nichts für spätere Tasks

- [ ] **Step 1: Die Browsersprache ableiten und für das erste Profil nutzen**

Direkt vor `var state = ML.loadState(window.localStorage);`:

```js
  // The browser's language decides only for a profile that is created new —
  // never for one that was loaded. A stored profile comes from an earlier run
  // and keeps the language it was set to.
  var browserLanguage = ML.resolveLanguage(
    (typeof navigator !== 'undefined' && navigator.language) || null);
```

Die Erstanlage:

```js
  if (!state.activeProfile) {
    var created = ML.createProfile(state, ML.t(browserLanguage, 'profile.defaultName'),
                                   Date.now(), browserLanguage);
    state = created.state;
    ML.saveState(window.localStorage, state);
  }
```

Ein im Menü angelegtes Profil erbt dagegen die Sprache des gerade aktiven Profils: wer das Menü bedient, sieht es in dieser Sprache vor sich, und das ist die bessere Vermutung als die Browsereinstellung.

```js
  el.profileAdd.addEventListener('click', function () {
    var name = el.profileName.value.trim();
    if (name === '') return;
    var inherited = lang();
    var created = ML.createProfile(state, name, Date.now(), inherited);
    state = created.state;
    persist();
    el.profileName.value = '';
    renderMenu();
    restartSession();
    el.menu.hidden = false;
  });
```

- [ ] **Step 2: Den Wähler füllen**

```js
  function renderLanguageSelect() {
    el.language.innerHTML = '';
    ML.LANGUAGES.forEach(function (entry) {
      var opt = document.createElement('option');
      opt.value = entry.id;
      // The label stays in its own language on purpose: whoever cannot read
      // the interface still finds „English" in a German menu.
      opt.textContent = entry.label;
      if (entry.id === lang()) opt.selected = true;
      el.language.appendChild(opt);
    });
  }
```

In `renderMenu()` aufrufen, neben `el.threshold.value = …`:

```js
    renderLanguageSelect();
```

- [ ] **Step 3: Den Wechsel behandeln**

Neben dem `threshold`-Handler:

```js
  // A language change touches no card. It happens with the menu open, so the
  // clock is stopped anyway — closeMenu starts it again through updateTimer,
  // exactly as after every other visit to the menu. No new place stops or
  // starts the clock here.
  el.language.addEventListener('change', function () {
    var chosen = ML.resolveLanguage(el.language.value);
    profile().settings.lang = chosen;
    persist();

    applyLanguage();        // static texts, <html lang>, title, voice
    relabelQuestion();      // the waiting question keeps its factors, not its texts
    render();               // progress line
    renderMenu();           // stats, legend, rules, grid, detail, delete button, selector

    // rec.lang is set when the recogniser is built and does not change on a
    // running one. Discarding it is enough: closeMenu starts listening again
    // and buildRecognizer then reads the new speech tag. Without this the
    // child would speak English and be recognised in German.
    stopListening();
    micUpdate(true);
  });
```

- [ ] **Step 4: Die wartende Aufgabe neu beschriften**

```js
  // The factors stay, the texts do not: the button label and a standing
  // acknowledgement have to follow the language.
  function relabelQuestion() {
    if (session.currentKey === null) return;
    if (session.awaitingAck) {
      el.feedback.textContent = ackFeedbackText();
      el.confirm.textContent = t('trainer.next');
    } else {
      el.feedback.textContent = '';
      el.confirm.textContent = t('trainer.ok');
    }
  }
```

- [ ] **Step 5: Beim Profilwechsel die Sprache mitziehen**

Der Profilwechsel kann die Sprache wechseln, weil sie pro Profil gilt. In den `profileSelect`-Handler, nach `persist();`:

```js
    applyLanguage();
```

`restartSession()` zeichnet danach Aufgabe und Knöpfe neu; `renderMenu()` steht ohnehin schon davor — Reihenfolge also: `persist(); applyLanguage(); renderMenu(); restartSession();`.

Dasselbe im `profileAdd`- und im `profileDelete`-Handler ergänzen: beide machen ein anderes Profil aktiv.

- [ ] **Step 6: Im Browser prüfen**

Run: `python3 -m http.server 8000`, Cache abschalten.
Expected:
1. Menü öffnen, „Sprache" auf „English" stellen: Menü, Knopftitel, Trainer, Legende, Regelsatz, Rasterdetails und Statistik sind englisch; kein deutscher Rest, kein Schlüsselname.
2. In der Konsole: `document.documentElement.lang === 'en'` und `document.title === 'Times Tables'`.
3. Zurück auf „Deutsch": derselbe Stand wie zuvor, Fortschritt unverändert.
4. Seite neu laden: die Sprache steht noch, die Karten stehen noch.
5. Zweites Profil anlegen, dort auf Englisch stellen, zwischen den Profilen wechseln: die Oberfläche wechselt mit.
6. Falsch antworten, dann im Menü die Sprache wechseln: der stehende Rückmeldesatz und der Knopf „Weiter" sind übersetzt, die Karte ist unverändert.
7. Menü offen: Timerbalken und Blitz liegen weiterhin darunter, nichts schlägt durch.

- [ ] **Step 7: Committen**

```bash
git add index.html
git commit -m "Sprachwähler im Menü mit Umschaltung zur Laufzeit"
```

---

### Task 8: Messung im Browser und Dokumentation

**Files:**
- Modify: `README.md`, `CLAUDE.md`
- Create: nichts Ausgeliefertes; ein Prüfskript liegt im Scratchpad, nicht im Repo

**Interfaces:**
- Consumes: den fertigen Stand aus Tasks 1–7
- Produces: nichts

- [ ] **Step 1: Die Sprachschicht über das DevTools-Protokoll messen**

Berichte über UI-Verhalten sind ohne Messung nicht belastbar. Ein Skript im Scratchpad-Verzeichnis, nach dem bestehenden Muster: headless Chrome mit `--remote-debugging-port`, gesteuert aus Node über den eingebauten `WebSocket`, `Network.setCacheDisabled` gesetzt.

Zu messen ist, mit `localStorage` frisch und dann mit englischem Profil:

```js
// Auszuwertende Ausdrücke, je über Runtime.evaluate:
document.documentElement.lang
document.title
document.querySelector('#menu-close').textContent
document.querySelector('#box-rules').textContent.slice(0, 40)
document.querySelector('#card-detail').textContent
document.querySelector('#stats').textContent
document.querySelector('#confirm').textContent
document.querySelector('#progress').textContent
document.querySelector('#tts-toggle').title
document.querySelector('#menu-button').title
// Kein Schlüsselname als sichtbarer Text:
[...document.querySelectorAll('*')]
  .filter(e => e.children.length === 0 && /^[a-z]+(\.[a-z0-9]+)+$/.test(e.textContent.trim()))
  .map(e => e.id + ':' + e.textContent)
```

Expected: Der letzte Ausdruck liefert ein leeres Array — ein Schlüsselname als Text heißt, dass ein Schlüssel in einem Paket fehlt.

- [ ] **Step 2: Die Sprachein- und -ausgabe mit Attrappen prüfen**

`window.SpeechSynthesisUtterance` und den Erkenner durch Attrappen ersetzen, wie es die bisherigen UI-Messungen tun, und aufzeichnen:

Expected:
- `u.lang` ist `de-DE` bei deutschem, `en-US` bei englischem Profil
- der vorgelesene Text ist `ein mal 3` bzw. `1 times 3`
- nach einem Sprachwechsel bei aktivem Mikrofon trägt der **neu** gebaute Erkenner `en-US`; der alte wurde verworfen
- ein Erkennungsergebnis „forty-eight" bei englischem Profil wird als 48 gewertet, „achtundvierzig" bei deutschem als 48
- ein Erkennungsfehler wertet in beiden Sprachen keine Karte

- [ ] **Step 3: Die gesamte Suite laufen lassen**

Run: `node --test`
Expected: PASS, alle Tests — die 90 bestehenden plus die neuen aus den Tasks 1–4.

- [ ] **Step 4: `README.md` ergänzen**

Im Abschnitt zu den Einstellungen einen Satz über die Sprachwahl: dass sie pro Profil gilt, dass sie Oberfläche, Vorlesen und Spracherkennung umstellt, und dass ein neues Profil die Sprache des Browsers übernimmt.

- [ ] **Step 5: `CLAUDE.md` ergänzen**

Unter „Fachlogik, die man leicht falsch macht" und „Sprache" die Punkte festhalten, die beim Arbeiten am Code wichtig sind und sich nicht aus einer einzelnen Datei ergeben:

- Alles Sprachliche liegt in `LOCALES` in `logic.js`. Wer für eine neue Sprache `index.html` anfassen muss, hat eine unvollständige Trennung gefunden — sie gehört korrigiert, nicht umgangen.
- `STATE_VERSION` bleibt 1. Ein Versionssprung verwirft in `loadState` alle Profile.
- `fillerWords` ist pro Sprache. Englisch muss `and` verwerfen, Deutsch darf `und` nicht verwerfen — sonst zerfällt „acht und vierzig" in 8 und 40.
- Weder `a` noch `oh` gehören in die englischen Zahlwörter: `parseNumber` nimmt die erste Zahl, und „oh, twenty-four" würde als 0 gewertet.
- `rec.lang` wird beim Bau des Erkenners gesetzt. Ein Sprachwechsel muss den laufenden Erkenner verwerfen, sonst spricht das Kind englisch und wird deutsch erkannt.
- `refreshDue` wird gerechnet, nicht am Text erkannt. Ein Vergleich gegen „Auffrischung fällig" meldet in jeder anderen Sprache `false`.
- Der Vollständigkeitstest in `test/i18n.test.js` ist der Grund, warum `ML.t` bei unbekanntem Schlüssel schweigen darf.

Außerdem die Testzahl in „Kommandos" aktualisieren (`node --test` nennt sie am Ende).

- [ ] **Step 6: Committen**

```bash
git add README.md CLAUDE.md
git commit -m "Sprachwahl dokumentiert"
```

---

## Selbstprüfung des Plans

**Abdeckung der Spec:**

| Spec-Abschnitt | Task |
|---|---|
| 1 — Sprachpaket, Übersetzer, `LANGUAGES`/`locale`/`resolveLanguage` | 1 |
| 2 — Parser, Normalisierung, Füllwörter, englische Zahlwörter | 2 |
| 3 — Textfunktionen, `refreshDue` gerechnet, `BOX_NAMES` entfällt | 3 |
| 4 — `settings.lang`, `STATE_VERSION` bleibt 1, Heilung, Profilname | 4 und 7 |
| 5 — statische und dynamische Texte, Umschaltung, TTS, STT | 5, 6, 7 |
| 6 — eine dritte Sprache hinzufügen | durch den Aufbau erfüllt; in `CLAUDE.md` festgehalten (Task 8) |
| 7 — Tests und Browsermessung | 1–4 (Tests), 8 (Messung) |

Keine Lücke.

**Namenskonsistenz:** `lang()`, `t()`, `applyLanguage()`, `ackFeedbackText()`, `relabelQuestion()`, `renderLanguageSelect()`, `pickVoice()`, `boxExplanation()`, `refreshDaysText()` — jeder Name wird genau einmal definiert und danach nur so verwendet. `ML.boxNames`, `ML.parseNumber(s)`, `ML.locale`, `ML.t`, `ML.resolveLanguage`, `ML.LANGUAGES`, `ML.DEFAULT_LANGUAGE`, `ML.REQUIRED_LOCALE_FIELDS`, `ML.refreshDue`, `ML._spellEnglish` stimmen zwischen Definition (Tasks 1–4) und Verwendung (Tasks 5–7) überein. Entfernt werden `ML.BOX_NAMES`, `ML.parseGermanNumber`, `ML.parseGermanNumbers` — kein späterer Task greift darauf zu.

**Platzhalter:** keine. Jeder Codeschritt trägt den Code, jeder Prüfschritt das erwartete Ergebnis.
