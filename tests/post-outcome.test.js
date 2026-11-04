import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import { POST_OUTCOME_SCRIPT, pollPostOutcome } from '../src/composer.js';

function outcome(text, { stale = false, dialog = false } = {}) {
  const node = { innerText: text, hidden: false, offsetParent: {}, getAttribute: () => null, querySelector: () => null };
  const baseline = new Map(stale ? [[node, text]] : []);
  return vm.runInNewContext(POST_OUTCOME_SCRIPT, {
    Map,
    window: { __opencliPostNotices: baseline },
    getComputedStyle: () => ({}),
    document: {
      querySelectorAll: selector => selector === '[role="dialog"]'
        ? (dialog ? [{ ...node, querySelector: () => ({}), getBoundingClientRect: () => ({ width: 1, height: 1, top: 0 }) }] : [])
        : [node],
    },
  });
}

describe('post-click outcome', () => {
  it('reports posted as soon as the composer closes after the click', () => {
    expect(outcome('')).toMatchObject({ status: 'posted', evidence: 'post-click' });
  });
  it('waits while the composer is still open (upload in progress)', () => {
    expect(outcome('', { dialog: true })).toMatchObject({ status: 'waiting', composer_open: true });
  });
  it.each(['Action blocked', 'Không thể đăng'])('reports a new Facebook error notice %s as failed', text => {
    expect(outcome(text).status).toBe('failed');
    expect(outcome(text, { dialog: true }).status).toBe('failed');
  });
  it('ignores error notices that were already on the page before the click', () => {
    expect(outcome('Action blocked', { stale: true }).status).toBe('posted');
  });
  it('returns unknown only when the composer never closes', async () => {
    const result = await pollPostOutcome({ evaluate: async () => ({ status: 'waiting', composer_open: true }) }, { timeoutMs: 1, intervalMs: 1 });
    expect(result).toMatchObject({ status: 'unknown', composer_open: true });
  });
  it('returns posted from the poll without further steps', async () => {
    let calls = 0;
    const page = { evaluate: async () => (++calls < 3 ? { status: 'waiting', composer_open: true } : { status: 'posted', evidence: 'post-click' }) };
    expect(await pollPostOutcome(page, { timeoutMs: 1000, intervalMs: 1 })).toMatchObject({ status: 'posted' });
    expect(calls).toBe(3);
  });
});
