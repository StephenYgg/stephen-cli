import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createCli, defaultConfirm } from '../src/index.js';
import { createAkDatabase } from '../src/ak/database.js';
import { AkRepository } from '../src/ak/repository.js';

describe('defaultConfirm', () => {
  it('returns true only for a lowercase y response and always closes the interface', async () => {
    const close = vi.fn();
    const question = vi.fn().mockResolvedValue('y');

    const confirmed = await defaultConfirm('Delete?', () => ({
      close,
      question
    }));

    expect(confirmed).toBe(true);
    expect(question).toHaveBeenCalledWith('Delete? [y/N] ');
    expect(close).toHaveBeenCalled();
  });

  it('returns false for any non-y response', async () => {
    const confirmed = await defaultConfirm('Delete?', () => ({
      close: vi.fn(),
      question: vi.fn().mockResolvedValue('no')
    }));

    expect(confirmed).toBe(false);
  });

  it('uses the default readline factory when no override is passed', async () => {
    const close = vi.fn();
    const question = vi.fn().mockResolvedValue('y');
    vi.resetModules();
    vi.doMock('node:readline/promises', () => ({
      createInterface: () => ({
        close,
        question
      })
    }));

    try {
      const indexModule = await import('../src/index.js');
      const confirmed = await indexModule.defaultConfirm('Delete?');

      expect(confirmed).toBe(true);
      expect(question).toHaveBeenCalledWith('Delete? [y/N] ');
      expect(close).toHaveBeenCalled();
    } finally {
      vi.doUnmock('node:readline/promises');
      vi.resetModules();
    }
  });
});

describe('createCli', () => {
  it('uses the default stdout and stderr writers when overrides are omitted', async () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    try {
      const cli = createCli({
        repository: new AkRepository(createAkDatabase(':memory:'))
      });

      const exitCode = await cli.run(['--help']);

      expect(exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it('uses the default clock and stderr writer for real command execution', async () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    try {
      const cli = createCli({
        repository: new AkRepository(createAkDatabase(':memory:'))
      });

      const addExitCode = await cli.run([
        'ak',
        'add',
        '-e',
        'bzy-pre',
        '-k',
        'op_sk_abcdef123456'
      ]);
      const errorExitCode = await cli.run(['ak', 'list', '-f', 'unknown', '-q', 'boom']);

      expect(addExitCode).toBe(0);
      expect(errorExitCode).toBe(2);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('"createdAt":'));
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('"code": "INVALID_ARGUMENT"'));
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it('creates the default repository under the resolved env-paths data directory', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'stephen-cli-'));
    vi.resetModules();
    vi.doMock('env-paths', () => ({
      default: () => ({
        cache: tempRoot,
        config: tempRoot,
        data: tempRoot,
        log: tempRoot,
        temp: tempRoot
      })
    }));

    try {
      const indexModule = await import('../src/index.js');
      let stdout = '';
      const cli = indexModule.createCli({
        stderr: () => undefined,
        stdout: (value) => {
          stdout += value;
        }
      });

      const exitCode = await cli.run(['ak', 'add', '-e', 'bzy-pre', '-k', 'op_sk_abcdef123456']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('"ok": true');
    } finally {
      vi.doUnmock('env-paths');
      vi.resetModules();
    }
  });
});
