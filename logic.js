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
    // "eine" wird bewusst NICHT eingetragen: der Artikel steckt in
    // Zögerfloskeln wie "vielleicht eine" und würde daraus eine falsche
    // Antwort machen. Erkenner liefern für die Zahl "eins" oder "1".
    map[normalizeWord('zwo')] = 2;       // häufige Fehlerkennung
    return map;
  })();

  // Höchstzahl der Wörter, aus denen eine Zahl bestehen kann
  // ("zwei hundert drei und vierzig" = 6).
  var MAX_NUMBER_WORDS = 6;

  // Läuft von links nach rechts durch den Text und liefert JEDE gefundene Zahl.
  // An jeder Stelle gewinnt der längste Treffer, damit "acht und vierzig" als 48
  // und nicht als 8 gelesen wird; danach geht es hinter dem Treffer weiter.
  function parseGermanNumbers(text) {
    if (text == null) return [];
    var raw = String(text);
    var treffer = [];

    // Ziffernform hat Vorrang und wird vollständig gesammelt.
    var ziffern = raw.match(/\d+/g);
    if (ziffern) {
      for (var d = 0; d < ziffern.length; d++) treffer.push(parseInt(ziffern[d], 10));
      return treffer;
    }

    var words = raw.split(/\s+/).map(normalizeWord).filter(function (w) { return w.length > 0; });
    var i = 0;
    while (i < words.length) {
      var best = null, bestLen = 0, joined = '';
      for (var len = 1; len <= MAX_NUMBER_WORDS && i + len <= words.length; len++) {
        joined += words[i + len - 1];
        var hit = WORD_TO_NUMBER[joined];
        if (hit !== undefined) { best = hit; bestLen = len; }
      }
      if (best !== null) { treffer.push(best); i += bestLen; }
      else i += 1;
    }
    return treffer;
  }

  // Die erste Zahl der Äußerung — eine Sicht auf parseGermanNumbers, damit es
  // nur eine Implementierung gibt.
  function parseGermanNumber(text) {
    var alle = parseGermanNumbers(text);
    return alle.length > 0 ? alle[0] : null;
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

    // Strukturell kaputte Profile verwerfen, statt die Seite daran sterben zu
    // lassen: ein Profil ohne Karten ist unbrauchbar.
    var gesund = {};
    var ids = Object.keys(parsed.profiles);
    for (var i = 0; i < ids.length; i++) {
      var pr = parsed.profiles[ids[i]];
      if (pr && typeof pr === 'object' && pr.cards && typeof pr.cards === 'object' &&
          pr.settings && typeof pr.settings === 'object' &&
          pr.stats && typeof pr.stats === 'object') {
        gesund[ids[i]] = pr;
      }
    }
    var uebrig = Object.keys(gesund);
    var aktiv = parsed.activeProfile;
    if (uebrig.indexOf(aktiv) === -1) aktiv = uebrig.length > 0 ? uebrig[0] : null;
    return { version: STATE_VERSION, activeProfile: aktiv, profiles: gesund };
  }

  // Liefert true, wenn geschrieben wurde. Ein fehlgeschlagener Schreibvorgang
  // (privater Modus, Speicher voll) muss sichtbar werden dürfen.
  function saveState(storage, state) {
    var raw = JSON.stringify(state);
    try {
      storage.setItem(STORAGE_KEY, raw);
      return true;
    } catch (e) {
      return false;   // Speicher voll oder gesperrt
    }
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

  return {
    parseGermanNumber: parseGermanNumber,
    parseGermanNumbers: parseGermanNumbers,
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
    gradeAnswer: gradeAnswer,
    BOX_WEIGHTS: BOX_WEIGHTS,
    RECENT_MEMORY: RECENT_MEMORY,
    REFRESH_EVERY: REFRESH_EVERY,
    pickNext: pickNext,
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    defaultState: defaultState,
    newProfile: newProfile,
    loadState: loadState,
    saveState: saveState,
    createProfile: createProfile,
    deleteProfile: deleteProfile,
    openCount: openCount
  };
});
