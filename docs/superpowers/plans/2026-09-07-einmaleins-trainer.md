# Einmaleins-Trainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein ablenkungsfreies Browser-Tool zum Automatisieren des kleinen Einmaleins mit Leitner-Boxen, Zeitschwelle und optionaler Sprachein-/-ausgabe.

**Architecture:** Zwei ausgelieferte Dateien ohne Build-Schritt. `logic.js` enthält Zahlenparser, Scheduler und Speicherschicht als reine Funktionen — alle Abhängigkeiten (Zeit, Zufall, Storage) werden hineingereicht, damit sie ohne Browser testbar sind. `index.html` enthält Markup, Styles und die gesamte DOM-, Sprach- und Ereignis-Anbindung. `logic.js` exportiert per UMD-Muster: im Browser als globales `ML`, in Node per `module.exports`.

**Tech Stack:** Reines HTML/CSS/JavaScript (ES2020), keine Abhängigkeiten, kein npm, kein Build. Tests mit dem in Node eingebauten `node --test` und `node:assert`. Auslieferung über GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-07-einmaleins-trainer-design.md`

## Global Constraints

- **Keine Abhängigkeiten.** Kein npm-Paket, kein CDN, kein Framework, kein Build-Schritt. Es gibt keine `package.json`.
- **Genau zwei ausgelieferte Dateien:** `index.html` und `logic.js` im Repo-Wurzelverzeichnis. Testdateien unter `test/` werden nicht ausgeliefert.
- **`logic.js` darf niemals auf `window`, `document`, `localStorage`, `Date.now()` oder `Math.random()` zugreifen.** Zeit, Zufall und Storage kommen ausschließlich als Parameter herein. Das ist die Bedingung dafür, dass die Tests ohne Browser laufen.
- **`logic.js` muss CommonJS-kompatibel bleiben** (kein `import`/`export`-Schlüsselwort), damit `require()` in den Tests funktioniert und `<script src>` im Browser ebenfalls.
- **Sprache der Oberfläche ist Deutsch**, mit korrekten Umlauten und ß.
- **Zahlenwerte aus der Spec, wörtlich:** Zeitschwelle-Standard `3000` ms; Bonus bei aktivem Mikrofon `+1000` ms; `3` Treffer bis gemeistert (Box 0→3); Auffrischungsintervalle `2`/`7`/`30` Tage; Box-Gewichte `3`/`2`/`1` für Box 0/1/2; höchstens jede `5.` Aufgabe eine Auffrischung; die letzten `3` Karten werden übersprungen; Kartenpool `1×1` bis `10×10` = `100` Karten, kommutativ getrennt.
- **Zentrale Fehlerregel:** Ein Spracherkennungsfehler darf niemals eine Karte werten. Nicht verstanden heißt: Karte unverändert, Aufgabe erneut stellen.
- **Testlauf:** `node --test test/` — muss nach jeder Task grün sein.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `logic.js` | Drei klar getrennte Abschnitte, in dieser Reihenfolge: (1) Zahlenparser, (2) Karten & Scheduler, (3) Speicherschicht. Reine Funktionen, keine Seiteneffekte. |
| `index.html` | Markup, Styles, DOM-Anbindung, Sprachausgabe, Spracheingabe, Zustandsmaschine der Übungsschleife. |
| `test/parser.test.js` | Tests für Abschnitt 1 von `logic.js`. |
| `test/scheduler.test.js` | Tests für Abschnitt 2 von `logic.js`. |
| `test/storage.test.js` | Tests für Abschnitt 3 von `logic.js`. |
| `README.md` | Kurzbeschreibung, lokale Nutzung, Deployment, Browser-Unterstützung. |

Die Spec legt zwei ausgelieferte Dateien fest; `logic.js` bündelt daher drei
Verantwortungen. Sie sind durch Kommentar-Banner klar getrennt und werden von
drei getrennten Testdateien abgedeckt.

---

## Task 1: Gerüst und Zahlenparser

**Files:**
- Create: `logic.js`
- Test: `test/parser.test.js`

**Interfaces:**
- Consumes: nichts
- Produces:
  - Globales/exportiertes Objekt `ML`
  - `ML.parseGermanNumber(text: string) -> number | null` — erkennt Zahlen 0–999 in Ziffern- oder deutscher Wortform, auch eingebettet in einen Satz. Liefert `null`, wenn keine Zahl gefunden wird.

**Kontext für den Umsetzenden:** Die Browser-Spracherkennung liefert deutsche
Zahlen in unvorhersehbarer Form: mal `"48"`, mal `"achtundvierzig"`, mal
`"acht und vierzig"`, oft mit Satzzeichen oder eingebettet in einen Satz. Der
Parser muss all das abdecken, darf aber keine Zahlen halluzinieren: `"keine
Ahnung"` enthält die Zeichenfolge `ein` und darf trotzdem nicht `1` liefern.
Deshalb wird nicht auf Teilzeichenketten gesucht, sondern über
**Wort-Teilfolgen**: der Text wird in Wörter zerlegt, und jede zusammenhängende
Folge von Wörtern wird zusammengeklebt und exakt gegen eine Tabelle geprüft.
`"acht und vierzig"` ergibt zusammengeklebt `"achtundvierzig"` und trifft; die
Wörter von `"keine Ahnung"` treffen in keiner Kombination.

Die Tabelle wird generativ aufgebaut (0–999 ausbuchstabiert), nicht von Hand
getippt — das ist kürzer und lückenlos.

- [ ] **Step 1: Testdatei anlegen und ersten Test schreiben**

Erstelle `test/parser.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const ML = require('../logic.js');

test('erkennt Ziffernform', () => {
  assert.strictEqual(ML.parseGermanNumber('48'), 48);
  assert.strictEqual(ML.parseGermanNumber('0'), 0);
  assert.strictEqual(ML.parseGermanNumber('100'), 100);
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `node --test test/`
Expected: FAIL mit `Cannot find module '../logic.js'`

- [ ] **Step 3: `logic.js` mit UMD-Gerüst und Ziffernerkennung anlegen**

Erstelle `logic.js`:

```js
/* Einmaleins-Trainer — reine Logik.
   Kein Zugriff auf window, document, localStorage, Date.now oder Math.random.
   Zeit, Zufall und Storage werden hineingereicht. */
(function (root, factory) {
  var ML = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = ML;
  else root.ML = ML;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ===================================================================
     Abschnitt 1 — Zahlenparser
     =================================================================== */

  function parseGermanNumber(text) {
    if (text == null) return null;
    var raw = String(text);
    var digits = raw.match(/\d+/);
    if (digits) return parseInt(digits[0], 10);
    return null;
  }

  return {
    parseGermanNumber: parseGermanNumber
  };
});
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

Run: `node --test test/`
Expected: PASS, 1 Test

- [ ] **Step 5: Test für deutsche Zahlwörter schreiben**

Ergänze in `test/parser.test.js`:

```js
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
```

- [ ] **Step 6: Test laufen lassen und Fehlschlag bestätigen**

Run: `node --test test/`
Expected: FAIL — `ML._spellGerman is not a function` und Wortformen liefern `null`

- [ ] **Step 7: Zahlwort-Tabelle und Teilfolgen-Suche implementieren**

Ersetze in `logic.js` Abschnitt 1 vollständig durch:

```js
  /* ===================================================================
     Abschnitt 1 — Zahlenparser
     =================================================================== */

  var ONES = ['null', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'];
  var TEENS = ['zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn',
               'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
  var TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig',
              'sechzig', 'siebzig', 'achtzig', 'neunzig'];

  function spellBelow100(n) {
    if (n < 10) return ONES[n];
    if (n < 20) return TEENS[n - 10];
    var t = Math.floor(n / 10), o = n % 10;
    return o === 0 ? TENS[t] : ONES[o] + 'und' + TENS[t];
  }

  function spellGerman(n) {
    if (n < 100) return spellBelow100(n);
    var h = Math.floor(n / 100), r = n % 100;
    return ONES[h] + 'hundert' + (r === 0 ? '' : spellBelow100(r));
  }

  // Normalisierung: Kleinschreibung, ß -> ss, alles außer Buchstaben und
  // Ziffern entfernt. Wird auf Eingabe UND Tabelle gleich angewandt.
  function normalizeWord(s) {
    return String(s).toLowerCase().replace(/ß/g, 'ss').replace(/[^a-zäöü0-9]/g, '');
  }

  var WORD_TO_NUMBER = (function () {
    var map = Object.create(null);
    for (var n = 0; n <= 999; n++) map[normalizeWord(spellGerman(n))] = n;
    // "hundertfünf" ist im Deutschen üblicher als "einhundertfünf"; die
    // generative Tabelle erzeugt nur die lange Form. Für 100-199 zusätzlich
    // die Form ohne führendes "ein" eintragen (3 Zeichen abschneiden).
    for (var h = 100; h <= 199; h++) {
      map[normalizeWord(spellGerman(h)).slice(3)] = h;
    }
    // Formen, die die generative Tabelle nicht erzeugt:
    map[normalizeWord('eins')] = 1;      // "ein" wird erzeugt, gesprochen wird "eins"
    map[normalizeWord('eine')] = 1;
    map[normalizeWord('zwo')] = 2;       // häufige Fehlerkennung
    return map;
  })();

  // Höchstzahl der Wörter, aus denen eine Zahl bestehen kann
  // ("zwei hundert drei und vierzig" = 6).
  var MAX_NUMBER_WORDS = 6;

  function parseGermanNumber(text) {
    if (text == null) return null;
    var raw = String(text);

    // 1. Ziffernform hat Vorrang: "das ist 48!" -> 48
    var digits = raw.match(/\d+/);
    if (digits) return parseInt(digits[0], 10);

    // 2. Wort-Teilfolgen: jede zusammenhängende Wortfolge zusammenkleben und
    //    exakt nachschlagen. Längere Treffer gewinnen, damit "acht und vierzig"
    //    als 48 und nicht als 8 gelesen wird.
    var words = raw.split(/\s+/).map(normalizeWord).filter(function (w) { return w.length > 0; });
    var best = null, bestLen = 0;
    for (var i = 0; i < words.length; i++) {
      var joined = '';
      for (var len = 1; len <= MAX_NUMBER_WORDS && i + len <= words.length; len++) {
        joined += words[i + len - 1];
        var hit = WORD_TO_NUMBER[joined];
        if (hit !== undefined && len > bestLen) { best = hit; bestLen = len; }
      }
    }
    return best;
  }
```

