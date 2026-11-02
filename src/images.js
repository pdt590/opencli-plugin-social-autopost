import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import { captureScreenshot } from './artifacts.js';
import { ACTIVE_DIALOG_HELPERS, evaluateWithArgs, PHOTO_BUTTON_LABELS, poll } from './composer.js';

const FILE_INPUT_MARKER = 'data-opencli-social-autopost-file-input';
const FILE_INPUT_SELECTOR = `input[type="file"][${FILE_INPUT_MARKER}="active"]`;

// CDP can report success even when sandboxed/remote Chrome cannot read the path.
const READ_ATTACHED_FILES_SCRIPT = `(async () => {
  const input = document.querySelector(selector);
  const selected = Array.from(input?.files || []);
  if (selected.length !== expectedCount) return { readable: false, reason: 'file-count', count: selected.length };
  try {
    for (const file of selected) {
      if (!file.size || !(await file.slice(0, 1).arrayBuffer()).byteLength) {
        return { readable: false, reason: 'empty-file', count: selected.length };
      }
    }
    return { readable: true, count: selected.length };
  } catch (error) {
    return { readable: false, reason: 'file-read-failed', message: String(error.message), count: selected.length };
  }
})()`;

const FIND_FILE_INPUT_SCRIPT = `(() => {
  ${ACTIVE_DIALOG_HELPERS}
  const dialog = activeDialog();
  if (!dialog) return { found: false, reason: 'dialog-not-found' };
  const inputs = Array.from(dialog.querySelectorAll('input[type="file"]'));
  const imageInput = inputs.find((input) => {
    const accept = String(input.getAttribute('accept') || '').toLowerCase();
    return !accept || accept.includes('image') || accept.includes('.jpg') || accept.includes('.png');
  });
  if (!imageInput) return { found: false, reason: 'input-not-found' };
  for (const oldInput of document.querySelectorAll('input[type="file"][${FILE_INPUT_MARKER}]')) {
    oldInput.removeAttribute('${FILE_INPUT_MARKER}');
  }
  imageInput.setAttribute('${FILE_INPUT_MARKER}', 'active');
  return { found: true, selector: '${FILE_INPUT_SELECTOR}' };
})()`;

const CLICK_PHOTO_BUTTON_SCRIPT = `(() => {
  ${ACTIVE_DIALOG_HELPERS}
  const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const labelSet = labels.map(normalize).filter(Boolean);
  const dialog = activeDialog();
  if (!dialog) return { clicked: false, reason: 'dialog-not-found' };
  const buttons = Array.from(dialog.querySelectorAll('[role="button"], button, input[type="file"]'))
    .filter(elementVisible)
    .filter((el) => el.getAttribute('aria-disabled') !== 'true' && el.getAttribute('disabled') === null);
  for (const el of buttons) {
    const text = normalize([
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.innerText,
      el.textContent,
    ].filter(Boolean).join(' '));
    const matched = labelSet.some((label) => text === label || text.startsWith(label) || text.includes(label));
    if (matched) {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.click();
      return { clicked: true, label: text };
    }
  }
  return { clicked: false, reason: 'photo-button-not-found' };
})()`;

const WAIT_FOR_PREVIEWS_SCRIPT = `(() => {
  ${ACTIVE_DIALOG_HELPERS}
  const dialog = activeDialog();
  if (!dialog) return { ready: false, reason: 'dialog-not-found', count: 0 };
  const visible = (el) => elementVisible(el);
  const imageUrls = new Set(
    Array.from(dialog.querySelectorAll('img'))
      .filter(visible)
      .map((img) => img.currentSrc || img.src || '')
      .filter((src) => src.startsWith('blob:') || src.startsWith('data:'))
  );
  const removeButtons = Array.from(dialog.querySelectorAll('[aria-label], [role="button"]')).filter((el) => {
    const label = String(el.getAttribute('aria-label') || el.textContent || '').toLowerCase();
    return label.includes('remove photo') || label.includes('remove image') || label.includes('移除照片') || label.includes('删除照片');
  }).length;
  const progress = dialog.querySelector('[role="progressbar"], [aria-busy="true"]');
  const count = Math.max(imageUrls.size, removeButtons);
  return { ready: count >= expectedCount && !progress, count, hasProgress: Boolean(progress) };
})()`;

