import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTimeGreeting } from '../src/utils/timeGreeting.ts';

test('returns the expected time-of-day greeting', () => {
  assert.equal(getTimeGreeting(8), 'Good morning');
  assert.equal(getTimeGreeting(14), 'Good afternoon');
  assert.equal(getTimeGreeting(19), 'Good evening');
  assert.equal(getTimeGreeting(2), 'Good night');
});

test('handles midnight boundary as good night', () => {
  assert.equal(getTimeGreeting(0), 'Good night');
  assert.equal(getTimeGreeting(5), 'Good night');
  assert.equal(getTimeGreeting(6), 'Good morning');
});