Und erweitere das Rückgabeobjekt am Dateiende:

```js
  return {
    parseGermanNumber: parseGermanNumber,
    _spellGerman: spellGerman
  };
```

- [ ] **Step 8: Test laufen lassen und Erfolg bestätigen**

Run: `node --test test/`
Expected: PASS, 6 Tests. Falls der 0–999-Test fehlschlägt, nennt die
Fehlermeldung die konkrete Zahl und ihre Wortform — dort liegt die Lücke.

- [ ] **Step 9: Commit**

```bash
git add logic.js test/parser.test.js
git commit -m "feat: deutscher Zahlenparser für 0-999 mit Wort-Teilfolgen-Suche"
```

---

## Task 2: Kartenpool und Kartenobjekt

**Files:**
- Modify: `logic.js` (Abschnitt 2 neu anlegen)
- Test: `test/scheduler.test.js`

**Interfaces:**
- Consumes: `ML` aus Task 1
- Produces:
  - `ML.BOX_MASTERED = 3`
  - `ML.cardKey(a: number, b: number) -> string` — z. B. `"7x8"`
  - `ML.parseCardKey(key: string) -> {a: number, b: number}`
  - `ML.ALL_CARD_KEYS -> string[]` — 100 Schlüssel, `"1x1"` bis `"10x10"`
  - `ML.newCard() -> {box, due, refreshLevel, seen, correct, bestMs, lastMs}`

- [ ] **Step 1: Test schreiben**

Erstelle `test/scheduler.test.js`:

```js
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
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `node --test test/`
Expected: FAIL — `ML.cardKey is not a function`

- [ ] **Step 3: Abschnitt 2 in `logic.js` anlegen**

Füge in `logic.js` nach Abschnitt 1 und vor dem `return`-Block ein:

```js
  /* ===================================================================
     Abschnitt 2 — Karten und Scheduler
     =================================================================== */

  var BOX_MASTERED = 3;

  function cardKey(a, b) { return a + 'x' + b; }

  function parseCardKey(key) {
    var parts = String(key).split('x');
    return { a: parseInt(parts[0], 10), b: parseInt(parts[1], 10) };
  }

  var ALL_CARD_KEYS = (function () {
    var keys = [];
    for (var a = 1; a <= 10; a++) {
      for (var b = 1; b <= 10; b++) keys.push(cardKey(a, b));
    }
    return keys;
  })();

  function newCard() {
    return { box: 0, due: 0, refreshLevel: 0, seen: 0, correct: 0, bestMs: null, lastMs: null };
  }
```

Erweitere das Rückgabeobjekt:

```js
    BOX_MASTERED: BOX_MASTERED,
    cardKey: cardKey,
    parseCardKey: parseCardKey,
    ALL_CARD_KEYS: ALL_CARD_KEYS,
    newCard: newCard,
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

Run: `node --test test/`
Expected: PASS, 9 Tests

- [ ] **Step 5: Commit**

```bash
git add logic.js test/scheduler.test.js
git commit -m "feat: Kartenpool 1x1 bis 10x10 mit kommutativ getrennten Karten"
```

---

## Task 3: Bewertung in der Lernphase (Box 0–2)

**Files:**
- Modify: `logic.js` (Abschnitt 2 erweitern)
- Test: `test/scheduler.test.js`

**Interfaces:**
- Consumes: `ML.newCard`, `ML.BOX_MASTERED`
- Produces:
  - `ML.DAY_MS = 86400000`
  - `ML.REFRESH_INTERVALS_MS = [2*DAY, 7*DAY, 30*DAY]`
  - `ML.DEFAULT_THRESHOLD_MS = 3000`
  - `ML.STT_THRESHOLD_BONUS_MS = 1000`
  - `ML.gradeAnswer(card, opts) -> card` — liefert ein **neues** Kartenobjekt, mutiert das übergebene nicht. `opts = {correct: boolean, elapsedMs: number, thresholdMs: number, now: number}`.

**Kontext:** Ein *Treffer* ist `correct && elapsedMs <= thresholdMs`. In der
Lernphase (Box < 3) gilt: Treffer schiebt eine Box hoch; richtig aber zu langsam
lässt die Box unverändert; falsch setzt auf Box 0 zurück. Beim Erreichen von
Box 3 wird die Karte gemeistert und bekommt sofort ihr erstes Fälligkeitsdatum
`now + 2 Tage` bei `refreshLevel: 0`.

- [ ] **Step 1: Test schreiben**

Ergänze in `test/scheduler.test.js`:

```js
const T = ML.DEFAULT_THRESHOLD_MS; // 3000
const NOW = 1_000_000_000_000;

function grade(card, correct, elapsedMs, now = NOW) {
  return ML.gradeAnswer(card, { correct, elapsedMs, thresholdMs: T, now });
}

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
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `node --test test/`
Expected: FAIL — `ML.gradeAnswer is not a function`

- [ ] **Step 3: `gradeAnswer` für die Lernphase implementieren**

Füge in `logic.js` Abschnitt 2 nach `newCard` ein:

```js
  var DAY_MS = 86400000;
  var REFRESH_INTERVALS_MS = [2 * DAY_MS, 7 * DAY_MS, 30 * DAY_MS];
  var DEFAULT_THRESHOLD_MS = 3000;
  var STT_THRESHOLD_BONUS_MS = 1000;

  function refreshIntervalFor(level) {
    var i = Math.min(level, REFRESH_INTERVALS_MS.length - 1);
    return REFRESH_INTERVALS_MS[i];
  }

  function gradeAnswer(card, opts) {
    var next = {
      box: card.box, due: card.due, refreshLevel: card.refreshLevel,
      seen: card.seen + 1,
      correct: card.correct + (opts.correct ? 1 : 0),
      bestMs: card.bestMs,
      lastMs: opts.elapsedMs
    };
    if (opts.correct && (card.bestMs === null || opts.elapsedMs < card.bestMs)) {
      next.bestMs = opts.elapsedMs;
    }

    var hit = opts.correct && opts.elapsedMs <= opts.thresholdMs;

    if (!opts.correct) {
      next.box = 0;
      next.refreshLevel = 0;
      next.due = 0;
      return next;
    }
    if (hit) {
      next.box = Math.min(card.box + 1, BOX_MASTERED);
      if (next.box === BOX_MASTERED) {
        next.due = opts.now + refreshIntervalFor(next.refreshLevel);
      }
    }
    return next;
  }
```

Erweitere das Rückgabeobjekt:

```js
    DAY_MS: DAY_MS,
    REFRESH_INTERVALS_MS: REFRESH_INTERVALS_MS,
    DEFAULT_THRESHOLD_MS: DEFAULT_THRESHOLD_MS,
    STT_THRESHOLD_BONUS_MS: STT_THRESHOLD_BONUS_MS,
    gradeAnswer: gradeAnswer,
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

Run: `node --test test/`
Expected: PASS, 16 Tests

- [ ] **Step 5: Commit**

```bash
git add logic.js test/scheduler.test.js
git commit -m "feat: Bewertung in der Lernphase mit Zeitschwelle und Boxaufstieg"
```

---

## Task 4: Bewertung in der Auffrischung (Box 3)

**Files:**
- Modify: `logic.js` (`gradeAnswer` erweitern)
- Test: `test/scheduler.test.js`

**Interfaces:**
- Consumes: `ML.gradeAnswer` aus Task 3
- Produces: keine neuen Namen — `gradeAnswer` behandelt zusätzlich `card.box === 3`

**Kontext:** Eine bereits gemeisterte Karte (Box 3) verhält sich anders als eine
in der Lernphase. Treffer: `refreshLevel` steigt, neues `due` mit dem *neuen*
Intervall. Richtig aber zu langsam: Karte bleibt gemeistert, `refreshLevel`
bleibt stehen, `due` wird mit **demselben** Intervall neu gesetzt. Falsch: zurück
auf Box 0, `refreshLevel: 0`, `due: 0`. Der Fall „falsch" ist bereits aus Task 3
korrekt implementiert; zu ergänzen sind die beiden richtigen Fälle.

- [ ] **Step 1: Test schreiben**

Ergänze in `test/scheduler.test.js`:

```js
function masteredCard(refreshLevel = 0) {
  return { ...ML.newCard(), box: ML.BOX_MASTERED, refreshLevel, due: NOW - 1000 };
}

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
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `node --test test/`
Expected: FAIL — `refreshLevel` bleibt 0 statt 1, und die langsame Auffrischung
setzt kein neues `due`

- [ ] **Step 3: Auffrischungszweig ergänzen**

Ersetze in `logic.js` den Rumpf von `gradeAnswer` ab `var hit = ...` durch:

```js
    var hit = opts.correct && opts.elapsedMs <= opts.thresholdMs;

    if (!opts.correct) {
      next.box = 0;
      next.refreshLevel = 0;
      next.due = 0;
      return next;
    }

    if (card.box === BOX_MASTERED) {
      // Auffrischung: Treffer steigt eine Stufe, langsam wiederholt die Stufe.
      if (hit) next.refreshLevel = card.refreshLevel + 1;
      next.due = opts.now + refreshIntervalFor(next.refreshLevel);
      return next;
    }

    if (hit) {
      next.box = Math.min(card.box + 1, BOX_MASTERED);
      if (next.box === BOX_MASTERED) {
        next.due = opts.now + refreshIntervalFor(next.refreshLevel);
      }
    }
    return next;
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

Run: `node --test test/`
Expected: PASS, 19 Tests

- [ ] **Step 5: Commit**

```bash
git add logic.js test/scheduler.test.js
git commit -m "feat: Auffrischungslogik mit 2/7/30-Tage-Intervallen"
```

---

## Task 5: Auswahl der nächsten Aufgabe aus der Lernphase

