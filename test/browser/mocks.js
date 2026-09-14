// Stand-ins installed BEFORE the page script runs.
// The recogniser behaves like Chrome does continuously: ONE speechstart per
// pass, no speechend per utterance, growing segments, and no 'end' after a
// final result. The level detector is fed by hand so the end of speaking is a
// controllable moment instead of real audio.
(function () {
  var log = [];
  window.__probe = { log: log, level: 0.0, now: null };

  function rec_() { }
  function FakeSR() {
    this.continuous = false;
    this.interimResults = false;
    this.maxAlternatives = 1;
    this.lang = '';
    this._listeners = {};
    this._segments = [];
    this._live = false;
    this._sawSpeechStart = false;
    window.__probe.rec = this;
  }
  FakeSR.prototype.addEventListener = function (name, fn) {
    (this._listeners[name] = this._listeners[name] || []).push(fn);
  };
  FakeSR.prototype._fire = function (name, ev) {
    log.push(name);
    var list = this._listeners[name] || [];
    for (var i = 0; i < list.length; i++) list[i].call(this, ev || { type: name });
  };
  FakeSR.prototype.start = function () {
    if (this._live) throw new Error('InvalidStateError');
    this._live = true;
    var self = this;
    setTimeout(function () { if (self._live) self._fire('start'); }, 0);
  };
  FakeSR.prototype.abort = function () {
    if (!this._live) return;
    this._live = false;
    var self = this;
    setTimeout(function () {
      self._fire('error', { error: 'aborted' });
      self._fire('end');
    }, 0);
  };
  FakeSR.prototype.stop = FakeSR.prototype.abort;

  // One utterance: segments grow, the last one becomes final. Continuously
  // NO speechend and NO end follow — exactly the shape that broke the
  // watchdog and the time measurement.
  FakeSR.prototype._say = function (texts, final) {
    if (!this._sawSpeechStart) {
      this._sawSpeechStart = true;
      this._fire('speechstart');   // once per pass, as in continuous mode
    }
    var results = this._segments.slice();
    results.push({ isFinal: !!final, length: texts.length,
                   0: { transcript: texts[0], confidence: 1 } });
    for (var i = 1; i < texts.length; i++) {
      results[results.length - 1][i] = { transcript: texts[i], confidence: 1 };
    }
    if (final) this._segments = results;
    results.length = results.length;
    this._fire('result', { results: asResultList(results), resultIndex: results.length - 1 });
  };
  function asResultList(arr) {
    var out = { length: arr.length };
    for (var i = 0; i < arr.length; i++) out[i] = arr[i];
    return out;
  }

  // Chrome sends this after the pause in speech — continuously it is the only
  // signal that the utterance is over; no 'end' follows it.
  FakeSR.prototype._speechend = function () { this._fire('speechend'); };

  // Noise without any recognition. Chrome reports it for every utterance,
  // including the short ones it then drops without a trace — "sechs" came
  // through in one of nine attempts, and the other eight looked exactly like
  // this. Without it the harness only ever sees utterances that arrive, which
  // is the case that was never broken.
  FakeSR.prototype._sound = function () { this._fire('soundstart'); };

  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;

  // ---- level detector: analyser reads window.__probe.level ----
  navigator.mediaDevices = navigator.mediaDevices || {};
  navigator.mediaDevices.getUserMedia = function () {
    return Promise.resolve({ getTracks: function () { return [{ stop: function () {} }]; } });
  };
  function FakeCtx() { }
  FakeCtx.prototype.createAnalyser = function () {
    return {
      fftSize: 1024,
      getFloatTimeDomainData: function (buf) {
        var v = window.__probe.level;
        for (var i = 0; i < buf.length; i++) buf[i] = v;
      }
    };
  };
  FakeCtx.prototype.createMediaStreamSource = function () {
    return { connect: function () {} };
  };
  FakeCtx.prototype.close = function () {};
  window.AudioContext = FakeCtx;
  window.webkitAudioContext = FakeCtx;

  // ---- no reading out: the clock must start immediately ----
  window.speechSynthesis = {
    speak: function (u) { if (u && u.onend) setTimeout(u.onend, 0); },
    cancel: function () {}, getVoices: function () { return []; },
    addEventListener: function () {}
  };
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
})();
