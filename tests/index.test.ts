import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { createCli, defaultConfirm } from '../src/index.js';
import { createAkDatabase } from '../src/ak/database.js';
import { AkRepository } from '../src/ak/repository.js';
import { AK_DB_PATH_ENV_VAR, LEGACY_AK_DB_PATH_ENV_VAR } from '../src/ak/runtime.js';

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
    const tempRoot = mkdtempSync(join(tmpdir(), 'stephen-'));
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

  it('uses the explicit ak db path environment variable when no file config is present', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'stephen-'));
    const configuredDbPath = resolve(tempRoot, 'idrive', 'ak.db');
    let stdout = '';

    const cli = createCli({
      env: {
        [AK_DB_PATH_ENV_VAR]: configuredDbPath
      },
      paths: {
        cache: tempRoot,
        config: tempRoot,
        data: resolve(tempRoot, 'default-data'),
        log: tempRoot,
        temp: tempRoot
      },
      stderr: () => undefined,
      stdout: (value) => {
        stdout += value;
      }
    });

    const exitCode = await cli.run(['ak', 'add', '-e', 'bzy-pre', '-k', 'op_sk_abcdef123456']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('"ok": true');
    expect(existsSync(configuredDbPath)).toBe(true);
  });

  it('returns a config error when the local config file contains invalid json', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'stephen-'));
    let stderr = '';
    writeFileSync(join(tempRoot, 'config.json'), '{not-json}', 'utf8');

    const cli = createCli({
      env: {},
      paths: {
        cache: tempRoot,
        config: tempRoot,
        data: resolve(tempRoot, 'data'),
        log: tempRoot,
        temp: tempRoot
      },
      stderr: (value) => {
        stderr += value;
      },
      stdout: () => undefined
    });

    const exitCode = await cli.run(['ak', 'list']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('"code": "CONFIG_ERROR"');
    expect(stderr).toContain('config.json');
    expect(stderr).toContain(AK_DB_PATH_ENV_VAR);
  });

  it('returns a storage error when the resolved ak db path cannot be opened', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'stephen-'));
    let stderr = '';

    const cli = createCli({
      env: {
        [AK_DB_PATH_ENV_VAR]: tempRoot
      },
      paths: {
        cache: tempRoot,
        config: tempRoot,
        data: resolve(tempRoot, 'data'),
        log: tempRoot,
        temp: tempRoot
      },
      stderr: (value) => {
        stderr += value;
      },
      stdout: () => undefined
    });

    const exitCode = await cli.run(['ak', 'list']);

    expect(exitCode).toBe(6);
    expect(stderr).toContain('"code": "STORAGE_ERROR"');
    expect(stderr).toContain('Failed to open the ak database at');
    expect(stderr).toContain('unable to open database file');
  });

  it('lists config values with effective source metadata and prefers file config over env', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'stephen-'));
    let stdout = '';
    writeFileSync(
      join(tempRoot, 'config.json'),
      JSON.stringify(
        {
          ak: {
            dbPath: 'D:/iDrive/from-config/ak.db'
          }
        },
        null,
        2
      ),
      'utf8'
    );

    const cli = createCli({
      env: {
        [AK_DB_PATH_ENV_VAR]: 'E:/iDrive/from-env/ak.db'
      },
      paths: {
        cache: tempRoot,
        config: tempRoot,
        data: resolve(tempRoot, 'data'),
        log: tempRoot,
        temp: tempRoot
      },
      stderr: () => undefined,
      stdout: (value) => {
        stdout += value;
      }
    });

    const exitCode = await cli.run(['config', 'list']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('"key": "ak.dbPath"');
    expect(stdout).toContain('"source": "config"');
    expect(stdout).toContain('"value": "D:/iDrive/from-config/ak.db"');
    expect(stdout).toContain('"envValue": "E:/iDrive/from-env/ak.db"');
    expect(stdout).toContain('"fileValue": "D:/iDrive/from-config/ak.db"');
  });

  it('uses the legacy environment variable in config output when the new one is absent', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'stephen-'));
    let stdout = '';

    const cli = createCli({
      env: {
        [LEGACY_AK_DB_PATH_ENV_VAR]: 'E:/iDrive/from-legacy-env/ak.db'
      },
      paths: {
        cache: tempRoot,
        config: tempRoot,
        data: resolve(tempRoot, 'data'),
        log: tempRoot,
        temp: tempRoot
      },
      stderr: () => undefined,
      stdout: (value) => {
        stdout += value;
      }
    });

    const exitCode = await cli.run(['config', 'get', 'ak.dbPath']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('"source": "env"');
    expect(stdout).toContain('"envValue": "E:/iDrive/from-legacy-env/ak.db"');
  });

  it('renders config values as a table when -t is passed', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'stephen-'));
    let stdout = '';

    const cli = createCli({
      env: {},
      paths: {
        cache: tempRoot,
        config: tempRoot,
        data: resolve(tempRoot, 'data'),
        log: tempRoot,
        temp: tempRoot
      },
      stderr: () => undefined,
      stdout: (value) => {
        stdout += value;
      }
    });

    const exitCode = await cli.run(['config', 'list', '-t']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('key');
    expect(stdout).toContain('ak.dbPath');
    expect(stdout).toContain('default');
  });

  it('writes config values to the local config file with config set', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'stephen-'));
    let stdout = '';

    const cli = createCli({
      env: {},
      paths: {
        cache: tempRoot,
        config: tempRoot,
        data: resolve(tempRoot, 'data'),
        log: tempRoot,
        temp: tempRoot
      },
      stderr: () => undefined,
      stdout: (value) => {
        stdout += value;
      }
    });

    const exitCode = await cli.run([
      'config',
      'set',
      'ak.dbPath',
      'D:/iDrive/new-machine/ak.db'
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('"source": "config"');
    expect(stdout).toContain('"value": "D:/iDrive/new-machine/ak.db"');
    expect(JSON.parse(readFileSync(join(tempRoot, 'config.json'), 'utf8'))).toEqual({
      ak: {
        dbPath: 'D:/iDrive/new-machine/ak.db'
      }
    });
  });

  it('returns a config error for unsupported config keys', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'stephen-'));
    let stderr = '';

    const cli = createCli({
      env: {},
      paths: {
        cache: tempRoot,
        config: tempRoot,
        data: resolve(tempRoot, 'data'),
        log: tempRoot,
        temp: tempRoot
      },
      stderr: (value) => {
        stderr += value;
      },
      stdout: () => undefined
    });

    const exitCode = await cli.run(['config', 'get', 'unknown.key']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('"code": "CONFIG_ERROR"');
    expect(stderr).toContain('Unsupported config key');
  });

  it('maps video command failures through the shared CLI error handler', async () => {
    let stderr = '';

    const cli = createCli({
      repository: new AkRepository(createAkDatabase(':memory:')),
      stderr: (value) => {
        stderr += value;
      },
      stdout: () => undefined,
      videoRuntime: {
        execFile: async () => ({
          code: 1,
          stderr: 'ffmpeg not found',
          stdout: ''
        }),
        fetch: async () => ({
          ok: true,
          status: 200,
          text: async () => '',
          arrayBuffer: async () => new ArrayBuffer(0),
          headers: new Headers()
        }),
        launchBrowserSniffer: async () => ({ candidates: [] }),
        writeFile: async () => undefined
      }
    });

    const exitCode = await cli.run(['video', 'compress', 'D:/videos/input.mov']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('"code": "VIDEO_FFMPEG_MISSING"');
  });
});
