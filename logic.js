/* Times-tables trainer — pure logic.
   Never touches window, document, localStorage, Date.now or Math.random.
   Time, randomness and storage are passed in.
   All user-visible strings stay German; the code around them is English. */
(function (root, factory) {
  var ML = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = ML;
  else root.ML = ML;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* The version of the shipped code, MAJOR.MINOR.PATCH. This is the only
     place it is written down; the menu reads it from here. Every commit that
     touches index.html or logic.js raises it exactly once — patch for fixes,
     minor for new behaviour. See CLAUDE.md. */
  var VERSION = '1.0.2';

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
        'card.resting': 'ruht — Reihe nicht ausgewählt',
        'card.refreshIn': { one: 'Auffrischung in {n} Tag',
                            other: 'Auffrischung in {n} Tagen' },
        'time.seconds': '{value} s',

        'app.title': 'Einmaleins',

        'menu.profile': 'Profil',
        'menu.activeProfile': 'Aktives Profil',
        'menu.delete': 'Löschen',
        'menu.deleteConfirm': 'Wirklich löschen?',
        'menu.newProfile': 'Neues Profil',
        'menu.namePlaceholder': 'Name',
        'menu.add': 'Anlegen',
        'menu.settings': 'Einstellungen',
        'menu.rows': 'Zahlenreihen',
        'menu.threshold': 'Zeitschwelle in Sekunden',
        'menu.language': 'Sprache',
        'menu.progress': 'Fortschritt',
        'menu.allCards': 'Alle 100 Aufgaben',
        'menu.close': 'Zurück zum Üben',
        'menu.version': 'Version {version}',

        // These stats.* keys are the only texts that reach
        // el.stats.innerHTML (see renderStats in index.html) instead of
        // textContent — they must never contain markup characters (<, >, &).
        'stats.open': 'offen: {n} von {total}',
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

        'rows.hint': 'Abgefragt wird eine Aufgabe nur, wenn beide Zahlen ausgewählt sind. ' +
          'Wer die 1 und die 10 abwählt, sieht keine Aufgabe mehr mit einer 1 oder 10.',
        'rows.all': 'alle',
        'rows.hard': 'nur schwere',
        'rows.rowLabel': 'Reihe {n}',
        'rows.count': { one: '1 von 100 Aufgaben ausgewählt',
                        other: '{n} von 100 Aufgaben ausgewählt' },
        'rows.lastOne': 'Mindestens eine Zahl muss ausgewählt bleiben.',

        'trainer.answerLabel': 'Antwort',
        'trainer.ok': 'OK',
        'trainer.next': 'Weiter',
        'trainer.progress': 'noch {n} von {total} offen',
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
        'mic.lost': 'Nicht verstanden',
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
        'card.resting': 'resting — row not selected',
        'card.refreshIn': { one: 'refresher in {n} day',
                            other: 'refresher in {n} days' },
        'time.seconds': '{value} s',

        'app.title': 'Times Tables',

        'menu.profile': 'Profile',
        'menu.activeProfile': 'Active profile',
        'menu.delete': 'Delete',
        'menu.deleteConfirm': 'Really delete?',
        'menu.newProfile': 'New profile',
        'menu.namePlaceholder': 'Name',
        'menu.add': 'Create',
        'menu.settings': 'Settings',
        'menu.rows': 'Number rows',
        'menu.threshold': 'Time threshold in seconds',
        'menu.language': 'Language',
        'menu.progress': 'Progress',
        'menu.allCards': 'All 100 questions',
        'menu.close': 'Back to practice',
        'menu.version': 'Version {version}',

        // These stats.* keys are the only texts that reach
        // el.stats.innerHTML (see renderStats in index.html) instead of
        // textContent — they must never contain markup characters (<, >, &).
        'stats.open': 'open: {n} of {total}',
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

        'rows.hint': 'A question is only asked when both of its numbers are selected. ' +
          'Switch off the 1 and the 10 and no question holds a 1 or a 10 any more.',
        'rows.all': 'all',
        'rows.hard': 'hard ones only',
        'rows.rowLabel': 'row {n}',
        'rows.count': { one: '1 of 100 questions selected',
                        other: '{n} of 100 questions selected' },
        'rows.lastOne': 'At least one number has to stay selected.',

        'trainer.answerLabel': 'Answer',
        'trainer.ok': 'OK',
        'trainer.next': 'Continue',
        'trainer.progress': '{n} of {total} still open',
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
        'mic.lost': 'Not understood',
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
      }
    }
  };

  // Fixed order for the menu. Exported together with the raw key set of
  // LOCALES below so a test can catch the two drifting apart — a pack added
  // here but forgotten in LOCALES (or the reverse) would otherwise only show
  // up as a silently unselectable menu entry or an unreachable pack.
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

  /* ===================================================================
     Section 1 — number parser
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

  // Normalisation: lowercase, ß -> ss, everything but letters and digits
  // removed. Applied identically to the input AND to the lookup table, so
  // "forty-eight", "forty eight" and "fortyeight" all end up the same. The
  // unicode classes keep the letters of every language instead of only
  // a-z plus äöü.
  function normalizeWord(s) {
    return String(s).toLowerCase().replace(/ß/g, 'ss').replace(/[^\p{L}\p{N}]/gu, '');
  }

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

  // Maximum number of words a single number can consist of
  // ("zwei hundert drei und vierzig" = 6).
  var MAX_NUMBER_WORDS = 6;

  // Walks the text left to right and returns EVERY number found. At each
  // position the longest match wins, so "acht und vierzig" reads as 48 and not
  // as 8; afterwards scanning continues behind the match.
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

  // The alternatives of one segment as trimmed strings, empty ones removed.
  function segmentTexts(segment) {
    var raw = (segment && segment.alternatives) || [];
    var texts = [];
    for (var i = 0; i < raw.length; i++) {
      var text = String(raw[i] === null || raw[i] === undefined ? '' : raw[i]).trim();
      if (text !== '') texts.push(text);
    }
    return texts;
  }

  // Which value out of a recognition result is graded — and whether anything
  // may be graded at all yet. This decision used to sit in the event handler,
  // where it was neither testable nor visible. It is one of the two places
  // where a misjudgement permanently damages a card, so it belongs here.
  //
  // `segments` is the recognition result reduced to plain data: per segment
  // whether it is final and its alternatives in order. No DOM type reaches
  // this function.
  //
  // Three outcomes:
  //   'pending' — the utterance is not finished; grade nothing, show `heard`.
  //   'none'    — it is finished and holds no number; ask again, grade nothing.
  //   'value'   — `value` is the answer, `text` the wording it came from.
  //
  // `assumeFinal` treats every segment as finished. The end of a listening
  // pass uses it: some engines end without ever setting isFinal, and then this
  // is the last moment at which the utterance is still worth anything.
  function chooseSpokenAnswer(segments, opts) {
    var o = opts || {};
    // In continuous mode one recogniser spans several utterances, and the
    // segments of an utterance already dealt with stay in front of the new
    // one. 'from' is where the still unanswered utterance begins; everything
    // before it belongs to a question that is settled. A broken value heals to
    // the beginning, never to "everything skipped" — that would swallow a
    // correct answer in silence and let the deadline grade the card wrong.
    var from = typeof o.from === 'number' && isFinite(o.from) && o.from > 0
      ? Math.floor(o.from)
      : 0;
    var list = (segments || []).slice(from);
    var out = { status: 'pending', value: null, alternative: 0, text: '', heard: '' };
    if (list.length === 0) return out;

    // Rank 0 of every segment, joined: what the recogniser currently holds.
    // It is shown to the child even while nothing is graded.
    var heard = [];
    for (var i = 0; i < list.length; i++) {
      var texts = segmentTexts(list[i]);
      if (texts.length > 0) heard.push(texts[0]);
    }
    out.heard = heard.join(' ');

    // As long as the last segment is still running, the child is still
    // speaking — and a prefix of the answer must never be graded. "4" stands
    // there long before "45" does.
    var last = list[list.length - 1];
    if (!o.assumeFinal && !(last && last.final)) return out;

    var graded = [];
    for (i = 0; i < list.length; i++) {
      if (o.assumeFinal || (list[i] && list[i].final)) graded.push(segmentTexts(list[i]));
    }
    if (graded.length === 0) return out;

    // One candidate per alternative rank, built across ALL graded segments —
    // the answer may well sit in a later one. A segment with fewer
    // alternatives contributes its last.
    var ranks = 0;
    for (i = 0; i < graded.length; i++) if (graded[i].length > ranks) ranks = graded[i].length;
    if (ranks === 0) { out.status = 'none'; return out; }

    var candidates = [];
    for (var r = 0; r < ranks; r++) {
      var parts = [];
      for (i = 0; i < graded.length; i++) {
        if (graded[i].length === 0) continue;
        parts.push(graded[i][Math.min(r, graded[i].length - 1)]);
      }
      var text = parts.join(' ');
      var numbers = parseNumbers(text, o.lang);
      if (numbers.length > 0) candidates.push({ rank: r, text: text, numbers: numbers });
    }
    if (candidates.length === 0) { out.status = 'none'; return out; }

    // If the expected number appears anywhere in any alternative, it counts.
    var pick = null;
    for (i = 0; i < candidates.length && pick === null; i++) {
      if (candidates[i].numbers.indexOf(o.expected) !== -1) pick = candidates[i];
    }
    // Otherwise the LAST number of the first usable alternative counts:
    // whoever says the whole sum out loud means their result with the last
    // number.
    if (pick === null) pick = candidates[0];

    out.status = 'value';
    out.value = pick.numbers.indexOf(o.expected) !== -1
      ? o.expected
      : pick.numbers[pick.numbers.length - 1];
    out.alternative = pick.rank;
    out.text = pick.text;
    return out;
  }

  function spokenQuestion(a, b, lang) {
    return locale(lang).spokenQuestion(a, b);
  }

  /* ===================================================================
     Section 2 — cards and scheduler
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

  // Which rows are being asked at all. A row is a factor; the selection is the
  // set of numbers a question may hold.
  var ALL_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  // The quick choice "hard ones only". The rows left out are the ones a child
  // can usually say without thinking.
  var HARD_ROWS = [3, 4, 6, 7, 8, 9];

  // A stored selection must never be able to empty the pool: anything broken,
  // unknown or empty heals to all rows. The same reasoning as for a missing
  // settings.lang — a damaged value costs no progress, it just asks
  // everything. Always a fresh array, so nobody writes into the constant.
  function normalizeRows(value) {
    var rows = [], i, n;
    if (Object.prototype.toString.call(value) === '[object Array]') {
      for (i = 0; i < value.length; i++) {
        n = Number(value[i]);
        if (isFinite(n) && n === Math.round(n) && n >= 1 && n <= 10 &&
            rows.indexOf(n) === -1) rows.push(n);
      }
    }
    if (rows.length === 0) return ALL_ROWS.slice();
    return rows.sort(function (x, y) { return x - y; });
  }

  // A card is asked only when BOTH of its factors belong to selected rows.
  // "Leave the tens out" has to mean that no question holds a ten — with one
  // factor being enough, 3x10 would stay in because the three is selected,
  // and switching off an easy row would achieve nothing. Both writings are
  // treated alike: the rule does not care which factor comes first.
  function cardSelected(a, b, rows) {
    var list = normalizeRows(rows);
    return list.indexOf(a) !== -1 && list.indexOf(b) !== -1;
  }

  // The selected cards in the order of the full pool, so grid and counter
  // never disagree about what "64 of 100" means.
  function selectedCardKeys(rows) {
    var list = normalizeRows(rows), keys = [], i, ab;
    for (i = 0; i < ALL_CARD_KEYS.length; i++) {
      ab = parseCardKey(ALL_CARD_KEYS[i]);
      if (cardSelected(ab.a, ab.b, list)) keys.push(ALL_CARD_KEYS[i]);
    }
    return keys;
  }

  // Switching a row on or off. The last remaining row stays on: without a row
  // there is no card to ask, and the trainer would show "all done" to a child
  // who has learned nothing.
  function toggleRow(rows, n) {
    var list = normalizeRows(rows), at = list.indexOf(Number(n));
    if (ALL_ROWS.indexOf(Number(n)) === -1) return list;
    if (at === -1) {
      list.push(Number(n));
      return list.sort(function (x, y) { return x - y; });
    }
    if (list.length === 1) return list;
    list.splice(at, 1);
    return list;
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
      // Refresh: a hit moves up one level, slow repeats the level.
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
    // correct but too slow: the box stays unchanged
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
    return keys[keys.length - 1]; // safeguard against rounding errors
  }

  var REFRESH_EVERY = 5;

  function pickNext(cards, opts) {
    var recent = opts.recent.slice(-RECENT_MEMORY);
    var keys = Object.keys(cards);
    var rows = normalizeRows(opts.rows);
    var i, key, card, ab;

    var learning = [];
    var due = [];
    for (i = 0; i < keys.length; i++) {
      key = keys[i];
      card = cards[key];
      // The selection filters here, once, for the learning pool and the
      // refreshes alike — a switched-off row must not come back through the
      // refresh plan either.
      ab = parseCardKey(key);
      if (!cardSelected(ab.a, ab.b, rows)) continue;
      if (card.box < BOX_MASTERED) learning.push(key);
      else if (card.due > 0 && card.due <= opts.now) due.push(key);
    }

    // Most overdue first — deterministic.
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
     Section 3 — timer display and overall deadline
     =================================================================== */

  // Why the clock has two stages.
  //
  // The visible timer is supposed to be able to run out and mark the question
  // wrong. If it ran exactly up to the time threshold, the spec rule "correct
  // but too slow leaves the card where it is" would be gone — there simply
  // would be no "too slow" any more, because the question would be cut off
  // first. Hence two stages:
  //
  //   0 ─────── threshold ───────────── deadline
  //   [ fast enough: card moves up ]
  //             [ grace: the answer still counts, the card stays put ]
  //                                      → time up: card back to box 0
  //
  // The deadline is three times the applicable threshold (in voice mode that
  // includes STT_THRESHOLD_BONUS_MS). Three is chosen so that the grace period
  // is twice as long as the fast time — enough to think and type or speak
  // calmly, and short enough that a question does not sit around forever.
  //
  // These functions decide about display and deadline only. Whether a card
  // moves up, stays or falls back is still decided solely by gradeAnswer from
  // the actually measured time.
  var TIME_LIMIT_FACTOR = 3;

  var TIME_FAST = 'fast';
  var TIME_GRACE = 'grace';
  var TIME_EXPIRED = 'expired';

  // An unusable threshold must never cost a card: there is then no deadline
  // (0) and the phase stays "fast" forever.
  function validThresholdMs(thresholdMs) {
    var t = Number(thresholdMs);
    return isFinite(t) && t > 0 ? t : 0;
  }

  function deadlineMs(thresholdMs) {
    return validThresholdMs(thresholdMs) * TIME_LIMIT_FACTOR;
  }

  function timePhase(elapsedMs, thresholdMs) {
    var t = validThresholdMs(thresholdMs);
    if (t === 0) return TIME_FAST;
    var e = Number(elapsedMs);
    if (!isFinite(e) || e < 0) e = 0;
    // The boundary sits at `<=`, exactly as in gradeAnswer: right on the
    // threshold still counts as fast.
    if (e <= t) return TIME_FAST;
    if (e < t * TIME_LIMIT_FACTOR) return TIME_GRACE;
    return TIME_EXPIRED;
  }

  // Everything the bar needs in order to be drawn — without a single DOM
  // access. `fraction` is the remaining part of the deadline (1 → 0),
  // `thresholdFraction` is where the grace period starts; the mark sits there.
  function timeDisplay(elapsedMs, thresholdMs) {
    var t = validThresholdMs(thresholdMs);
    var total = t * TIME_LIMIT_FACTOR;
    var e = Number(elapsedMs);
    if (!isFinite(e) || e < 0) e = 0;
    var remaining = total > 0 ? Math.max(0, total - e) : 0;
    return {
      phase: timePhase(e, t),
      fraction: total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 1,
      remainingMs: remaining,
      totalMs: total,
      thresholdFraction: total > 0 ? (total - t) / total : 1
    };
  }

  /* ===================================================================
     Section 4 — display state of the speech input
     =================================================================== */

  // The microphone status display has exactly one tricky part: the precedence
  // of the states. It therefore lives here as a pure function and is testable
  // without a browser.
  //
  // It decides only what is shown — never whether a card is graded, and never
  // about time measurement.
  var MIC_OFF = 'off';                // microphone off or unavailable
  var MIC_PAUSED = 'paused';          // menu open, error shown, nothing to answer
  var MIC_READING = 'reading';        // question is being read out — do not speak now
  var MIC_STARTING = 'starting';      // listening requested, start not yet confirmed
  var MIC_READY = 'ready';            // microphone is open — speak now
  var MIC_HEARING = 'hearing';        // someone is speaking right now
  var MIC_PROCESSING = 'processing';  // after speechend, before the result

  // The order is deliberate: whatever keeps the child from speaking wins over
  // whatever the microphone is currently doing. Otherwise "Jetzt sprechen"
  // would show while the question is still being read out.
  function micState(situation) {
    var s = situation || {};
    if (!s.active) return MIC_OFF;
    if (s.paused) return MIC_PAUSED;
    if (s.reading) return MIC_READING;
    if (s.processing) return MIC_PROCESSING;
    if (s.speaking) return MIC_HEARING;
    if (s.started) return MIC_READY;
    return MIC_STARTING;
  }

  /* ===================================================================
     Section 4b — end of speaking from the level
     =================================================================== */

  // Why this exists at all: the answer time is measured up to the end of
  // speaking, and the recogniser cannot supply it. Continuously it fires
  // 'speechend' once for the whole pass, and its result arrives measurably
  // late — 1454 ms after the end of speaking in one measurement, 6170 ms in
  // the next. Hanging the time on the result would put that latency into the
  // learning time, against a threshold of 4000 ms.
  //
  // So the level of the microphone is watched separately and the end of
  // speaking read off it. Pure function: level in, event out — no
  // AudioContext, no time of its own, testable without a browser. It decides
  // only WHEN speaking stopped, never whether anything is graded.

  var VOICE_ON = 0.020;      // RMS from here on it counts as speech
  var VOICE_OFF = 0.010;     // hysteresis: below this the silence begins
  var VOICE_HANG_MS = 400;   // this much silence, then the utterance is over

  function newVoiceState() {
    return { speaking: false, startedAt: 0, quietSince: 0 };
  }

  // One measuring step. Returns the follow-up state plus the event, if the
  // step produced one — 'start', 'end' or null. 'at' is the moment the event
  // BELONGS to: for the end that is the beginning of the silence, not its
  // confirmation a hang time later. Anything else would add that hang time to
  // every single answer.
  function voiceStep(state, rms, now, opts) {
    var o = opts || {};
    var on = typeof o.on === 'number' ? o.on : VOICE_ON;
    var off = typeof o.off === 'number' ? o.off : VOICE_OFF;
    var hang = typeof o.hangMs === 'number' ? o.hangMs : VOICE_HANG_MS;
    var s = state || newVoiceState();
    var next = { speaking: s.speaking, startedAt: s.startedAt, quietSince: s.quietSince };
    var out = { state: next, event: null, at: now };

    // The analyser delivers NaN while the audio graph is being torn down. Read
    // as silence that would end a running utterance and time-stamp an answer
    // that is still being spoken.
    if (typeof rms !== 'number' || !isFinite(rms)) return out;

    if (!next.speaking) {
      if (rms >= on) {
        next.speaking = true;
        next.startedAt = now;
        next.quietSince = 0;
        out.event = 'start';
      }
      return out;
    }
    if (rms >= off) {          // still speaking — the silence starts over
      next.quietSince = 0;
      return out;
    }
    if (next.quietSince === 0) {   // silence begins; remember WHEN
      next.quietSince = now;
      return out;
    }
    if (now - next.quietSince >= hang) {
      out.event = 'end';
      out.at = next.quietSince;
      next.speaking = false;
      next.quietSince = 0;
    }
    return out;
  }

  /* ===================================================================
     Section 5 — storage layer
     =================================================================== */

  var STORAGE_KEY = 'mathelerner.v1';
  var STATE_VERSION = 1;
  var DEFAULT_SETTINGS = { tts: false, stt: false, thresholdMs: DEFAULT_THRESHOLD_MS,
                           lang: DEFAULT_LANGUAGE, rows: ALL_ROWS.slice() };

  function defaultState() {
    return { version: STATE_VERSION, activeProfile: null, profiles: {} };
  }

  function newProfile(name, now, lang) {
    var cards = {};
    for (var i = 0; i < ALL_CARD_KEYS.length; i++) cards[ALL_CARD_KEYS[i]] = newCard();
    return {
      name: name,
      created: now,
      settings: { tts: DEFAULT_SETTINGS.tts, stt: DEFAULT_SETTINGS.stt,
                  thresholdMs: DEFAULT_SETTINGS.thresholdMs,
                  lang: LOCALES[lang] ? lang : DEFAULT_LANGUAGE,
                  rows: normalizeRows(DEFAULT_SETTINGS.rows) },
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

    // Discard structurally broken profiles instead of letting the page die on
    // them: a profile without cards is useless.
    var healthy = {};
    var ids = Object.keys(parsed.profiles);
    for (var i = 0; i < ids.length; i++) {
      var pr = parsed.profiles[ids[i]];
      if (pr && typeof pr === 'object' && pr.cards && typeof pr.cards === 'object' &&
          pr.settings && typeof pr.settings === 'object' &&
          pr.stats && typeof pr.stats === 'object') {
        // STATE_VERSION stays 1 on purpose: a bump would discard every
        // existing profile here — weeks of progress for the sake of one new
        // setting. The missing field is healed instead. Existing profiles come
        // from the single-language app, so German is the right assumption, and
        // it stays right no matter what the browser reports.
        if (typeof pr.settings.lang !== 'string' || !LOCALES[pr.settings.lang]) {
          pr.settings.lang = DEFAULT_LANGUAGE;
        }
        // Same reasoning for the row selection: a missing or damaged value
        // heals to "ask everything" instead of costing a version bump.
        pr.settings.rows = normalizeRows(pr.settings.rows);
        healthy[ids[i]] = pr;
      }
    }
    var remaining = Object.keys(healthy);
    var active = parsed.activeProfile;
    if (remaining.indexOf(active) === -1) active = remaining.length > 0 ? remaining[0] : null;
    return { version: STATE_VERSION, activeProfile: active, profiles: healthy };
  }

  // Returns true when the write went through. A failed write (private mode,
  // storage full) has to be allowed to become visible.
  function saveState(storage, state) {
    var raw = JSON.stringify(state);
    try {
      storage.setItem(STORAGE_KEY, raw);
      return true;
    } catch (e) {
      return false;   // storage full or blocked
    }
  }

  function nextProfileId(profiles) {
    var n = 1;
    while (profiles['p' + n]) n++;
    return 'p' + n;
  }

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

  // Only the selected rows count: a card that is not being asked can neither
  // be open nor be finished, and a progress display counting cards nobody sees
  // would never reach zero.
  function openCount(profile) {
    var keys = selectedCardKeys(profile.settings && profile.settings.rows), n = 0;
    for (var i = 0; i < keys.length; i++) {
      var card = profile.cards[keys[i]];
      if (card && card.box < BOX_MASTERED) n++;
    }
    return n;
  }

  /* ===================================================================
     Section 6 — progress display
     =================================================================== */

  // The box number alone tells nobody anything. For the display every box gets
  // a name; the index is the box number.
  function boxNames(lang) {
    return [t(lang, 'box.name.0'), t(lang, 'box.name.1'),
            t(lang, 'box.name.2'), t(lang, 'box.name.3')];
  }

  // How many cards sit in which box — the index is the box number. Counts the
  // selected rows only, for the same reason as openCount.
  function boxDistribution(profile) {
    var counts = [0, 0, 0, 0];
    var keys = selectedCardKeys(profile.settings && profile.settings.rows);
    for (var i = 0; i < keys.length; i++) {
      var card = profile.cards[keys[i]];
      if (card) counts[clampBox(card.box)]++;
    }
    return counts;
  }

  // Broken or future box values must not blow up the display.
  function clampBox(box) {
    var b = Math.round(Number(box));
    if (!isFinite(b) || b < 0) return 0;
    return Math.min(b, BOX_MASTERED);
  }

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
  function cardView(card, key, now, lang, selected) {
    var ab = parseCardKey(key);
    var box = clampBox(card.box);
    var names = boxNames(lang);
    var parts = [ab.a + ' × ' + ab.b, t(lang, 'card.box', { name: names[box], box: box })];
    var time = timeText(card.bestMs, lang);
    if (time !== null) parts.push(t(lang, 'card.bestTime', { time: time }));
    parts.push(scoreText(card, lang));
    var refresh = refreshText(card, now, lang);
    if (refresh !== null) parts.push(refresh);
    if (selected === false) parts.push(t(lang, 'card.resting'));
    return {
      key: key, a: ab.a, b: ab.b,
      box: box, name: names[box],
      refreshDue: refreshDue(card, now),
      selected: selected !== false,
      description: parts.join(' · ')
    };
  }

  // Always all 100 cards in a fixed order — a profile missing a card would
  // otherwise tear a hole into the grid. The resting rows stay in the grid as
  // well, marked as unselected: their progress is parked, not lost, and that
  // is worth seeing.
  function cardViews(profile, now, lang) {
    var list = [], rows = normalizeRows(profile.settings && profile.settings.rows);
    for (var i = 0; i < ALL_CARD_KEYS.length; i++) {
      var key = ALL_CARD_KEYS[i];
      var ab = parseCardKey(key);
      list.push(cardView(profile.cards[key] || newCard(), key, now, lang,
                         cardSelected(ab.a, ab.b, rows)));
    }
    return list;
  }

  return {
    VERSION: VERSION,
    DEFAULT_LANGUAGE: DEFAULT_LANGUAGE,
    REQUIRED_LOCALE_FIELDS: REQUIRED_LOCALE_FIELDS,
    LANGUAGES: LANGUAGES,
    LANGUAGE_ORDER: LANGUAGE_ORDER,
    LOCALE_IDS: Object.keys(LOCALES),
    locale: locale,
    resolveLanguage: resolveLanguage,
    t: t,
    _spellEnglish: spellEnglish,
    parseNumber: parseNumber,
    parseNumbers: parseNumbers,
    chooseSpokenAnswer: chooseSpokenAnswer,
    _spellGerman: spellGerman,
    spokenQuestion: spokenQuestion,
    BOX_MASTERED: BOX_MASTERED,
    cardKey: cardKey,
    parseCardKey: parseCardKey,
    ALL_CARD_KEYS: ALL_CARD_KEYS,
    ALL_ROWS: ALL_ROWS,
    HARD_ROWS: HARD_ROWS,
    normalizeRows: normalizeRows,
    cardSelected: cardSelected,
    selectedCardKeys: selectedCardKeys,
    toggleRow: toggleRow,
    newCard: newCard,
    DAY_MS: DAY_MS,
    REFRESH_INTERVALS_MS: REFRESH_INTERVALS_MS,
    DEFAULT_THRESHOLD_MS: DEFAULT_THRESHOLD_MS,
    STT_THRESHOLD_BONUS_MS: STT_THRESHOLD_BONUS_MS,
    gradeAnswer: gradeAnswer,
    TIME_LIMIT_FACTOR: TIME_LIMIT_FACTOR,
    TIME_FAST: TIME_FAST,
    TIME_GRACE: TIME_GRACE,
    TIME_EXPIRED: TIME_EXPIRED,
    deadlineMs: deadlineMs,
    timePhase: timePhase,
    timeDisplay: timeDisplay,
    BOX_WEIGHTS: BOX_WEIGHTS,
    RECENT_MEMORY: RECENT_MEMORY,
    REFRESH_EVERY: REFRESH_EVERY,
    pickNext: pickNext,
    MIC_OFF: MIC_OFF,
    MIC_PAUSED: MIC_PAUSED,
    MIC_READING: MIC_READING,
    MIC_STARTING: MIC_STARTING,
    MIC_READY: MIC_READY,
    MIC_HEARING: MIC_HEARING,
    MIC_PROCESSING: MIC_PROCESSING,
    micState: micState,
    VOICE_ON: VOICE_ON,
    VOICE_OFF: VOICE_OFF,
    VOICE_HANG_MS: VOICE_HANG_MS,
    newVoiceState: newVoiceState,
    voiceStep: voiceStep,
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    defaultState: defaultState,
    newProfile: newProfile,
    loadState: loadState,
    saveState: saveState,
    createProfile: createProfile,
    deleteProfile: deleteProfile,
    openCount: openCount,
    boxNames: boxNames,
    boxDistribution: boxDistribution,
    timeText: timeText,
    refreshDue: refreshDue,
    refreshText: refreshText,
    scoreText: scoreText,
    cardView: cardView,
    cardViews: cardViews
  };
});
