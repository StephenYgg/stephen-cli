import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it, vi } from 'vitest';

import { createDiskCleanupRuntime, resolveDiskCleanupRoots } from '../../src/disk/runtime.js';

describe('disk runtime', () => {
  it('resolves Windows roots from the environment', () => {
    const roots = resolveDiskCleanupRoots({
      SystemRoot: 'C:\\Windows',
      USERPROFILE: 'C:\\Users\\Stephen'
    });

    expect(roots).toEqual({
      systemRoot: 'C:\\Windows',
      userProfileRoot: 'C:\\Users\\Stephen'
    });
  });

  it('falls back to HOMEDRIVE and HOMEPATH when USERPROFILE is absent', () => {
    const roots = resolveDiskCleanupRoots({
      HOMEDRIVE: 'C:',
      HOMEPATH: '\\Users\\Stephen',
      SystemRoot: 'C:\\Windows'
    });

    expect(roots.userProfileRoot).toBe('C:\\Users\\Stephen');
  });

  it('uses C:\\Windows as the default system root when SystemRoot is absent', () => {
    const roots = resolveDiskCleanupRoots({
      USERPROFILE: 'C:\\Users\\Stephen'
    });

    expect(roots.systemRoot).toBe('C:\\Windows');
  });

  it('throws when neither USERPROFILE nor HOMEDRIVE and HOMEPATH are available', () => {
    expect(() => resolveDiskCleanupRoots({ SystemRoot: 'C:\\Windows' })).toThrow(
      'Windows user profile could not be resolved.'
    );
  });

  it('inspects and clears directory contents through the default runtime', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stephen-disk-'));
    const cacheDir = join(root, 'cache');
    mkdirSync(join(cacheDir, 'nested'), { recursive: true });
    writeFileSync(join(cacheDir, 'a.txt'), 'hello', 'utf8');
    writeFileSync(join(cacheDir, 'nested', 'b.txt'), 'world', 'utf8');
    const runtime = createDiskCleanupRuntime();

    const before = await runtime.inspectPath(cacheDir);
    await runtime.clearDirectoryContents(cacheDir);
    const after = await runtime.inspectPath(cacheDir);

    expect(before.exists).toBe(true);
    expect(before.sizeBytes).toBeGreaterThan(0);
    expect(after.exists).toBe(true);
    expect(after.sizeBytes).toBe(0);
  });

  it('treats missing paths as empty targets', async () => {
    const runtime = createDiskCleanupRuntime();

    const result = await runtime.inspectPath(join(tmpdir(), 'missing-stephen-disk-target'));

    expect(result).toEqual({
      exists: false,
      isDirectory: false,
      sizeBytes: 0
    });
  });

  it('measures regular files without treating them as directories', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stephen-disk-file-'));
    const filePath = join(root, 'cache.txt');
    writeFileSync(filePath, 'cache', 'utf8');
    const runtime = createDiskCleanupRuntime();

    const result = await runtime.inspectPath(filePath);

    expect(result.exists).toBe(true);
    expect(result.sizeBytes).toBe(5);
    expect(result.isDirectory).toBe(false);
  });

  it('returns isDirectory: true for directories', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stephen-disk-isdir-'));
    const dirPath = join(root, 'subdir');
    mkdirSync(dirPath, { recursive: true });
    const runtime = createDiskCleanupRuntime();

    const result = await runtime.inspectPath(dirPath);

    expect(result.exists).toBe(true);
    expect(result.isDirectory).toBe(true);
  });

  it('delegates hibernation disabling to powercfg', async () => {
    const executeCommand = vi.fn(async () => undefined);
    const runtime = createDiskCleanupRuntime({
      executeCommand
    });

    await runtime.disableHibernation();

    expect(executeCommand).toHaveBeenCalledWith('powercfg', ['-h', 'off']);
  });

  it('uses execFile when no custom executeCommand dependency is supplied', async () => {
    vi.resetModules();
    const execFileMock = vi.fn((file: string, args: string[], callback: (error: null) => void) => {
      callback(null);
    });
    vi.doMock('node:child_process', () => ({
      execFile: execFileMock
    }));

    try {
      const runtimeModule = await import('../../src/disk/runtime.js');
      const runtime = runtimeModule.createDiskCleanupRuntime();

      await runtime.disableHibernation();

      expect(execFileMock).toHaveBeenCalled();
    } finally {
      vi.doUnmock('node:child_process');
      vi.resetModules();
    }
  });

  it('rethrows non-ENOENT inspection errors', async () => {
    vi.resetModules();
    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
      return {
        ...actual,
        stat: vi.fn(async () => {
          const error = new Error('denied') as NodeJS.ErrnoException;
          error.code = 'EACCES';
          throw error;
        })
      };
    });

    try {
      const runtimeModule = await import('../../src/disk/runtime.js');
      const runtime = runtimeModule.createDiskCleanupRuntime();

      await expect(runtime.inspectPath('C:\\blocked')).rejects.toThrow('denied');
    } finally {
      vi.doUnmock('node:fs/promises');
      vi.resetModules();
    }
  });
});
