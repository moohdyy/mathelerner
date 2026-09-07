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
    // richtig, aber zu langsam: Box bleibt unverändert
    return next;
  }

  return {
    parseGermanNumber: parseGermanNumber,
    _spellGerman: spellGerman,
    BOX_MASTERED: BOX_MASTERED,
    cardKey: cardKey,
    parseCardKey: parseCardKey,
    ALL_CARD_KEYS: ALL_CARD_KEYS,
    newCard: newCard,
    DAY_MS: DAY_MS,
    REFRESH_INTERVALS_MS: REFRESH_INTERVALS_MS,
    DEFAULT_THRESHOLD_MS: DEFAULT_THRESHOLD_MS,
    STT_THRESHOLD_BONUS_MS: STT_THRESHOLD_BONUS_MS,
    gradeAnswer: gradeAnswer
  };
});