const ATTACH_VIA_DATATRANSFER_SCRIPT = `(() => {
  const input = document.querySelector(selector);
  if (!input) return { attached: false, reason: 'input-not-found' };
  const base64ToFile = (file) => {
    const binary = atob(file.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], file.name, { type: file.type });
  };
  const transfer = new DataTransfer();
  for (const file of files) {
    transfer.items.add(base64ToFile(file));
  }
  let assigned = false;
  try {
    Object.defineProperty(input, 'files', { value: transfer.files, writable: false, configurable: true });
    assigned = input.files && input.files.length >= files.length;
  } catch {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files');
      if (descriptor && descriptor.set) {
        descriptor.set.call(input, transfer.files);
        assigned = input.files && input.files.length >= files.length;
      }
    } catch {
      assigned = false;
    }
  }
  if (!assigned) return { attached: false, reason: 'could-not-assign-files' };
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return { attached: true, count: input.files.length };
})()`;

export async function ensureFileInput(page, { screenshotDir, timeoutMs = 10000, intervalMs = 250 } = {}) {
  const existing = await page.evaluate(FIND_FILE_INPUT_SCRIPT);
  if (existing?.found) {
    return existing.selector;
  }

  await evaluateWithArgs(page, CLICK_PHOTO_BUTTON_SCRIPT, {
    labels: PHOTO_BUTTON_LABELS,
  });

  const found = await poll(
    () => page.evaluate(FIND_FILE_INPUT_SCRIPT),
    (state) => state?.found,
    { timeoutMs, intervalMs },
  );

  if (!found?.found) {
    const screenshot = await captureScreenshot(page, screenshotDir, 'image-file-input-not-found');
    throw new CommandExecutionError(`Could not find Facebook image file input. Screenshot: ${screenshot}`);
  }

  return found.selector;
}

export async function attachImages(
  page,
  absPaths,
  { screenshotDir, timeoutMs = 30000, intervalMs = 500, bridgeTimeoutMs = 15000 } = {},
) {
  if (!absPaths.length) {
    return { attached: true, count: 0 };
  }

  const selector = await withTimeout(
    ensureFileInput(page, { screenshotDir, timeoutMs: Math.min(timeoutMs, 10000), intervalMs }),
    bridgeTimeoutMs,
    'finding the Facebook image input',
  );

  let base64Error;
  try {
    await withTimeout(attachImagesViaDataTransfer(page, selector, absPaths), bridgeTimeoutMs, 'transferring image bytes');
  } catch (error) {
    base64Error = error;
  }

  if (base64Error) {
    // A bridge/evaluation error can arrive after the browser accepted the files.
    // Check the FileList before using the native path so we never attach twice.
    let selected;
    let probeError;
    try {
      selected = await withTimeout(evaluateWithArgs(page, READ_ATTACHED_FILES_SCRIPT, {
        selector, expectedCount: absPaths.length,
      }), bridgeTimeoutMs, 'checking the selected image files');
    } catch (error) { probeError = error; }

    const confirmedEmpty = selected?.reason === 'file-count' && selected.count === 0;
    if (!confirmedEmpty) {
      const screenshot = await captureScreenshot(page, screenshotDir, 'base64-upload-state-unknown');
      const state = probeError ? `FileList check failed: ${probeError.message}` : `FileList state: ${JSON.stringify(selected)}`;
      throw new CommandExecutionError(
        `Base64 image transfer failed (${base64Error.message}); ${state}. Native path fallback was not attempted to avoid duplicate attachments. Screenshot: ${screenshot}`,
      );
    }

    {
      try {
        if (typeof page.setFileInput !== 'function') {
          throw new Error('setFileInput is not supported by this Browser Bridge');
        }
        await withTimeout(page.setFileInput(absPaths, selector), bridgeTimeoutMs, 'using native image path fallback');
        selected = await withTimeout(evaluateWithArgs(page, READ_ATTACHED_FILES_SCRIPT, {
          selector, expectedCount: absPaths.length,
        }), bridgeTimeoutMs, 'checking native path image files');
        if (!selected?.readable) {
          throw new CommandExecutionError('Browser could not read the files selected by setFileInput');
        }
      } catch (error) {
        const screenshot = await captureScreenshot(page, screenshotDir, 'image-upload-failed');
        throw new CommandExecutionError(
          `Could not attach images with Base64 transfer (${base64Error.message}) or native path fallback (${error.message}). Screenshot: ${screenshot}`,
        );
      }
    }
  }

  const previews = await waitForPreviews(page, absPaths.length, {
    screenshotDir,
    timeoutMs: Math.min(timeoutMs, 45000),
    intervalMs,
    bridgeTimeoutMs,
  });

  return { attached: true, count: previews.count };
}

