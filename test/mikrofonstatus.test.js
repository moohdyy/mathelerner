const { test } = require('node:test');
const assert = require('node:assert');
const ML = require('../logic.js');

// Vollständig zuhörbereite Lage — jeder Test schaltet davon genau eine Sache um.
function lage(extra = {}) {
  return {
    aktiv: true, pausiert: false, wirdVorgelesen: false,
    verarbeitet: false, spricht: false, gestartet: true,
    ...extra
  };
}

test('ohne aktives Mikrofon bleibt die Anzeige aus', () => {
  assert.strictEqual(ML.mikrofonZustand(lage({ aktiv: false })), ML.MIK_AUS);
  assert.strictEqual(ML.mikrofonZustand({}), ML.MIK_AUS);
  assert.strictEqual(ML.mikrofonZustand(null), ML.MIK_AUS);
  assert.strictEqual(ML.mikrofonZustand(undefined), ML.MIK_AUS);
});

test('„aus“ gilt vor allem anderen — auch wenn noch alte Ereignisse nachhängen', () => {
  assert.strictEqual(
    ML.mikrofonZustand(lage({ aktiv: false, spricht: true, verarbeitet: true })),
    ML.MIK_AUS);
});

test('bestätigter Start heißt: jetzt sprechen', () => {
  assert.strictEqual(ML.mikrofonZustand(lage()), ML.MIK_BEREIT);
});

test('ohne bestätigten Start wird nur der Startversuch gezeigt', () => {
  assert.strictEqual(ML.mikrofonZustand(lage({ gestartet: false })), ML.MIK_STARTET);
});

test('während des Vorlesens gilt „noch nicht sprechen“, auch bei offenem Mikrofon', () => {
  assert.strictEqual(
    ML.mikrofonZustand(lage({ wirdVorgelesen: true })), ML.MIK_VORLESEN);
  assert.strictEqual(
    ML.mikrofonZustand(lage({ wirdVorgelesen: true, spricht: true })), ML.MIK_VORLESEN);
});

test('pausiert gilt vor dem Vorlesen', () => {
  assert.strictEqual(
    ML.mikrofonZustand(lage({ pausiert: true, wirdVorgelesen: true })), ML.MIK_PAUSIERT);
});

test('Sprechen wird als Zuhören gezeigt', () => {
  assert.strictEqual(ML.mikrofonZustand(lage({ spricht: true })), ML.MIK_HOERT);
});

test('nach speechend gilt „verarbeitet“ vor „hört“', () => {
  assert.strictEqual(
    ML.mikrofonZustand(lage({ spricht: true, verarbeitet: true })), ML.MIK_VERARBEITET);
});

test('verarbeitet und hört gelten auch ohne bestätigten Start', () => {
  // Ein Ereignis ist der bessere Beleg als das Startflag; ohne diese Reihenfolge
  // fiele die Anzeige mitten im Sprechen auf „Mikrofon startet“ zurück.
  assert.strictEqual(
    ML.mikrofonZustand(lage({ gestartet: false, spricht: true })), ML.MIK_HOERT);
  assert.strictEqual(
    ML.mikrofonZustand(lage({ gestartet: false, verarbeitet: true })), ML.MIK_VERARBEITET);
});

test('alle Zustände sind voneinander unterscheidbar', () => {
  const alle = [ML.MIK_AUS, ML.MIK_PAUSIERT, ML.MIK_VORLESEN, ML.MIK_STARTET,
                ML.MIK_BEREIT, ML.MIK_HOERT, ML.MIK_VERARBEITET];
  assert.strictEqual(new Set(alle).size, alle.length);
});