**Files:**
- Modify: `logic.js` (Abschnitt 2 erweitern)
- Test: `test/scheduler.test.js`

**Interfaces:**
- Consumes: `ML.BOX_MASTERED`, `ML.newCard`
- Produces:
  - `ML.BOX_WEIGHTS = [3, 2, 1]`
  - `ML.RECENT_MEMORY = 3`
  - `ML.pickNext(cards, opts) -> string | null` — `cards` ist ein Objekt
    `{key: card}`. `opts = {now: number, recent: string[], answered: number,
    refreshesShown: number, rng: () => number}`. `rng` liefert `[0, 1)`.
    Rückgabe ist ein Kartenschlüssel oder `null`, wenn nichts zu tun ist.

**Kontext:** Diese Task deckt nur den Lernphasen-Zweig ab; Auffrischungen kommen
in Task 6 dazu. Gewichtete Auswahl: Box 0 zählt dreifach, Box 1 doppelt, Box 2
einfach. Die zuletzt gestellten drei Karten werden übersprungen — es sei denn,
danach bliebe nichts übrig, dann wird ohne diese Einschränkung gewählt (das ist
der von der Spec geforderte Fall „Pool hat drei oder weniger Karten").

Für die Tests wird `rng` deterministisch übergeben, damit die gewichtete Auswahl
prüfbar ist statt nur statistisch plausibel.

- [ ] **Step 1: Test schreiben**

Ergänze in `test/scheduler.test.js`:

```js
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
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `node --test test/`
Expected: FAIL — `ML.pickNext is not a function`

- [ ] **Step 3: `pickNext` mit gewichteter Auswahl implementieren**

Füge in `logic.js` Abschnitt 2 nach `gradeAnswer` ein:

```js
  var BOX_WEIGHTS = [3, 2, 1];
  var RECENT_MEMORY = 3;

  function weightedPick(keys, cards, rng) {
    var total = 0, i;
    for (i = 0; i < keys.length; i++) total += BOX_WEIGHTS[cards[keys[i]].box];
    var roll = rng() * total;
    for (i = 0; i < keys.length; i++) {
      roll -= BOX_WEIGHTS[cards[keys[i]].box];
      if (roll < 0) return keys[i];
    }
    return keys[keys.length - 1]; // Absicherung gegen Rundungsfehler
  }

  function pickNext(cards, opts) {
    var recent = opts.recent.slice(-RECENT_MEMORY);
    var keys = Object.keys(cards);
    var i, key;

    var learning = [];
    for (i = 0; i < keys.length; i++) {
      key = keys[i];
      if (cards[key].box < BOX_MASTERED) learning.push(key);
    }

    if (learning.length === 0) return null;

    // Wiederholungssperre nur anwenden, wenn danach noch etwas übrig bleibt.
    var filtered = learning.filter(function (k) { return recent.indexOf(k) === -1; });
    var pool = filtered.length > 0 ? filtered : learning;

    return weightedPick(pool, cards, opts.rng);
  }
```

Erweitere das Rückgabeobjekt:

```js
    BOX_WEIGHTS: BOX_WEIGHTS,
    RECENT_MEMORY: RECENT_MEMORY,
    pickNext: pickNext,
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

Run: `node --test test/`
Expected: PASS, 24 Tests

- [ ] **Step 5: Commit**

```bash
git add logic.js test/scheduler.test.js
git commit -m "feat: gewichtete Aufgabenauswahl mit Wiederholungssperre"
```

---

## Task 6: Auffrischungen einplanen, Quote und leerer Pool

**Files:**
- Modify: `logic.js` (`pickNext` erweitern)
- Test: `test/scheduler.test.js`

**Interfaces:**
- Consumes: `ML.pickNext` aus Task 5
- Produces:
  - `ML.REFRESH_EVERY = 5`
  - `pickNext` berücksichtigt zusätzlich fällige Auffrischungen und liefert
    `null`, wenn alles gemeistert und nichts fällig ist

**Kontext:** Fällig ist eine Karte mit `box === 3 && due > 0 && due <= now`.
Die Quote „höchstens jede fünfte Aufgabe" wird als
`refreshesShown * REFRESH_EVERY <= answered` geprüft: bei 0 beantworteten
Aufgaben und 0 gezeigten Auffrischungen ist eine erlaubt, danach erst wieder ab
der 5. beantworteten Aufgabe. Von mehreren fälligen Karten kommt die am längsten
überfällige zuerst — das ist deterministisch und damit testbar. Wenn es gar
keine Lernkarten mehr gibt, wird eine fällige Auffrischung **ohne** Quotenprüfung
gestellt; die Quote soll nur verhindern, dass Wiederholungen echte Lernarbeit
verdrängen.

- [ ] **Step 1: Test schreiben**

Ergänze in `test/scheduler.test.js`:

```js
function dueRefresh(cards, key, dueAt) {
  cards[key] = { ...ML.newCard(), box: ML.BOX_MASTERED, due: dueAt };
  return cards;
}

test('eine fällige Auffrischung hat Vorrang, solange die Quote es erlaubt', () => {
  const cards = dueRefresh(cardsFrom({ '2x2': 0 }), '1x1', NOW - 1000);
  assert.strictEqual(pick(cards, { answered: 0, refreshesShown: 0 }), '1x1');
});

test('nicht fällige gemeisterte Karten werden nicht gestellt', () => {
  const cards = dueRefresh(cardsFrom({ '2x2': 0 }), '1x1', NOW + ML.DAY_MS);
  assert.strictEqual(pick(cards, { answered: 0, refreshesShown: 0 }), '2x2');
});

test('die Quote lässt höchstens jede fünfte Aufgabe eine Auffrischung sein', () => {
  const cards = dueRefresh(cardsFrom({ '2x2': 0 }), '1x1', NOW - 1000);
  // Eine Auffrischung ist bereits gezeigt: bis zur 5. Antwort keine weitere.
  assert.strictEqual(pick(cards, { answered: 1, refreshesShown: 1 }), '2x2');
  assert.strictEqual(pick(cards, { answered: 4, refreshesShown: 1 }), '2x2');
  assert.strictEqual(pick(cards, { answered: 5, refreshesShown: 1 }), '1x1');
});

test('ohne Lernkarten wird die Auffrischung auch gegen die Quote gestellt', () => {
  const cards = dueRefresh({}, '1x1', NOW - 1000);
  assert.strictEqual(pick(cards, { answered: 1, refreshesShown: 1 }), '1x1');
});

test('die am längsten überfällige Karte kommt zuerst', () => {
  let cards = dueRefresh({}, '1x1', NOW - 1000);
  cards = dueRefresh(cards, '2x2', NOW - 90000);
  assert.strictEqual(pick(cards), '2x2');
});

test('alles gemeistert und nichts fällig ergibt null', () => {
  const cards = dueRefresh({}, '1x1', NOW + ML.DAY_MS);
  assert.strictEqual(pick(cards), null);
});

test('REFRESH_EVERY ist 5', () => {
  assert.strictEqual(ML.REFRESH_EVERY, 5);
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `node --test test/`
Expected: FAIL — Auffrischungen werden gar nicht gestellt, `ML.REFRESH_EVERY` ist
undefiniert

- [ ] **Step 3: Auffrischungszweig in `pickNext` ergänzen**

Ersetze `pickNext` in `logic.js` vollständig durch:

```js
  var REFRESH_EVERY = 5;

  function pickNext(cards, opts) {
    var recent = opts.recent.slice(-RECENT_MEMORY);
    var keys = Object.keys(cards);
    var i, key, card;

    var learning = [];
    var due = [];
    for (i = 0; i < keys.length; i++) {
      key = keys[i];
      card = cards[key];
      if (card.box < BOX_MASTERED) learning.push(key);
      else if (card.due > 0 && card.due <= opts.now) due.push(key);
    }

    // Am längsten überfällig zuerst — deterministisch.
    due.sort(function (x, y) { return cards[x].due - cards[y].due; });

    var quotaAllows = opts.refreshesShown * REFRESH_EVERY <= opts.answered;
    if (due.length > 0 && (quotaAllows || learning.length === 0)) {
      var freshDue = due.filter(function (k) { return recent.indexOf(k) === -1; });
      if (freshDue.length > 0) return freshDue[0];
      if (learning.length === 0) return due[0];
    }

    if (learning.length === 0) return null;

    var filtered = learning.filter(function (k) { return recent.indexOf(k) === -1; });
    var pool = filtered.length > 0 ? filtered : learning;

    return weightedPick(pool, cards, opts.rng);
  }
```

Erweitere das Rückgabeobjekt:

```js
    REFRESH_EVERY: REFRESH_EVERY,
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

Run: `node --test test/`
Expected: PASS, 31 Tests

- [ ] **Step 5: Commit**

```bash
git add logic.js test/scheduler.test.js
git commit -m "feat: fällige Auffrischungen mit Quote von höchstens jeder fünften Aufgabe"
```

---

## Task 7: Speicherschicht mit Profilen

**Files:**
- Modify: `logic.js` (Abschnitt 3 neu anlegen)
- Test: `test/storage.test.js`

**Interfaces:**
- Consumes: `ML.ALL_CARD_KEYS`, `ML.newCard`, `ML.DEFAULT_THRESHOLD_MS`
- Produces:
  - `ML.STORAGE_KEY = 'mathelerner.v1'`
  - `ML.DEFAULT_SETTINGS = {tts: false, stt: false, thresholdMs: 3000}`
  - `ML.defaultState() -> {version: 1, activeProfile: null, profiles: {}}`
  - `ML.newProfile(name, now) -> {name, created, settings, cards, stats}`
  - `ML.loadState(storage) -> state` — `storage` ist ein Objekt mit
    `getItem(key)` und `setItem(key, value)`. Beschädigtes oder fehlendes JSON
    ergibt `defaultState()`.
  - `ML.saveState(storage, state) -> void`
  - `ML.createProfile(state, name, now) -> {state, id}` — liefert einen neuen
    Zustand, mutiert den übergebenen nicht; `id` ist der Schlüssel des neuen
    Profils und wird zum aktiven Profil.
  - `ML.deleteProfile(state, id) -> state`
  - `ML.openCount(profile) -> number` — Karten unterhalb von Box 3

**Kontext:** `logic.js` darf `localStorage` nicht kennen; das Storage-Objekt
kommt als Parameter. Im Browser wird `window.localStorage` hineingereicht, im
Test ein einfaches Fake. Profil-IDs sind `p1`, `p2`, … mit der kleinsten freien
Nummer — deterministisch und damit testbar.

- [ ] **Step 1: Test schreiben**

Erstelle `test/storage.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const ML = require('../logic.js');

const NOW = 1_000_000_000_000;

function fakeStorage(initial) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    _data: data
  };
}

test('leerer Speicher ergibt den Standardzustand', () => {
  assert.deepStrictEqual(ML.loadState(fakeStorage({})), {
    version: 1, activeProfile: null, profiles: {}
  });
});

test('beschädigtes JSON führt nicht zum Absturz', () => {
  const s = fakeStorage({ [ML.STORAGE_KEY]: '{kaputt' });
  assert.deepStrictEqual(ML.loadState(s), ML.defaultState());
});

test('unsinniger, aber gültiger JSON-Inhalt ergibt den Standardzustand', () => {
  assert.deepStrictEqual(ML.loadState(fakeStorage({ [ML.STORAGE_KEY]: '42' })), ML.defaultState());
  assert.deepStrictEqual(ML.loadState(fakeStorage({ [ML.STORAGE_KEY]: 'null' })), ML.defaultState());
  assert.deepStrictEqual(
    ML.loadState(fakeStorage({ [ML.STORAGE_KEY]: '{"version":99}' })),
    ML.defaultState(), 'unbekannte Version wird verworfen'
  );
});

test('Speichern und Laden ergibt denselben Zustand', () => {
  const s = fakeStorage({});
  const { state } = ML.createProfile(ML.defaultState(), 'Anna', NOW);
  ML.saveState(s, state);
  assert.deepStrictEqual(ML.loadState(s), state);
});

test('ein neues Profil bekommt alle 100 Karten in Box 0', () => {
  const p = ML.newProfile('Anna', NOW);
  assert.strictEqual(p.name, 'Anna');
  assert.strictEqual(p.created, NOW);
  assert.strictEqual(Object.keys(p.cards).length, 100);
  assert.deepStrictEqual(p.cards['7x8'], ML.newCard());
  assert.deepStrictEqual(p.settings, ML.DEFAULT_SETTINGS);
  assert.deepStrictEqual(p.stats, { sessions: 0, totalAnswers: 0 });
});

test('Profile bekommen fortlaufende IDs und werden aktiv gesetzt', () => {
  let r = ML.createProfile(ML.defaultState(), 'Anna', NOW);
  assert.strictEqual(r.id, 'p1');
  assert.strictEqual(r.state.activeProfile, 'p1');

  r = ML.createProfile(r.state, 'Ben', NOW);
  assert.strictEqual(r.id, 'p2');
  assert.strictEqual(r.state.activeProfile, 'p2');
  assert.deepStrictEqual(Object.keys(r.state.profiles), ['p1', 'p2']);
});

test('createProfile mutiert den übergebenen Zustand nicht', () => {
  const base = ML.defaultState();
  ML.createProfile(base, 'Anna', NOW);
  assert.deepStrictEqual(base, ML.defaultState());
});

test('gelöschte Profile verschwinden, das aktive rückt nach', () => {
  let r = ML.createProfile(ML.defaultState(), 'Anna', NOW);
  r = ML.createProfile(r.state, 'Ben', NOW);

  let state = ML.deleteProfile(r.state, 'p2');
  assert.deepStrictEqual(Object.keys(state.profiles), ['p1']);
  assert.strictEqual(state.activeProfile, 'p1', 'aktives Profil rückt nach');

  state = ML.deleteProfile(state, 'p1');
  assert.deepStrictEqual(state.profiles, {});
  assert.strictEqual(state.activeProfile, null);
});

test('freigewordene Profil-IDs werden wiederverwendet', () => {
  let r = ML.createProfile(ML.defaultState(), 'Anna', NOW);
  r = ML.createProfile(r.state, 'Ben', NOW);
  const state = ML.deleteProfile(r.state, 'p1');
  assert.strictEqual(ML.createProfile(state, 'Cem', NOW).id, 'p1');
});

test('openCount zählt die Karten unterhalb von Box 3', () => {
  const p = ML.newProfile('Anna', NOW);
  assert.strictEqual(ML.openCount(p), 100);
  p.cards['7x8'].box = ML.BOX_MASTERED;
  p.cards['1x1'].box = 2;
  assert.strictEqual(ML.openCount(p), 99);
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `node --test test/`
Expected: FAIL — `ML.loadState is not a function`

- [ ] **Step 3: Abschnitt 3 in `logic.js` anlegen**

Füge in `logic.js` nach Abschnitt 2 und vor dem `return`-Block ein:

```js
  /* ===================================================================
     Abschnitt 3 — Speicherschicht
     =================================================================== */

  var STORAGE_KEY = 'mathelerner.v1';
  var STATE_VERSION = 1;
  var DEFAULT_SETTINGS = { tts: false, stt: false, thresholdMs: DEFAULT_THRESHOLD_MS };

  function defaultState() {
    return { version: STATE_VERSION, activeProfile: null, profiles: {} };
  }

  function newProfile(name, now) {
    var cards = {};
    for (var i = 0; i < ALL_CARD_KEYS.length; i++) cards[ALL_CARD_KEYS[i]] = newCard();
    return {
      name: name,
      created: now,
      settings: { tts: DEFAULT_SETTINGS.tts, stt: DEFAULT_SETTINGS.stt,
                  thresholdMs: DEFAULT_SETTINGS.thresholdMs },
      cards: cards,
      stats: { sessions: 0, totalAnswers: 0 }
    };
  }

  function loadState(storage) {
    var raw;
    try { raw = storage.getItem(STORAGE_KEY); } catch (e) { return defaultState(); }
    if (!raw) return defaultState();
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return defaultState(); }
    if (!parsed || typeof parsed !== 'object') return defaultState();
    if (parsed.version !== STATE_VERSION) return defaultState();
    if (!parsed.profiles || typeof parsed.profiles !== 'object') return defaultState();
    return parsed;
  }

  function saveState(storage, state) {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* voll oder gesperrt */ }
  }

  function nextProfileId(profiles) {
    var n = 1;
    while (profiles['p' + n]) n++;
    return 'p' + n;
  }

  function createProfile(state, name, now) {
    var profiles = {}, keys = Object.keys(state.profiles), i;
    for (i = 0; i < keys.length; i++) profiles[keys[i]] = state.profiles[keys[i]];
    var id = nextProfileId(profiles);
    profiles[id] = newProfile(name, now);
    return {
      state: { version: STATE_VERSION, activeProfile: id, profiles: profiles },
      id: id
    };
  }

  function deleteProfile(state, id) {
    var profiles = {}, keys = Object.keys(state.profiles), i;
    for (i = 0; i < keys.length; i++) {
      if (keys[i] !== id) profiles[keys[i]] = state.profiles[keys[i]];
    }
    var remaining = Object.keys(profiles);
    var active = state.activeProfile === id
      ? (remaining.length > 0 ? remaining[0] : null)
      : state.activeProfile;
    return { version: STATE_VERSION, activeProfile: active, profiles: profiles };
  }

  function openCount(profile) {
    var keys = Object.keys(profile.cards), n = 0;
    for (var i = 0; i < keys.length; i++) {
      if (profile.cards[keys[i]].box < BOX_MASTERED) n++;
    }
    return n;
  }
