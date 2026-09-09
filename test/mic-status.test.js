const { test } = require('node:test');
const assert = require('node:assert');
const ML = require('../logic.js');

// Fully listen-ready situation — every test flips exactly one thing.
function situation(extra = {}) {
  return {
    active: true, paused: false, reading: false,
    processing: false, speaking: false, started: true,
    ...extra
  };
}

test('without an active microphone the display stays off', () => {
  assert.strictEqual(ML.micState(situation({ active: false })), ML.MIC_OFF);
  assert.strictEqual(ML.micState({}), ML.MIC_OFF);
  assert.strictEqual(ML.micState(null), ML.MIC_OFF);
  assert.strictEqual(ML.micState(undefined), ML.MIC_OFF);
});

test('"off" wins over everything else — even with stale events trailing', () => {
  assert.strictEqual(
    ML.micState(situation({ active: false, speaking: true, processing: true })),
    ML.MIC_OFF);
});

test('a confirmed start means: speak now', () => {
  assert.strictEqual(ML.micState(situation()), ML.MIC_READY);
});

test('without a confirmed start only the start attempt is shown', () => {
  assert.strictEqual(ML.micState(situation({ started: false })), ML.MIC_STARTING);
});

test('while reading out, "do not speak yet" wins, even with an open microphone', () => {
  assert.strictEqual(
    ML.micState(situation({ reading: true })), ML.MIC_READING);
  assert.strictEqual(
    ML.micState(situation({ reading: true, speaking: true })), ML.MIC_READING);
});

test('paused wins over reading out', () => {
  assert.strictEqual(
    ML.micState(situation({ paused: true, reading: true })), ML.MIC_PAUSED);
});

test('speaking is shown as hearing', () => {
  assert.strictEqual(ML.micState(situation({ speaking: true })), ML.MIC_HEARING);
});

test('after speechend, "processing" wins over "hearing"', () => {
  assert.strictEqual(
    ML.micState(situation({ speaking: true, processing: true })), ML.MIC_PROCESSING);
});

test('processing and hearing also apply without a confirmed start', () => {
  // An event is better evidence than the started flag; without this order the
  // display would fall back to "microphone starting" in the middle of speaking.
  assert.strictEqual(
    ML.micState(situation({ started: false, speaking: true })), ML.MIC_HEARING);
  assert.strictEqual(
    ML.micState(situation({ started: false, processing: true })), ML.MIC_PROCESSING);
});

test('all states are distinguishable from one another', () => {
  const all = [ML.MIC_OFF, ML.MIC_PAUSED, ML.MIC_READING, ML.MIC_STARTING,
               ML.MIC_READY, ML.MIC_HEARING, ML.MIC_PROCESSING];
  assert.strictEqual(new Set(all).size, all.length);
});