export async function waitForPreviews(page, expected, { screenshotDir, timeoutMs = 30000, intervalMs = 500, bridgeTimeoutMs = 15000 } = {}) {
  const state = await poll(
    () => withTimeout(evaluateWithArgs(page, WAIT_FOR_PREVIEWS_SCRIPT, { expectedCount: expected }), bridgeTimeoutMs, 'checking Facebook image previews'),
    (result) => result?.ready,
    { timeoutMs, intervalMs },
  );

  if (!state?.ready) {
    const screenshot = await captureScreenshot(page, screenshotDir, 'image-previews-not-ready');
    throw new CommandExecutionError(
      `Facebook image previews were not verified (${state?.count || 0}/${expected}). State: ${JSON.stringify(state)}. Screenshot: ${screenshot}`,
    );
  }

  return state;
}

function withTimeout(promise, timeoutMs, operation) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Browser Bridge timed out after ${timeoutMs}ms while ${operation}`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function attachImagesViaDataTransfer(page, selector, absPaths) {
  const files = absPaths.map((filePath) => ({
    name: path.basename(filePath),
    type: mimeTypeForPath(filePath),
    base64: fs.readFileSync(filePath).toString('base64'),
  }));

  const payloadSize = files.reduce((total, file) => total + file.base64.length, 0);
  if (payloadSize > 256 * 1024) {
    return attachLargeImagesViaDataTransfer(page, selector, files);
  }

  const result = await evaluateWithArgs(page, ATTACH_VIA_DATATRANSFER_SCRIPT, {
    selector,
    files,
  });
  if (!result?.attached) {
    throw new CommandExecutionError(`Image upload failed (base64 fallback): ${result?.reason || 'unknown error'}`);
  }
  return result;
}

async function attachLargeImagesViaDataTransfer(page, selector, files) {
  const uploadId = randomUUID();
  const chunksPerCall = 96 * 1024;
  const initialize = `(() => {
    window.__opencliSocialUploads ||= Object.create(null);
    window.__opencliSocialUploads[uploadId] = files.map(file => ({
      name: file.name, type: file.type, parts: []
    }));
    return { initialized: true, count: files.length };
  })()`;
  await evaluateWithArgs(page, initialize, {
    uploadId,
    files: files.map(({ name, type }) => ({ name, type })),
  });

  try {
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const base64 = files[fileIndex].base64;
      for (let offset = 0; offset < base64.length; offset += chunksPerCall) {
        const append = `(() => {
          const upload = window.__opencliSocialUploads?.[uploadId];
          if (!upload?.[fileIndex]) return { appended: false, reason: 'upload-state-not-found' };
          upload[fileIndex].parts.push(chunk);
          return { appended: true };
        })()`;
        const result = await evaluateWithArgs(page, append, {
          uploadId,
          fileIndex,
          chunk: base64.slice(offset, offset + chunksPerCall),
        });
        if (!result?.appended) {
          throw new CommandExecutionError(`Base64 image chunk transfer failed: ${result?.reason || 'unknown error'}`);
        }
      }
    }

    const finish = `(() => {
      const upload = window.__opencliSocialUploads?.[uploadId];
      const input = document.querySelector(selector);
      if (!upload || !input) return { attached: false, reason: !upload ? 'upload-state-not-found' : 'input-not-found' };
      try {
        const transfer = new DataTransfer();
        for (const item of upload) {
          const binary = atob(item.parts.join(''));
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
          transfer.items.add(new File([bytes], item.name, { type: item.type }));
        }
        let assigned = false;
        try {
          Object.defineProperty(input, 'files', { value: transfer.files, writable: false, configurable: true });
          assigned = input.files && input.files.length >= upload.length;
        } catch {
          const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files');
          if (descriptor?.set) {
            descriptor.set.call(input, transfer.files);
            assigned = input.files && input.files.length >= upload.length;
          }
        }
        if (!assigned) return { attached: false, reason: 'could-not-assign-files' };
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { attached: true, count: input.files.length };
      } finally {
        delete window.__opencliSocialUploads[uploadId];
      }
    })()`;
    const result = await evaluateWithArgs(page, finish, { uploadId, selector });
    if (!result?.attached) {
      throw new CommandExecutionError(`Image upload failed (chunked base64): ${result?.reason || 'unknown error'}`);
    }
    return result;
  } catch (error) {
    try {
      await evaluateWithArgs(page, `(() => { if (window.__opencliSocialUploads) delete window.__opencliSocialUploads[uploadId]; return true; })()`, { uploadId });
    } catch { /* Preserve the upload error; the task tab will be closed during cleanup. */ }
    throw error;
  }
}

export function mimeTypeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}
