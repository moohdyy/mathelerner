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


test('DEFAULT_SETTINGS asks every row', () => {
  assert.deepStrictEqual(ML.DEFAULT_SETTINGS.rows, ML.ALL_ROWS);
});

test('a new profile asks every row', () => {
  assert.deepStrictEqual(ML.newProfile('Kind', 0, 'de').settings.rows, ML.ALL_ROWS);
});

test('every profile has its own row selection', () => {
  const a = ML.newProfile('Anna', 0, 'de');
  const b = ML.newProfile('Ben', 0, 'de');
  a.settings.rows.push(99);
  assert.deepStrictEqual(b.settings.rows, ML.ALL_ROWS, 'no shared reference');
  assert.deepStrictEqual(ML.DEFAULT_SETTINGS.rows, ML.ALL_ROWS, 'the defaults stay untouched');
});

test('a stored state without a row selection keeps all its progress', () => {
  const profile = ML.newProfile('Kind', 0, 'de');
  profile.cards['7x8'].box = 3;
  delete profile.settings.rows;                      // as the earlier version wrote it
  const stored = { version: 1, activeProfile: 'p1', profiles: { p1: profile } };
  const storage = { getItem: () => JSON.stringify(stored), setItem: () => {} };

  const loaded = ML.loadState(storage);
  assert.strictEqual(loaded.profiles.p1.cards['7x8'].box, 3);
  assert.deepStrictEqual(loaded.profiles.p1.settings.rows, ML.ALL_ROWS);
});

test('loadState heals an unusable row selection', () => {
  const cases = [[], 'alle', 42, null, {}, [0, 11], ['x']];
  cases.forEach((bad) => {
    const profile = ML.newProfile('Kind', 0, 'de');
    profile.settings.rows = bad;
    const stored = { version: 1, activeProfile: 'p1', profiles: { p1: profile } };
    const storage = { getItem: () => JSON.stringify(stored), setItem: () => {} };
    assert.deepStrictEqual(ML.loadState(storage).profiles.p1.settings.rows, ML.ALL_ROWS,
      'rows ' + JSON.stringify(bad));
  });
});

test('loadState keeps a valid row selection, sorted', () => {
  const profile = ML.newProfile('Kind', 0, 'de');
  profile.settings.rows = [7, 3, 3];
  const stored = { version: 1, activeProfile: 'p1', profiles: { p1: profile } };
  const storage = { getItem: () => JSON.stringify(stored), setItem: () => {} };
  assert.deepStrictEqual(ML.loadState(storage).profiles.p1.settings.rows, [3, 7]);
});

test('openCount counts only the cards of selected rows', () => {
  const p = ML.newProfile('Anna', NOW, 'de');
  p.settings.rows = [3, 7];
  assert.strictEqual(ML.openCount(p), 4, '3x3, 3x7, 7x3, 7x7');
  p.cards['7x7'].box = ML.BOX_MASTERED;
  assert.strictEqual(ML.openCount(p), 3);
  p.cards['1x1'].box = ML.BOX_MASTERED;
  assert.strictEqual(ML.openCount(p), 3, 'a card outside the selection changes nothing');
});