```

Erweitere das Rückgabeobjekt:

```js
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    defaultState: defaultState,
    newProfile: newProfile,
    loadState: loadState,
    saveState: saveState,
    createProfile: createProfile,
    deleteProfile: deleteProfile,
    openCount: openCount,
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

Run: `node --test test/`
Expected: PASS, 41 Tests

- [ ] **Step 5: Commit**

```bash
git add logic.js test/storage.test.js
git commit -m "feat: Speicherschicht mit Profilen und Schutz gegen kaputten localStorage"
```

---

## Task 8: Spielbarer Tastaturmodus

**Files:**
- Create: `index.html`

**Interfaces:**
- Consumes: `ML.loadState`, `ML.saveState`, `ML.createProfile`, `ML.pickNext`,
  `ML.gradeAnswer`, `ML.parseCardKey`, `ML.openCount`, `ML.DEFAULT_THRESHOLD_MS`
- Produces: eine lauffähige Seite. Spätere Tasks hängen sich an die hier
  definierten Funktionen `nextQuestion()`, `submitAnswer(value)` und
  `render()` sowie an die Element-IDs `#question`, `#answer`, `#progress`,
  `#feedback`, `#toolbar`.

**Kontext:** Ab hier gibt es keine automatisierten Tests mehr — Browser-DOM,
Sprachausgabe und Mikrofon lassen sich ohne Zusatzabhängigkeiten nicht
sinnvoll automatisiert prüfen, und die Spec verlangt ausdrücklich manuelle
Verifikation. Jede UI-Task endet deshalb mit einer **konkreten Klickfolge und
der erwarteten Beobachtung**. Führe sie tatsächlich aus und berichte, was du
gesehen hast; behaupte nichts Ungeprüftes.

Ziel dieser Task ist ein Stand, der bereits als Lerntool benutzbar ist: ein
Profil wird beim ersten Start automatisch angelegt, Aufgaben erscheinen, werden
per Tastatur beantwortet und der Fortschritt überlebt einen Neuladen.

- [ ] **Step 1: `index.html` anlegen**

Erstelle `index.html`:

