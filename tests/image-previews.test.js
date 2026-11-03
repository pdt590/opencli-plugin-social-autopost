import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import { WAIT_FOR_PREVIEWS_SCRIPT } from '../src/images.js';

function el({ text = '', src, editable = false } = {}) {
  return {
    hidden: false, offsetParent: {}, childElementCount: 0, textContent: text, currentSrc: src,
    getAttribute: () => null, getClientRects: () => [{}],
    closest: (selector) => (editable && selector === '[contenteditable="true"]' ? {} : null),
  };
}

function previews({ images, leaves = [], expectedCount }) {
  const dialog = {
    ...el(),
    getBoundingClientRect: () => ({ width: 1, height: 1, top: 0 }),
    querySelector: (selector) => (selector.includes('contenteditable') ? {} : null),
    querySelectorAll: (selector) => (selector === 'img' ? images : selector === 'div, span' ? leaves : []),
  };
  return vm.runInNewContext(WAIT_FOR_PREVIEWS_SCRIPT, {
    expectedCount, getComputedStyle: () => ({}),
    document: { querySelectorAll: (selector) => (selector === '[role="dialog"]' ? [dialog] : []) },
  });
}

const tiles = (n) => Array.from({ length: n }, (_, i) => el({ src: `blob:${i}` }));

describe('image preview counting', () => {
  it('counts images folded into the "+N" overlay', () => {
    expect(previews({ images: tiles(5), leaves: [el({ text: '+5' })], expectedCount: 10 })).toMatchObject({ ready: true, count: 10 });
  });
  it('ignores "+N" text typed in the caption', () => {
    expect(previews({ images: tiles(5), leaves: [el({ text: '+5', editable: true })], expectedCount: 10 })).toMatchObject({ ready: false, count: 5 });
  });
  it('still waits when tiles plus overlay are short of the expected count', () => {
    expect(previews({ images: tiles(5), leaves: [el({ text: '+3' })], expectedCount: 10 }).ready).toBe(false);
  });
});
