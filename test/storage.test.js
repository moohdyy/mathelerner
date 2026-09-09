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

test('empty storage yields the default state', () => {
  assert.deepStrictEqual(ML.loadState(fakeStorage({})), {
    version: 1, activeProfile: null, profiles: {}
  });
});

test('damaged JSON does not crash', () => {
  const s = fakeStorage({ [ML.STORAGE_KEY]: '{broken' });
  assert.deepStrictEqual(ML.loadState(s), ML.defaultState());
});

test('nonsensical but valid JSON yields the default state', () => {
  assert.deepStrictEqual(ML.loadState(fakeStorage({ [ML.STORAGE_KEY]: '42' })), ML.defaultState());
  assert.deepStrictEqual(ML.loadState(fakeStorage({ [ML.STORAGE_KEY]: 'null' })), ML.defaultState());
  assert.deepStrictEqual(
    ML.loadState(fakeStorage({ [ML.STORAGE_KEY]: '{"version":99}' })),
    ML.defaultState(), 'an unknown version is discarded'
  );
});

test('saving and loading yields the same state', () => {
  const s = fakeStorage({});
  const { state } = ML.createProfile(ML.defaultState(), 'Anna', NOW);
  ML.saveState(s, state);
  assert.deepStrictEqual(ML.loadState(s), state);
});

test('a state with an unfindable active profile is repaired', () => {
  const { state } = ML.createProfile(ML.defaultState(), 'Anna', NOW);
  state.activeProfile = 'p9';
  const s = fakeStorage({ [ML.STORAGE_KEY]: JSON.stringify(state) });
  const loaded = ML.loadState(s);
  assert.strictEqual(loaded.activeProfile, 'p1', 'moves on to an existing profile');
  assert.strictEqual(Object.keys(loaded.profiles).length, 1);
});

test('profiles without cards are discarded', () => {
  const { state } = ML.createProfile(ML.defaultState(), 'Anna', NOW);
  state.profiles.p2 = { name: 'Kaputt' };
  const s = fakeStorage({ [ML.STORAGE_KEY]: JSON.stringify(state) });
  const loaded = ML.loadState(s);
  assert.deepStrictEqual(Object.keys(loaded.profiles), ['p1']);
  assert.strictEqual(loaded.activeProfile, 'p1');
});

test('saveState reports whether the write went through', () => {
  assert.strictEqual(ML.saveState(fakeStorage({}), ML.defaultState()), true);
  const blocked = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); }
  };
  assert.strictEqual(ML.saveState(blocked, ML.defaultState()), false,
    'full or blocked storage is reported');
});

test('a new profile gets all 100 cards in box 0', () => {
  const p = ML.newProfile('Anna', NOW);
  assert.strictEqual(p.name, 'Anna');
  assert.strictEqual(p.created, NOW);
  assert.strictEqual(Object.keys(p.cards).length, 100);
  assert.deepStrictEqual(p.cards['7x8'], ML.newCard());
  assert.deepStrictEqual(p.settings, ML.DEFAULT_SETTINGS);
  assert.deepStrictEqual(p.stats, { sessions: 0, totalAnswers: 0 });
});

test('profiles get consecutive ids and are made active', () => {
  let r = ML.createProfile(ML.defaultState(), 'Anna', NOW);
  assert.strictEqual(r.id, 'p1');
  assert.strictEqual(r.state.activeProfile, 'p1');

  r = ML.createProfile(r.state, 'Ben', NOW);
  assert.strictEqual(r.id, 'p2');
  assert.strictEqual(r.state.activeProfile, 'p2');
  assert.deepStrictEqual(Object.keys(r.state.profiles), ['p1', 'p2']);
});

test('createProfile does not mutate the state handed to it', () => {
  const base = ML.defaultState();
  ML.createProfile(base, 'Anna', NOW);
  assert.deepStrictEqual(base, ML.defaultState());
});

test('deleted profiles disappear and the active one moves on', () => {
  let r = ML.createProfile(ML.defaultState(), 'Anna', NOW);
  r = ML.createProfile(r.state, 'Ben', NOW);

  let state = ML.deleteProfile(r.state, 'p2');
  assert.deepStrictEqual(Object.keys(state.profiles), ['p1']);
  assert.strictEqual(state.activeProfile, 'p1', 'the active profile moves on');

  state = ML.deleteProfile(state, 'p1');
  assert.deepStrictEqual(state.profiles, {});
  assert.strictEqual(state.activeProfile, null);
});

test('freed profile ids are reused', () => {
  let r = ML.createProfile(ML.defaultState(), 'Anna', NOW);
  r = ML.createProfile(r.state, 'Ben', NOW);
  const state = ML.deleteProfile(r.state, 'p1');
  assert.strictEqual(ML.createProfile(state, 'Cem', NOW).id, 'p1');
});

test('openCount counts the cards below box 3', () => {
  const p = ML.newProfile('Anna', NOW);
  assert.strictEqual(ML.openCount(p), 100);
  p.cards['7x8'].box = ML.BOX_MASTERED;
  p.cards['1x1'].box = 2;
  assert.strictEqual(ML.openCount(p), 99);
});

test('every profile has its own settings object', () => {
  let r = ML.createProfile(ML.defaultState(), 'Anna', NOW);
  r = ML.createProfile(r.state, 'Ben', NOW);
  const a = r.state.profiles.p1;
  const b = r.state.profiles.p2;

  assert.notStrictEqual(a.settings, b.settings, 'no shared reference between profiles');
  assert.notStrictEqual(a.settings, ML.DEFAULT_SETTINGS, 'no reference to the defaults');

  a.settings.thresholdMs = 9999;
  assert.strictEqual(b.settings.thresholdMs, ML.DEFAULT_SETTINGS.thresholdMs,
    'the other profile stays untouched');
  assert.strictEqual(ML.DEFAULT_SETTINGS.thresholdMs, 3000,
    'the defaults themselves stay untouched');
});
