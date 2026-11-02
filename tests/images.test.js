import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachImages } from '../src/images.js';

let dir;
let imagePath;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-images-'));
  imagePath = path.join(dir, 'ảnh test.png');
  fs.writeFileSync(imagePath, Buffer.from([137, 80, 78, 71]));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function browser(files, ready = true) {
  const transfers = [];
  const page = {
    setFileInput: vi.fn(),
    screenshot: vi.fn(async ({ path: dest }) => fs.writeFileSync(dest, 'png')),
    evaluate: vi.fn(async script => {
      if (script.includes('const selected = Array.from(input?.files')) {
        // Execute the actual file-read probe with browser File objects/stubs.
        return vm.runInNewContext(script, { document: { querySelector: () => ({ files }) } });
      }
      if (script.includes('new DataTransfer()')) {
        const args = JSON.parse(script.slice(script.lastIndexOf('})(') + 3, -1));
        transfers.push(args.files);
        return { attached: true, count: args.files.length };
      }
      if (script.includes('const expectedCount =')) return { ready, count: ready ? 1 : 0, hasProgress: false };
      return { found: true, selector: 'input[type="file"]' };
    }),
  };
  return { page, transfers };
}

describe('Chrome filesystem image upload recovery', () => {
  it.each([
    ['empty FileList', []],
    ['zero-byte file', [{ size: 0 }]],
    ['unreadable file', [{ size: 4, slice: () => ({ arrayBuffer: async () => { throw new Error('NotReadableError'); } }) }]],
  ])('transfers local bytes after native success with %s', async (_name, files) => {
    const { page, transfers } = browser(files);
    await expect(attachImages(page, [imagePath], { screenshotDir: dir })).resolves.toEqual({ attached: true, count: 1 });
    expect(page.setFileInput).toHaveBeenCalledTimes(1);
    expect(transfers).toHaveLength(1);
    expect(transfers[0][0]).toEqual({ name: 'ảnh test.png', type: 'image/png', base64: fs.readFileSync(imagePath).toString('base64') });
  });

  it('keeps native upload when Chrome can read the bytes', async () => {
    const { page, transfers } = browser([new File([fs.readFileSync(imagePath)], 'image.png')]);
    await attachImages(page, [imagePath], { screenshotDir: dir });
    expect(transfers).toHaveLength(0);
  });

  it('does not attach again on preview timeout for readable files', async () => {
    const { page, transfers } = browser([new File(['image'], 'image.png')], false);
    await expect(attachImages(page, [imagePath], { screenshotDir: dir, timeoutMs: 0, intervalMs: 0 }))
      .rejects.toThrow(/State:.*hasProgress/);
    expect(transfers).toHaveLength(0);
    expect(page.setFileInput).toHaveBeenCalledTimes(1);
  });
});