```html
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Einmaleins</title>
<style>
  :root {
    --bg: #fbfbfa; --fg: #1a1a1a; --muted: #8a8a85;
    --ok: #2e7d32; --bad: #c62828; --line: #e3e3df;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #16171a; --fg: #f0f0ee; --muted: #85858c;
            --ok: #6dd47e; --bad: #ff6b6b; --line: #2c2d31; }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    background: var(--bg); color: var(--fg);
    font: 400 16px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 3vh; padding: 4vh 5vw;
    -webkit-text-size-adjust: 100%;
  }
  body.ok  #question { color: var(--ok); }
  body.bad #question { color: var(--bad); }
  #question {
    font-size: clamp(3rem, 18vw, 9rem); font-weight: 300;
    font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
    transition: color .12s ease; text-align: center;
  }
  #answer {
    font: 300 clamp(2rem, 10vw, 4.5rem)/1 inherit;
    font-variant-numeric: tabular-nums;
    width: 4.5ch; text-align: center; padding: .1em .1em .15em;
    background: transparent; color: inherit;
    border: none; border-bottom: 3px solid var(--line); border-radius: 0;
  }
  #answer:focus { outline: none; border-bottom-color: var(--fg); }
  #feedback { min-height: 1.6em; font-size: 1.1rem; color: var(--muted); text-align: center; }
  #progress { font-size: .9rem; color: var(--muted); font-variant-numeric: tabular-nums; }
  #toolbar { position: fixed; top: 1rem; right: 1rem; display: flex; gap: .4rem; }
  #toolbar button {
    font-size: 1.1rem; line-height: 1; padding: .45rem .55rem; cursor: pointer;
    background: transparent; color: var(--muted);
    border: 1px solid var(--line); border-radius: .5rem;
  }
  #toolbar button[aria-pressed="true"] { color: var(--fg); border-color: var(--fg); }
  #toolbar button[disabled] { opacity: .35; cursor: not-allowed; }
  #done { text-align: center; max-width: 32ch; }
  [hidden] { display: none !important; }
</style>
</head>
<body>

<div id="toolbar"></div>

<main id="trainer">
  <div id="question" aria-live="polite">&nbsp;</div>
  <input id="answer" type="text" inputmode="numeric" autocomplete="off"
         autocorrect="off" spellcheck="false" aria-label="Antwort">
  <div id="feedback" aria-live="polite"></div>
</main>

<div id="done" hidden>
  <p>Alles gemeistert. Nichts steht zur Auffrischung an.</p>
  <button id="freeplay">Trotzdem weiterüben</button>
</div>

<div id="progress"></div>

<script src="logic.js"></script>
<script>
(function () {
  'use strict';

  var el = {
    question: document.getElementById('question'),
    answer: document.getElementById('answer'),
    feedback: document.getElementById('feedback'),
    progress: document.getElementById('progress'),
    trainer: document.getElementById('trainer'),
    done: document.getElementById('done'),
    freeplay: document.getElementById('freeplay')
  };

  var state = ML.loadState(window.localStorage);
  if (!state.activeProfile) {
    var created = ML.createProfile(state, 'Ich', Date.now());
    state = created.state;
    ML.saveState(window.localStorage, state);
  }

  var session = {
    currentKey: null,
    expected: 0,
    startedAt: 0,
    recent: [],
    answered: 0,
    refreshesShown: 0,
    awaitingAck: false,   // wartet nach einem Fehler auf Enter
    freeplay: false
  };

  function profile() { return state.profiles[state.activeProfile]; }

  function persist() { ML.saveState(window.localStorage, state); }

  function thresholdMs() { return profile().settings.thresholdMs; }

  function flash(cls) {
    document.body.classList.add(cls);
    setTimeout(function () { document.body.classList.remove(cls); }, 260);
  }

  function render() {
    el.progress.textContent = 'noch ' + ML.openCount(profile()) + ' von 100 offen';
  }

  function nextQuestion() {
    var key = ML.pickNext(profile().cards, {
      now: Date.now(),
      recent: session.recent,
      answered: session.answered,
      refreshesShown: session.refreshesShown,
      rng: Math.random
    });

    if (key === null && !session.freeplay) {
      session.currentKey = null;
      el.trainer.hidden = true;
      el.done.hidden = false;
      render();
      return;
    }
    if (key === null) {
      // Freies Weiterüben: gleichgewichtet aus allen Karten ziehen.
      var all = Object.keys(profile().cards);
      key = all[Math.floor(Math.random() * all.length)];
    }

    var wasRefresh = profile().cards[key].box === ML.BOX_MASTERED;
    if (wasRefresh) session.refreshesShown++;

    var ab = ML.parseCardKey(key);
    session.currentKey = key;
    session.expected = ab.a * ab.b;
    session.startedAt = Date.now();
    session.awaitingAck = false;

    el.question.textContent = ab.a + ' × ' + ab.b;
    el.answer.value = '';
    el.feedback.textContent = '';
    el.answer.focus();
    render();
  }

  // elapsedMs kann übersteuert werden (Sprachmodus misst anders).
  function submitAnswer(value, elapsedMs) {
    if (session.currentKey === null || session.awaitingAck) return;
    if (value === null || isNaN(value)) return;   // nicht verstanden: nicht werten

    var elapsed = typeof elapsedMs === 'number' ? elapsedMs : Date.now() - session.startedAt;
    var correct = value === session.expected;
    var p = profile();

    p.cards[session.currentKey] = ML.gradeAnswer(p.cards[session.currentKey], {
      correct: correct, elapsedMs: elapsed,
      thresholdMs: thresholdMs(), now: Date.now()
    });
    p.stats.totalAnswers++;

    session.recent.push(session.currentKey);
    if (session.recent.length > ML.RECENT_MEMORY) session.recent.shift();
    session.answered++;
    persist();

    if (correct) {
      flash('ok');
      nextQuestion();
    } else {
      flash('bad');
      el.feedback.textContent = 'Richtig wäre ' + session.expected + ' — Enter für weiter';
      session.awaitingAck = true;
      render();
    }
  }

  el.answer.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (session.awaitingAck) { nextQuestion(); return; }
    var raw = el.answer.value.trim();
    if (raw === '') return;
    submitAnswer(parseInt(raw, 10));
  });

  el.freeplay.addEventListener('click', function () {
    session.freeplay = true;
    el.done.hidden = true;
    el.trainer.hidden = false;
    nextQuestion();
  });

  profile().stats.sessions++;
  persist();
  nextQuestion();

  window.__app = { session: session, nextQuestion: nextQuestion,
                   submitAnswer: submitAnswer, render: render,
                   profile: profile, persist: persist };
})();
</script>
</body>
</html>
```

- [ ] **Step 2: Sicherstellen, dass die Logiktests weiterhin grün sind**

Run: `node --test test/`
Expected: PASS, 41 Tests (unverändert — `index.html` wird nicht getestet)

- [ ] **Step 3: Manuell im Browser prüfen**

Starte einen lokalen Server und öffne die Seite:

```bash
python3 -m http.server 8000
```

Öffne `http://localhost:8000/` und prüfe der Reihe nach:

1. Eine Aufgabe wie `7 × 8` erscheint groß und zentriert, das Eingabefeld hat den Fokus.
2. Unten steht `noch 100 von 100 offen`.
3. Richtige Antwort + Enter → kurzes grünes Aufblitzen, sofort neue Aufgabe, **kein** zusätzlicher Klick nötig.
4. Falsche Antwort + Enter → rotes Aufblitzen, Text `Richtig wäre N — Enter für weiter`, die Aufgabe bleibt stehen bis Enter.
5. Dieselbe Aufgabe kommt nicht unmittelbar zweimal hintereinander.
6. Beantworte dieselbe Aufgabe dreimal schnell richtig → der Zähler unten sinkt auf `noch 99 von 100 offen`.
7. Seite neu laden → der Zähler steht weiterhin auf 99, der Fortschritt hat überlebt.
8. Systemdesign auf Dunkelmodus stellen → die Seite wechselt die Farben.

Notiere jeden Punkt, der nicht wie beschrieben eintritt, und behebe ihn, bevor
du committest.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: spielbarer Tastaturmodus mit Fortschrittsanzeige"
```

---

## Task 9: Profilverwaltung und Einstellungen

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `ML.createProfile`, `ML.deleteProfile`, `ML.saveState`,
  `window.__app.render`, `window.__app.nextQuestion`
- Produces: Element-IDs `#menu-button`, `#menu`, `#profile-select`,
  `#threshold`; Funktion `renderMenu()`

**Kontext:** Die Spec verlangt, dass alles außer der Aufgabe hinter einem
einzelnen unauffälligen Knopf liegt. Das Menü ist ein Overlay, das die
Übungsansicht verdeckt, solange es offen ist.

- [ ] **Step 1: Menü-Markup und Styles ergänzen**

Füge in `index.html` innerhalb von `<style>` vor `[hidden]` ein:

```css
  #menu {
    position: fixed; inset: 0; background: var(--bg);
    padding: 6vh 5vw; overflow: auto;
    display: flex; flex-direction: column; gap: 1.4rem; align-items: flex-start;
  }
  #menu h2 { font-size: 1rem; font-weight: 600; margin: 0; }
  #menu label { display: block; font-size: .9rem; color: var(--muted); margin-bottom: .3rem; }
  #menu select, #menu input[type="number"], #menu input[type="text"] {
    font: inherit; padding: .45rem .6rem; background: transparent; color: inherit;
    border: 1px solid var(--line); border-radius: .5rem;
  }
  #menu button {
    font: inherit; padding: .45rem .8rem; cursor: pointer;
    background: transparent; color: inherit;
    border: 1px solid var(--line); border-radius: .5rem;
  }
  .row { display: flex; gap: .5rem; align-items: flex-end; flex-wrap: wrap; }
```

Füge im `<body>` direkt nach `<div id="toolbar"></div>` ein:

```html
<section id="menu" hidden>
  <h2>Profil</h2>
  <div class="row">
    <div>
      <label for="profile-select">Aktives Profil</label>
      <select id="profile-select"></select>
    </div>
    <button id="profile-delete">Löschen</button>
  </div>
  <div class="row">
    <div>
      <label for="profile-name">Neues Profil</label>
      <input id="profile-name" type="text" autocomplete="off" placeholder="Name">
    </div>
    <button id="profile-add">Anlegen</button>
  </div>

  <h2>Einstellungen</h2>
  <div>
    <label for="threshold">Zeitschwelle in Sekunden</label>
    <input id="threshold" type="number" min="1" max="30" step="0.5">
  </div>

  <button id="menu-close">Zurück zum Üben</button>
</section>
```

