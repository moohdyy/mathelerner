const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const checks = [];
const notes = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

// Console lines are the measurement: the app logs the graded time itself.
const lines = [];
const realLog = console.log;
console.log = function (...a) { lines.push(a.join(' ')); realLog.apply(console, a); };
const lastGraded = () => lines.filter(l => l.includes('graded:')).pop() || '';
const gradedMs = () => { const m = /, (\d+) ms of (\d+) ms/.exec(lastGraded());
                         return m ? { ms: +m[1], of: +m[2] } : null; };

// One utterance at the level detector: loud, then quiet long enough for the
// hang time to elapse. Returns when the detector has reported the end.
async function speakLevel(ms) {
  window.__probe.level = 0.5;
  await sleep(ms);
  window.__probe.level = 0.0;
  await sleep(700);          // hang time 400 ms + slack
}

async function armQuestion() {
  window.__app.nextQuestion();
  await sleep(300);
}

window.__app.setSttActive(true);
await sleep(400);
await armQuestion();
await sleep(300);

check('the recogniser runs continuously',
      window.__probe.rec && window.__probe.rec.continuous === true,
      'continuous=' + (window.__probe.rec && window.__probe.rec.continuous));

/* ---- 1. the recognition latency stays out of the measured time ---- */
const startedAt = window.__app.session.startedAt;
check('the clock is running', startedAt > 0, 'startedAt=' + startedAt);

await speakLevel(300);                       // ~300 ms of speech, end detected
const afterSpeech = Date.now() - startedAt;
await sleep(2500);                           // recognition latency
window.__probe.rec._say([String(window.__app.session.expected)], true);
await sleep(300);

const g = gradedMs();
notes.push({ afterSpeech, graded: g, line: lastGraded() });
check('an answer is graded at all', g !== null, lastGraded());
check('the time measured is the end of speaking, not the result',
      g && g.ms < afterSpeech + 400,
      'graded ' + (g && g.ms) + ' ms, end of speaking was at ~' + afterSpeech + ' ms');
check('the 2.5 s of latency are NOT in the time',
      g && g.ms < 2000, 'graded ' + (g && g.ms) + ' ms');
check('the answer counts as fast', g && g.ms < g.of,
      g && (g.ms + ' of ' + g.of));

/* ---- 2. continuously one recogniser spans several utterances ---- */
await armQuestion();
await sleep(400);
const recBefore = window.__probe.rec;
const expected = window.__app.session.expected;
const clockAtQuestion = window.__app.session.startedAt;

await speakLevel(300);
window.__probe.rec._say(['keine ahnung'], true);   // final, but no number in it
await sleep(300);

check('an utterance without a number grades nothing',
      !lines.slice(-3).some(l => l.includes('graded:')),
      lines.slice(-3).join(' / '));
check('the pass keeps running instead of being rebuilt',
      window.__probe.rec === recBefore,
      'recogniser ' + (window.__probe.rec === recBefore ? 'same' : 'replaced'));

// The clock starts over on a retry — otherwise the second attempt would run
// against the time of the first and could never be fast enough.
const clockAfterRetry = window.__app.session.startedAt;
check('a retry restarts the clock', clockAfterRetry > clockAtQuestion,
      'question ' + clockAtQuestion + ' -> retry ' + clockAfterRetry);

/* ---- 3. the watchdog does not shoot the running pass down ---- */
await sleep(4200);                                  // > STT_START_TIMEOUT_MS (3000)
check('the watchdog leaves the pass alone after a final result',
      window.__probe.rec === recBefore
        && !lines.slice(-6).some(l => l.includes('watchdog')),
      lines.slice(-6).join(' / '));

/* ---- 4. the second utterance is graded, and only it ---- */
await speakLevel(300);
await sleep(200);
window.__probe.rec._say([String(expected)], true);
await sleep(300);

const g2 = gradedMs();
notes.push({ second: lastGraded() });
check('the second utterance in the same pass is graded',
      lastGraded().includes('graded: ' + expected), lastGraded());
check('the discarded utterance is not part of the graded wording',
      !lastGraded().includes('keine ahnung'), lastGraded());
// Measured against the RETRY clock, not the original one: this scenario
// deliberately burns 4.2 s in between to test the watchdog.
const sinceRetry = Date.now() - clockAfterRetry;
const sinceQuestion = Date.now() - clockAtQuestion;
check('the second answer is measured from the retry, not from the question',
      g2 && Math.abs(g2.ms - sinceRetry) < Math.abs(g2.ms - sinceQuestion)
         && g2.ms < sinceQuestion - 2000,
      g2 && ('graded ' + g2.ms + ' ms; since retry ' + sinceRetry
             + ' ms; since question ' + sinceQuestion + ' ms'));
// And here too the latency stays out: the end of speaking lies ~1.2 s back.
check('the latency stays out of the second measurement too',
      g2 && sinceRetry - g2.ms > 700,
      g2 && ('gap ' + (sinceRetry - g2.ms) + ' ms between end of speaking and now'));

/* ---- 5. an answer that never becomes final is still graded ----
   The real-world failure: "[0 interim] 12" on 3x4 and "One" on 1x1 — correct,
   never marked final, lost to the deadline. */
await armQuestion();
await sleep(400);
const exp5 = window.__app.session.expected;
const before5 = lines.length;

window.__probe.rec._say(['x'], false);                 // speech starts
window.__probe.rec._say([String(exp5)], false);        // the answer, interim only
await speakLevel(300);                                  // level detector: end of speaking
window.__probe.rec._speechend();
const t5 = Date.now();
await sleep(600);
check('nothing is graded while the settle deadline runs',
      !lines.slice(before5).some(l => l.includes('graded:')),
      lines.slice(before5).join(' / '));
