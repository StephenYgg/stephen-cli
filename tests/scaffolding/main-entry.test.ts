import { describe, expect, it } from 'vitest';

import { isMainEntrypoint } from '../../src/index.js';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('isMainEntrypoint', () => {
  it('matches a Windows argv path to the corresponding file URL', () => {
    expect(
      isMainEntrypoint('file:///D:/Development/Stephen/PersonalCli/dist/index.js', [
        'node',
        'D:\\Development\\Stephen\\PersonalCli\\dist\\index.js'
      ])
    ).toBe(true);
  });

  it('returns false when argv is missing the script path', () => {
    expect(isMainEntrypoint('file:///D:/Development/Stephen/PersonalCli/dist/index.js', ['node'])).toBe(
      false
    );
  });

  it('matches a linked argv path to the real module path', () => {
    const root = mkdtempSync(join(tmpdir(), 'stephen-cli-main-'));
    const realDir = join(root, 'real');
    const linkDir = join(root, 'link');
    const realFile = join(realDir, 'index.js');

    mkdirSync(realDir, { recursive: true });
    writeFileSync(realFile, 'export {};');

    symlinkSync(realDir, linkDir, 'junction');

    const moduleUrl = new URL(`file:///${realFile.replace(/\\/g, '/')}`).href;
    const linkedPath = join(linkDir, 'index.js');

    expect(isMainEntrypoint(moduleUrl, ['node', linkedPath])).toBe(true);
  });
});