- [ ] **Step 2: Menü-Knopf in die Toolbar setzen und Logik ergänzen**

Ersetze im Skript die Zeile `var el = {` … `};` durch dieselbe Struktur mit
zusätzlichen Einträgen, und ergänze danach die Menülogik. Konkret: erweitere das
`el`-Objekt um

```js
    menu: document.getElementById('menu'),
    toolbar: document.getElementById('toolbar'),
    profileSelect: document.getElementById('profile-select'),
    profileName: document.getElementById('profile-name'),
    profileAdd: document.getElementById('profile-add'),
    profileDelete: document.getElementById('profile-delete'),
    threshold: document.getElementById('threshold'),
    menuClose: document.getElementById('menu-close')
```

und füge vor `profile().stats.sessions++;` ein:

```js
  var menuButton = document.createElement('button');
  menuButton.id = 'menu-button';
  menuButton.type = 'button';
  menuButton.textContent = '☰';
  menuButton.title = 'Profile und Einstellungen';
  el.toolbar.appendChild(menuButton);

  function renderMenu() {
    el.profileSelect.innerHTML = '';
    Object.keys(state.profiles).forEach(function (id) {
      var opt = document.createElement('option');
      opt.value = id;
      opt.textContent = state.profiles[id].name;
      if (id === state.activeProfile) opt.selected = true;
      el.profileSelect.appendChild(opt);
    });
    el.threshold.value = (thresholdMs() / 1000).toString();
    el.profileDelete.disabled = Object.keys(state.profiles).length <= 1;
  }

  function openMenu() { renderMenu(); el.menu.hidden = false; }

  function closeMenu() {
    el.menu.hidden = true;
    el.trainer.hidden = session.currentKey === null;
    el.done.hidden = session.currentKey !== null;
    el.answer.focus();
  }

  function restartSession() {
    session.recent = [];
    session.answered = 0;
    session.refreshesShown = 0;
    session.freeplay = false;
    el.done.hidden = true;
    el.trainer.hidden = false;
    nextQuestion();
  }

  menuButton.addEventListener('click', openMenu);
  el.menuClose.addEventListener('click', closeMenu);

  el.profileSelect.addEventListener('change', function () {
    state.activeProfile = el.profileSelect.value;
    persist();
    renderMenu();
    restartSession();
    el.menu.hidden = false;   // Menü bleibt offen, Wechsel ist sichtbar
  });

  el.profileAdd.addEventListener('click', function () {
    var name = el.profileName.value.trim();
    if (name === '') return;
    var created = ML.createProfile(state, name, Date.now());
    state = created.state;
    persist();
    el.profileName.value = '';
    renderMenu();
    restartSession();
    el.menu.hidden = false;
  });

  el.profileDelete.addEventListener('click', function () {
    if (Object.keys(state.profiles).length <= 1) return;
    state = ML.deleteProfile(state, el.profileSelect.value);
    persist();
    renderMenu();
    restartSession();
    el.menu.hidden = false;
  });

  el.threshold.addEventListener('change', function () {
    var seconds = parseFloat(el.threshold.value);
    if (isNaN(seconds) || seconds < 1 || seconds > 30) { renderMenu(); return; }
    profile().settings.thresholdMs = Math.round(seconds * 1000);
    persist();
  });
```

Ergänze im `window.__app`-Objekt am Ende: `renderMenu: renderMenu,
openMenu: openMenu, closeMenu: closeMenu`.

- [ ] **Step 3: Logiktests weiterhin grün**

Run: `node --test test/`
Expected: PASS, 41 Tests

- [ ] **Step 4: Manuell im Browser prüfen**

Bei laufendem `python3 -m http.server 8000` auf `http://localhost:8000/`:

1. `☰` oben rechts öffnet das Menü, `Zurück zum Üben` schließt es und der Fokus liegt wieder im Eingabefeld.
2. Der Löschen-Knopf ist bei nur einem Profil deaktiviert.
3. Neues Profil `Ben` anlegen → es steht in der Auswahl und ist aktiv, der Zähler springt auf `noch 100 von 100 offen`.
4. Zurück auf das erste Profil wechseln → dessen Fortschrittszähler von Task 8 ist wieder da. **Das ist der wichtigste Punkt: die Lernstände dürfen sich nicht vermischen.**
5. Zeitschwelle auf `1` setzen, Menü schließen, eine Aufgabe langsam richtig beantworten → der Zähler sinkt **nicht** (kein Treffer, aber auch kein Rückschritt).
6. Seite neu laden → das zuletzt aktive Profil und die Zeitschwelle sind erhalten.
7. Zweites Profil löschen → es verschwindet, das verbleibende wird aktiv.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: Profilverwaltung und einstellbare Zeitschwelle im Menü"
```

---

## Task 10: Sprachausgabe

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `window.__app.nextQuestion`, `profile().settings.tts`
- Produces: Toolbar-Knopf `#tts-toggle`, Funktion `speak(text, onEnd)`,
  Variable `session.startedAt` wird bei aktivem Vorlesen erst nach dem Sprechen
  gesetzt

**Kontext aus der Spec:** Vorgelesen wird der ausgeschriebene Text `"7 mal 8"` —
das Zeichen `×` wird von manchen Engines nicht oder falsch ausgesprochen. Die
Stimmenliste lädt asynchron, deshalb muss auf `onvoiceschanged` gewartet werden.
iOS/Safari spricht erst nach einer echten Nutzergeste; der Klick auf den
Vorlesen-Knopf ist genau diese Geste und wird zum Freischalten genutzt. Die
Zeitmessung startet erst, wenn das Vorlesen endet.

- [ ] **Step 1: Sprachausgabe implementieren**

Füge im Skript vor `var menuButton = ...` ein:

```js
  /* ---------- Sprachausgabe ---------- */

  var tts = {
    supported: typeof window.speechSynthesis !== 'undefined',
    voice: null,
    unlocked: false
  };

  function pickGermanVoice() {
    if (!tts.supported) return;
    var voices = window.speechSynthesis.getVoices();
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].lang && voices[i].lang.toLowerCase().indexOf('de') === 0) {
        tts.voice = voices[i];
        return;
      }
    }
  }

  if (tts.supported) {
    pickGermanVoice();
    // Die Stimmenliste ist beim ersten Aufruf oft noch leer.
    window.speechSynthesis.addEventListener('voiceschanged', pickGermanVoice);
  }

  function speak(text, onEnd) {
    if (!tts.supported) { if (onEnd) onEnd(); return; }
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    if (tts.voice) u.voice = tts.voice;
    u.rate = 0.95;
    var done = false;
    function finish() { if (done) return; done = true; if (onEnd) onEnd(); }
    u.onend = finish;
    u.onerror = finish;   // sonst bliebe die Uhr bei einem Engine-Fehler stehen
    window.speechSynthesis.speak(u);
  }

  function spokenQuestion(a, b) { return a + ' mal ' + b; }
```

- [ ] **Step 2: `nextQuestion` an die Sprachausgabe anbinden**

Ersetze in `nextQuestion` den Block ab `el.question.textContent = ...` bis
`render();` durch:

```js
    el.question.textContent = ab.a + ' × ' + ab.b;
    el.answer.value = '';
    el.feedback.textContent = '';
    el.answer.focus();
    render();

    if (profile().settings.tts && tts.unlocked) {
      // Uhr läuft erst, wenn die Aufgabe fertig vorgelesen ist.
      session.startedAt = 0;
      speak(spokenQuestion(ab.a, ab.b), function () {
        if (session.currentKey === key) session.startedAt = Date.now();
      });
    }
```

Und sichere `submitAnswer` gegen eine noch nicht gestartete Uhr ab — ersetze
dort die `elapsed`-Zeile durch:

```js
    var elapsed = typeof elapsedMs === 'number'
      ? elapsedMs
      : (session.startedAt === 0 ? 0 : Date.now() - session.startedAt);
```

Wer antwortet, bevor das Vorlesen fertig ist, bekommt also `0` ms — er kannte die
Antwort offensichtlich sofort, und das als Treffer zu werten ist richtig.

- [ ] **Step 3: Toolbar-Knopf ergänzen**

Füge vor `var menuButton = ...` ein:

```js
  var ttsButton = document.createElement('button');
  ttsButton.id = 'tts-toggle';
  ttsButton.type = 'button';
  ttsButton.textContent = '🔊';
  ttsButton.title = 'Aufgabe vorlesen';
  if (!tts.supported) {
    ttsButton.disabled = true;
    ttsButton.title = 'Dieser Browser kann nicht vorlesen';
  }
  el.toolbar.appendChild(ttsButton);

  function renderTtsButton() {
    ttsButton.setAttribute('aria-pressed', profile().settings.tts ? 'true' : 'false');
  }

  ttsButton.addEventListener('click', function () {
    if (!tts.supported) return;
    var p = profile();
    p.settings.tts = !p.settings.tts;
    persist();
    renderTtsButton();
    if (p.settings.tts) {
      // Dieser Klick ist die Nutzergeste, die iOS/Safari verlangt.
      tts.unlocked = true;
      var ab = ML.parseCardKey(session.currentKey);
      session.startedAt = 0;
      speak(spokenQuestion(ab.a, ab.b), function () { session.startedAt = Date.now(); });
    } else {
      window.speechSynthesis.cancel();
      session.startedAt = Date.now();
    }
  });
```

Ergänze `renderTtsButton();` direkt vor `nextQuestion();` am Skriptende und
`renderTtsButton: renderTtsButton, speak: speak` im `window.__app`-Objekt.

- [ ] **Step 4: Logiktests weiterhin grün**

Run: `node --test test/`
Expected: PASS, 41 Tests

- [ ] **Step 5: Manuell im Browser prüfen**

Auf `http://localhost:8000/`, mit eingeschaltetem Ton:

1. 🔊 anklicken → der Knopf wird hervorgehoben und die aktuelle Aufgabe wird auf Deutsch vorgelesen, als `"sieben mal acht"` — **nicht** als „sieben Kreuz acht", „sieben x acht" oder auf Englisch.
2. Die Aufgabe bleibt dabei sichtbar auf dem Bildschirm stehen.
3. Nächste Aufgabe → wird automatisch vorgelesen.
4. Schnell nach dem Ende des Vorlesens antworten → zählt als Treffer (Zähler sinkt nach drei solchen Durchgängen bei derselben Karte).
5. 🔊 erneut anklicken → Vorlesen hört sofort auf, der Knopf ist nicht mehr hervorgehoben.
6. Seite neu laden → die Einstellung ist erhalten, aber es wird erst nach dem ersten Klick wieder gesprochen (Autoplay-Sperre; das ist gewollt).
7. In Firefox öffnen → Vorlesen funktioniert dort ebenfalls.

Falls Punkt 1 eine englische Stimme liefert, ist auf dem System keine deutsche
Stimme installiert — das notieren, nicht als Codefehler behandeln.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: Sprachausgabe der Aufgabe mit deutscher Stimme"
```

---

## Task 11: Spracheingabe mit Fehlerbehandlung

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `ML.parseGermanNumber`, `ML.STT_THRESHOLD_BONUS_MS`,
  `window.__app.submitAnswer`
- Produces: Toolbar-Knopf `#stt-toggle`, Objekt `stt` mit `supported`,
  `available`, `active`

**Kontext aus der Spec — bitte genau lesen:**

- `maxAlternatives = 5`. Ergibt **eine** der Alternativen die richtige Zahl, gilt
  die Antwort als richtig. Ohne diese Toleranz ist Browser-ASR unbenutzbar.
  Ergibt keine Alternative die richtige Zahl, wird die **erste als Zahl lesbare**
  Alternative als Antwort gewertet.
- **Ein Erkennungsfehler darf niemals eine Karte werten.** Nichts verstanden,
  keine Zahl erkannt, Mikrofon streikt, Netzwerkfehler → Karte unverändert,
  Aufgabe erneut stellen.
- Die Zeit wird bis `onspeechend` gemessen, nicht bis zum Ergebnis — die
  Erkennungslatenz darf nicht in die Zeit einfließen.
- Bei aktivem Mikrofon gilt `thresholdMs + ML.STT_THRESHOLD_BONUS_MS`.
- Firefox oder fehlende API → Knopf wird gar nicht angezeigt.
- Aufruf über `file://` → Knopf deaktiviert mit Hinweis auf HTTPS.
- Berechtigung verweigert → Knopf aus, einmalige Meldung, Tastatur läuft weiter.
- Wo verfügbar, On-Device-Erkennung über `processLocally` nach Prüfung mit
  `SpeechRecognition.available()`; sonst automatisch der serverbasierte Weg.

- [ ] **Step 1: Spracheingabe implementieren**

Füge im Skript nach dem Sprachausgabe-Block ein:

```js
  /* ---------- Spracheingabe ---------- */

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  var stt = {
    supported: !!SR,
    secure: window.isSecureContext === true,
    active: false,
    recognizer: null,
    spokeEndAt: 0,
    permissionDenied: false
  };

  function sttThresholdMs() { return thresholdMs() + ML.STT_THRESHOLD_BONUS_MS; }

  // Chrome 139+ kann on-device erkennen; sonst still auf den Serverweg zurückfallen.
  function requestLocalProcessing(rec) {
    if (typeof SR.available !== 'function') return;
    try {
      Promise.resolve(SR.available({ langs: ['de-DE'], processLocally: true }))
        .then(function (status) {
          if (status === 'available') rec.processLocally = true;
          else if (status === 'downloadable' && typeof SR.install === 'function') {
            SR.install({ langs: ['de-DE'], processLocally: true });
          }
        })
        .catch(function () { /* Serverweg bleibt */ });
    } catch (e) { /* Serverweg bleibt */ }
  }

  function buildRecognizer() {
    var rec = new SR();
    rec.lang = 'de-DE';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    requestLocalProcessing(rec);

    rec.addEventListener('speechend', function () {
      // Zeitpunkt VOR der Erkennung — die Erkennungslatenz zählt nicht mit.
      stt.spokeEndAt = Date.now();
    });

    rec.addEventListener('result', function (event) {
      var alts = event.results[0];
      var numbers = [];
      for (var i = 0; i < alts.length; i++) {
        var n = ML.parseGermanNumber(alts[i].transcript);
        if (n !== null) numbers.push(n);
      }
      if (numbers.length === 0) {
        retryUnderstood('Nicht verstanden — bitte nochmal');
        return;
      }
      // Ist die richtige Zahl unter den Alternativen, gilt sie.
      var value = numbers.indexOf(session.expected) !== -1 ? session.expected : numbers[0];

      var elapsed = (stt.spokeEndAt || Date.now()) - session.startedAt;
      if (session.startedAt === 0) elapsed = 0;
      submitAnswer(value, elapsed, sttThresholdMs());
    });

    rec.addEventListener('error', function (event) {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        stt.permissionDenied = true;
        setSttActive(false);
        el.feedback.textContent = 'Kein Zugriff auf das Mikrofon — Tastatur geht weiter';
        return;
      }
      // no-speech, audio-capture, network, aborted: nichts werten, neu hören.
      if (event.error === 'no-speech') retryUnderstood('Nichts gehört — bitte nochmal');
      else if (event.error !== 'aborted') retryUnderstood('Mikrofon-Problem — bitte nochmal');
    });

    rec.addEventListener('end', function () {
      // Der Browser beendet nach jedem Ergebnis; bei aktivem Modus neu starten.
      if (stt.active && !session.awaitingAck && session.currentKey !== null) startListening();
    });

    return rec;
  }

  // Erkennungsfehler werten die Karte NICHT — sie stellen die Aufgabe nur neu.
  function retryUnderstood(message) {
    el.feedback.textContent = message;
  }

  function startListening() {
    if (!stt.active || !stt.recognizer) return;
    stt.spokeEndAt = 0;
    try { stt.recognizer.start(); } catch (e) { /* läuft bereits */ }
  }

  function stopListening() {
    if (!stt.recognizer) return;
    try { stt.recognizer.abort(); } catch (e) { /* nicht gestartet */ }
  }

  function setSttActive(on) {
    stt.active = on;
    profile().settings.stt = on;
    persist();
    renderSttButton();
    if (on) { if (!stt.recognizer) stt.recognizer = buildRecognizer(); startListening(); }
    else { stopListening(); }
  }
```

- [ ] **Step 2: `submitAnswer` um eine übersteuerbare Schwelle erweitern**

Ersetze die Signatur und die Schwellennutzung in `submitAnswer`:

```js
  function submitAnswer(value, elapsedMs, overrideThresholdMs) {
```

und in dessen `ML.gradeAnswer`-Aufruf:

```js
      thresholdMs: typeof overrideThresholdMs === 'number' ? overrideThresholdMs : thresholdMs(),
```

- [ ] **Step 3: Toolbar-Knopf mit allen Nichtverfügbarkeitsfällen ergänzen**

Füge vor `var menuButton = ...` ein:

```js
  var sttButton = null;
  if (stt.supported) {
    sttButton = document.createElement('button');
    sttButton.id = 'stt-toggle';
    sttButton.type = 'button';
    sttButton.textContent = '🎤';
    sttButton.title = 'Antwort sprechen';
    if (!stt.secure) {
      sttButton.disabled = true;
      sttButton.title = 'Das Mikrofon braucht HTTPS — über GitHub Pages oder localhost öffnen';
    }
    el.toolbar.appendChild(sttButton);
    sttButton.addEventListener('click', function () {
      if (!stt.secure || stt.permissionDenied) return;
      setSttActive(!stt.active);
    });
  }

  function renderSttButton() {
    if (!sttButton) return;
    sttButton.setAttribute('aria-pressed', stt.active ? 'true' : 'false');
    sttButton.disabled = !stt.secure || stt.permissionDenied;
  }
```

Ergänze `renderSttButton();` direkt vor `nextQuestion();` am Skriptende.

- [ ] **Step 4: Zuhören an den Aufgabenwechsel koppeln**

Ergänze in `nextQuestion` als letzte Zeile der Funktion:

```js
    if (stt.active) startListening();
```

und in `submitAnswer` im `else`-Zweig (falsche Antwort) direkt nach
`session.awaitingAck = true;`:

```js
      stopListening();   // während der Fehleranzeige nicht zuhören
```

- [ ] **Step 5: Logiktests weiterhin grün**

Run: `node --test test/`
Expected: PASS, 41 Tests

- [ ] **Step 6: Manuell im Browser prüfen**

`http://localhost:8000/` in **Chrome** (localhost gilt als sicherer Kontext):

1. 🎤 ist sichtbar. Anklicken → Chrome fragt nach Mikrofon-Erlaubnis.
2. Erlauben, dann die richtige Antwort sprechen → wird als richtig gewertet, nächste Aufgabe kommt.
3. Bewusst eine falsche Zahl sprechen → wird als falsch gewertet, die richtige Antwort erscheint, Enter geht weiter.
4. Etwas sagen, das keine Zahl ist („keine Ahnung") → `Nicht verstanden — bitte nochmal`, **die Aufgabe bleibt stehen und der Zähler ändert sich nicht**. Das ist der wichtigste Test dieser Task.
5. Schweigen → `Nichts gehört — bitte nochmal`, ebenfalls ohne Wertung.
6. 🎤 ausschalten → Tastatureingabe funktioniert unverändert.
7. `index.html` per Doppelklick über `file://` öffnen → 🎤 ist deaktiviert und der Tooltip nennt HTTPS; die Tastatur funktioniert.
8. In **Firefox** öffnen → 🎤 erscheint gar nicht, alles andere funktioniert.
9. Mikrofon-Erlaubnis in den Chrome-Einstellungen verweigern und neu laden → einmalige Meldung, 🎤 deaktiviert, Tastatur läuft.

Berichte für jeden Punkt, was du tatsächlich beobachtet hast — besonders für die
Punkte 4 und 5, weil dort die zentrale Fehlerregel der Spec hängt.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: Spracheingabe mit Alternativen-Toleranz und wertungsfreien Erkennungsfehlern"
```

---

## Task 12: Statistik im Menü

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `ML.openCount`, `ML.parseCardKey`, `profile()`
- Produces: Element `#stats`, Funktion `renderStats()` (wird aus `renderMenu()`
  aufgerufen)