await sleep(window.__app.STT_SETTLE_MS + 400);   // the deadline, read from the app

const g5 = gradedMs();
notes.push({ interimOnly: lastGraded(), waited: Date.now() - t5 });
check('an interim-only answer is graded after the settle deadline',
      lastGraded().includes('graded: ' + exp5), lastGraded());
check('the settle deadline does not put itself into the answer time',
      g5 && g5.ms < g5.of, g5 && (g5.ms + ' of ' + g5.of));

/* ---- 6. speech without any result still asks again instead of timing out ---- */
await armQuestion();
await sleep(400);
const before6 = lines.length;
window.__probe.rec._say(['bla'], false);               // speech, but nothing usable
await speakLevel(300);
window.__probe.rec._speechend();
// An INTERIM result without a number has to wait out the settle deadline: the
// recogniser may still turn it into something usable. A FINAL one without a
// number is reported at once — that path runs through the result handler.
await sleep(window.__app.STT_SETTLE_MS + 700);
check('an unusable utterance asks again instead of running into the deadline',
      lines.slice(before6).some(l => l.includes('asking again'))
        && !lines.slice(before6).some(l => l.includes('graded:')),
      lines.slice(before6).join(' / '));

/* ---- 7. the recognition latency must not fire the settle deadline ----
   Measured on the user's machine: 1454 ms and 6170 ms between the real end of
   speaking and the first result, in the same run. Chrome reports the noise
   ('soundstart') long before it reports the words, so the pass believes it
   heard speech while nothing has arrived yet. With a deadline shorter than
   that latency every single answer produced a false "not understood" first
   and the correct grading seconds later — seen exactly that way in the log. */
await armQuestion();
await sleep(400);
const before7 = lines.length;
const clock7 = window.__app.session.startedAt;
window.__probe.rec._sound();                           // noise, no result yet
await speakLevel(300);
window.__probe.rec._speechend();
await sleep(4000);                                     // inside the measured latency
check('the latency does not produce a false "not understood"',
      !lines.slice(before7).some(l => l.includes('asking again')),
      lines.slice(before7).join(' / ') || '(nothing logged)');
check('the latency does not restart the clock',
      window.__app.session.startedAt === clock7,
      'before=' + clock7 + ' after=' + window.__app.session.startedAt);
window.__probe.rec._say([String(window.__app.session.expected)], true);
await sleep(300);
check('the late result is graded after all', lastGraded().includes('graded:'),
      lastGraded());

/* ---- 8. a prefix must not be graded while the recogniser is still working ----
   "3" stands there before "35" does, and the recogniser even goes back: the
   log shows 3 → 35 → 3. Whoever finalises the prefix throws the card onto box
   0 for a correct answer. Every result therefore has to rearm the deadline —
   it may only strike once nothing is coming any more. */
await armQuestion();
await sleep(400);
const exp8 = window.__app.session.expected;
const prefix8 = String(exp8).slice(0, 1);
const before8 = lines.length;
window.__probe.rec._say([prefix8], false);             // "3" of "35"
await speakLevel(200);
window.__probe.rec._speechend();
await sleep(2600);                                     // the old deadline would have struck
check('the prefix is not graded while the recogniser may still deliver',
      !lines.slice(before8).some(l => l.includes('graded:')),
      lines.slice(before8).join(' / '));
window.__probe.rec._say([String(exp8)], true);         // the real answer arrives
await sleep(300);
check('the answer that arrives late is the one graded',
      lastGraded().includes('graded: ' + exp8), lastGraded());

/* ---- 9. an utterance the recogniser swallows entirely ----
   The level detector hears speech, the recogniser delivers nothing at all —
   no result, no nomatch, no error. That is how Chrome loses "sechs" and
   "vier". The card must not be graded for it, and the child has to be told,
   otherwise it stares at "one moment" while the deadline grades the card
   WRONG. */
await armQuestion();
await sleep(400);
const key9 = window.__app.session.currentKey;
window.__app.profile().cards[key9].box = 3;            // something to lose
const before9 = lines.length;
window.__probe.rec._sound();                           // noise only, never a word
await speakLevel(400);
await sleep(window.__app.STT_SETTLE_MS + 1200);
check('a swallowed utterance is reported instead of passed over',
      lines.slice(before9).some(l => l.includes('asking again')),
      lines.slice(before9).join(' / ') || '(nothing logged)');
check('a swallowed utterance grades nothing',
      !lines.slice(before9).some(l => l.includes('graded:')),
      lines.slice(before9).join(' / '));
check('a swallowed utterance leaves the box alone',
      window.__app.profile().cards[key9].box === 3,
      'box=' + window.__app.profile().cards[key9].box);

/* ---- 10. the language change reaches the recogniser ----
   rec.lang is set when the recogniser is built and never changes on a running
   one. A child that speaks German into an English recogniser gets
   "Familiarizes" for "fünfunddreißig" — and that grades a card wrong. */
await armQuestion();
await sleep(300);
window.__app.openMenu();
await sleep(200);
const sel10 = document.getElementById('language');
const other = sel10.value === 'de' ? 'en' : 'de';
sel10.value = other;
sel10.dispatchEvent(new Event('change'));
await sleep(200);
window.__app.closeMenu();
await sleep(500);
check('the recogniser built after a language change speaks the new language',
      window.__probe.rec
        && window.__probe.rec.lang === window.ML.locale(other).speechLang,
      'chose ' + other + ', rec.lang=' + (window.__probe.rec && window.__probe.rec.lang));
check('the language change is visible in the log',
      lines.some(l => l.includes(window.ML.locale(other).speechLang)),
      lines.slice(-4).join(' / '));

return { checks, notes, tail: lines.slice(-14) };
