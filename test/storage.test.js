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

test('ein Zustand mit unauffindbarem aktiven Profil wird repariert', () => {
  const { state } = ML.createProfile(ML.defaultState(), 'Anna', NOW);
  state.activeProfile = 'p9';
  const s = fakeStorage({ [ML.STORAGE_KEY]: JSON.stringify(state) });
  const geladen = ML.loadState(s);
  assert.strictEqual(geladen.activeProfile, 'p1', 'rückt auf ein vorhandenes Profil');
  assert.strictEqual(Object.keys(geladen.profiles).length, 1);
});

test('Profile ohne Karten werden verworfen', () => {
  const { state } = ML.createProfile(ML.defaultState(), 'Anna', NOW);
  state.profiles.p2 = { name: 'Kaputt' };
  const s = fakeStorage({ [ML.STORAGE_KEY]: JSON.stringify(state) });
  const geladen = ML.loadState(s);
  assert.deepStrictEqual(Object.keys(geladen.profiles), ['p1']);
  assert.strictEqual(geladen.activeProfile, 'p1');
});

test('saveState meldet, ob geschrieben werden konnte', () => {
  assert.strictEqual(ML.saveState(fakeStorage({}), ML.defaultState()), true);
  const gesperrt = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); }
  };
  assert.strictEqual(ML.saveState(gesperrt, ML.defaultState()), false,
    'voller oder gesperrter Speicher wird gemeldet');
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

test('jedes Profil hat sein eigenes Einstellungsobjekt', () => {
  let r = ML.createProfile(ML.defaultState(), 'Anna', NOW);
  r = ML.createProfile(r.state, 'Ben', NOW);
  const a = r.state.profiles.p1;
  const b = r.state.profiles.p2;

  assert.notStrictEqual(a.settings, b.settings, 'keine geteilte Referenz zwischen Profilen');
  assert.notStrictEqual(a.settings, ML.DEFAULT_SETTINGS, 'keine Referenz auf die Vorgabewerte');

  a.settings.thresholdMs = 9999;
  assert.strictEqual(b.settings.thresholdMs, ML.DEFAULT_SETTINGS.thresholdMs,
    'das andere Profil bleibt unberührt');
  assert.strictEqual(ML.DEFAULT_SETTINGS.thresholdMs, 3000,
    'die Vorgabewerte selbst bleiben unberührt');
});