**Kontext:** Die Spec nennt „Statistik, langsamste Karten" als Inhalt hinter dem
Menü-Knopf. Der Übungsbildschirm selbst bleibt unverändert ablenkungsfrei — hier
kommt nichts hinzu.

- [ ] **Step 1: Markup ergänzen**

Füge in `index.html` im `#menu`-Abschnitt vor `<button id="menu-close">` ein:

```html
  <h2>Fortschritt</h2>
  <div id="stats"></div>
```

und in `<style>` vor `[hidden]`:

```css
  #stats { font-size: .9rem; color: var(--muted); line-height: 1.7; }
  #stats table { border-collapse: collapse; margin-top: .5rem; }
  #stats td { padding: .1rem .8rem .1rem 0; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 2: `renderStats` implementieren und in `renderMenu` einhängen**

Füge im Skript vor `function renderMenu()` ein:

```js
  function renderStats() {
    var p = profile();
    var keys = Object.keys(p.cards);
    var boxes = [0, 0, 0, 0];
    var timed = [];
    keys.forEach(function (k) {
      var c = p.cards[k];
      boxes[c.box]++;
      if (c.bestMs !== null && c.box < ML.BOX_MASTERED) timed.push({ key: k, ms: c.bestMs });
    });
    timed.sort(function (a, b) { return b.ms - a.ms; });

    var html = '<div>offen: <strong>' + ML.openCount(p) + '</strong> von 100' +
               ' &middot; gemeistert: <strong>' + boxes[3] + '</strong></div>' +
               '<div>Box 0: ' + boxes[0] + ' &middot; Box 1: ' + boxes[1] +
               ' &middot; Box 2: ' + boxes[2] + '</div>' +
               '<div>Antworten insgesamt: ' + p.stats.totalAnswers +
               ' &middot; Sitzungen: ' + p.stats.sessions + '</div>';

    if (timed.length > 0) {
      html += '<div style="margin-top:.6rem">Langsamste offene Aufgaben</div><table>';
      timed.slice(0, 5).forEach(function (row) {
        var ab = ML.parseCardKey(row.key);
        html += '<tr><td>' + ab.a + ' × ' + ab.b + '</td><td>' +
                (row.ms / 1000).toFixed(1) + ' s</td></tr>';
      });
      html += '</table>';
    }
    document.getElementById('stats').innerHTML = html;
  }
```

Ergänze am Ende von `renderMenu()` die Zeile `renderStats();`.

- [ ] **Step 3: Logiktests weiterhin grün**

Run: `node --test test/`
Expected: PASS, 41 Tests

- [ ] **Step 4: Manuell im Browser prüfen**

1. Einige Aufgaben beantworten, dann `☰` öffnen → die Box-Verteilung summiert sich auf 100.
2. „Antworten insgesamt" entspricht der Zahl der beantworteten Aufgaben.
3. „Langsamste offene Aufgaben" listet höchstens fünf Einträge mit plausiblen Sekundenwerten.
4. Der Übungsbildschirm selbst zeigt weiterhin **nur** Aufgabe, Eingabefeld und die Zeile `noch N von 100 offen`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: Fortschrittsstatistik mit langsamsten offenen Aufgaben im Menü"
```

---

## Task 13: README, Deployment und Gesamtverifikation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: alles Vorherige
- Produces: nichts, was Code konsumiert

- [ ] **Step 1: README schreiben**

Ersetze `README.md` vollständig durch:

```markdown
# Einmaleins-Trainer

Ein ablenkungsfreier Einmaleins-Trainer, der vollständig im Browser läuft.
Kein Backend, kein Framework, keine Abhängigkeiten, kein Build-Schritt.

## Idee

Zufällige Aufgaben aus dem kleinen Einmaleins (1×1 bis 10×10, 100 Karten,
`7×8` und `8×7` getrennt). Wer eine Aufgabe dreimal **schnell und richtig**
löst, bekommt sie nicht mehr gestellt — übrig bleiben die Problemaufgaben.
Gemeisterte Aufgaben kommen nach 2, dann 7, dann 30 Tagen einmal zur Kontrolle
wieder.

## Nutzung

Für den reinen Tastaturbetrieb genügt ein Doppelklick auf `index.html`.

Für die **Spracheingabe** ist HTTPS oder `localhost` Pflicht:

```
python3 -m http.server 8000
# dann http://localhost:8000/ öffnen
```

Oder über GitHub Pages veröffentlichen: Repository-Einstellungen → Pages →
Branch auswählen, Ordner `/ (root)`.

## Bedienung

| Element | Bedeutung |
|---|---|
| 🔊 | Aufgabe vorlesen |
| 🎤 | Antwort sprechen statt tippen |
| ☰ | Profile, Zeitschwelle, Statistik |
| Enter | Antwort abschicken, nach einem Fehler weiter |

Der Fortschritt liegt pro Profil im `localStorage` des Browsers und wird nicht
zwischen Geräten synchronisiert.

## Browser-Unterstützung

| | Tastatur | Vorlesen | Spracheingabe |
|---|---|---|---|
| Chrome / Edge | ✓ | ✓ | ✓ |
| Safari | ✓ | ✓ | ✓ |
| Firefox | ✓ | ✓ | — |

Firefox liefert keine `SpeechRecognition`-API; der 🎤-Knopf erscheint dort nicht.

## Tests

```
node --test test/
```

Abgedeckt sind Zahlenparser, Scheduler und Speicherschicht in `logic.js`.
Sprachein- und -ausgabe werden manuell verifiziert — sie brauchen echte Browser
und ein echtes Mikrofon.

## Dokumente

- Design: `docs/superpowers/specs/2026-09-07-einmaleins-trainer-design.md`
- Plan: `docs/superpowers/plans/2026-09-07-einmaleins-trainer.md`
```

- [ ] **Step 2: Vollständigen Testlauf durchführen**

Run: `node --test test/`
Expected: PASS, 41 Tests, keine Fehlschläge

- [ ] **Step 3: Abschließende Gesamtverifikation im Browser**

Lösche vorher den gespeicherten Zustand, um den Erstnutzungsfall zu prüfen:
DevTools → Application → Local Storage → Eintrag `mathelerner.v1` löschen.

1. Neu laden → ein Profil wird automatisch angelegt, die erste Aufgabe erscheint, `noch 100 von 100 offen`.
2. Eine Karte dreimal schnell richtig beantworten → Zähler auf 99.
3. Neu laden → weiterhin 99.
4. Dieselbe Karte nochmal (über die Statistik prüfen, dass sie in Box 3 steht) — sie darf nicht mehr gestellt werden.
5. 🔊 und 🎤 gemeinsam einschalten → Aufgabe wird vorgelesen, gesprochene Antwort wird gewertet.
6. `index.html` per `file://` öffnen → Tastatur und Vorlesen funktionieren, 🎤 ist deaktiviert.

Berichte Punkt für Punkt, was tatsächlich eingetreten ist. Wenn etwas nicht
funktioniert, behebe es und wiederhole den Durchlauf — nicht „vermutlich in
Ordnung" melden.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README mit Nutzung, Browser-Unterstützung und Testlauf"
```

---

## Self-Review-Protokoll

**Spec-Abdeckung.** Jede Anforderung der Spec hat eine Task: Datenmodell und
Profile → Task 7; Boxenlogik inklusive der drei Ergebnisfälle → Task 3;
Auffrischung 2/7/30 mit dem Fall „richtig aber langsam" → Task 4; Auswahl mit
Gewichten und Wiederholungssperre → Task 5; Auffrischungsquote und leerer Pool
→ Task 6; Zahlenparser 0–999 → Task 1; Übungsbildschirm, Rückmeldung und
Fortschrittszeile → Task 8; Menü, Profile, Zeitschwelle → Task 9; Sprachausgabe
inklusive `onvoiceschanged` und iOS-Geste → Task 10; Spracheingabe inklusive
`maxAlternatives`, `processLocally`, `onspeechend`-Zeitmessung und aller
Nichtverfügbarkeitsfälle → Task 11; Statistik und langsamste Karten → Task 12;
Deployment → Task 13.

**Namenskonsistenz.** `gradeAnswer`, `pickNext`, `openCount`, `cardKey`,
`parseCardKey`, `newCard`, `newProfile`, `loadState`, `saveState`,
`createProfile`, `deleteProfile` werden in Tasks 2–7 definiert und in Tasks 8–12
unter genau diesen Namen benutzt. `session.startedAt`, `session.awaitingAck`,
`session.recent`, `session.answered`, `session.refreshesShown` werden in Task 8
angelegt und in Tasks 10–11 unter denselben Namen erweitert. `submitAnswer`
bekommt in Task 11 einen dritten Parameter; die Aufrufe aus Task 8 übergeben ihn
nicht und laufen über den `typeof`-Zweig weiter korrekt.

**Vorab verifiziert.** Der generative Zahlwort-Aufbau und die gewichtete
Auswahl aus Task 5 wurden vor der Übergabe in Node durchgespielt: Rundlauf
0–999 fehlerfrei, keine Wortkollisionen, alle Grenzwerte der `rng`-Bereiche
wie im Test erwartet. Dabei fiel auf, dass `"hundertfünf"` ohne Zusatzeintrag
nicht erkannt worden wäre — die Tabelle für 100–199 wurde entsprechend
ergänzt und der Testfall aufgenommen.

**Bekannte bewusste Auslassung.** Der Abschlussbildschirm aus Task 8 wird nur
erreicht, wenn `pickNext` `null` liefert. Das ist erst nach vollständiger
Meisterung aller 100 Karten der Fall und im normalen Testlauf nicht erreichbar;
er wird deshalb nicht manuell verifiziert. Wer ihn prüfen will, setzt in der
Konsole alle Karten auf `box: 3` mit einem `due` in der Zukunft und lädt neu.
