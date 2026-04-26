import { describe, expect, it, vi } from 'vitest';

import { createCli } from '../../src/index.js';
import type { DiskCleanupRuntime } from '../../src/disk/service.js';

interface CliExecution {
  exitCode: number;
  stderr: string;
  stdout: string;
}

function createRuntime(): DiskCleanupRuntime {
  return {
    clearDirectoryContents: vi.fn(async () => undefined),
    disableHibernation: vi.fn(async () => undefined),
    inspectPath: vi.fn(async (path: string) => ({
      exists: path.includes('npm-cache') || path.includes('Download'),
      sizeBytes: path.includes('npm-cache') ? 8 * 1024 * 1024 * 1024 : 300 * 1024 * 1024
    }))
  };
}

describe('stephen disk command', () => {
  async function execute(args: string[]): Promise<CliExecution> {
    let stdout = '';
    let stderr = '';

    const cli = createCli({
      diskRuntime: createRuntime(),
      env: {
        SystemRoot: 'C:\\Windows',
        USERPROFILE: 'C:\\Users\\Stephen'
      },
      stderr: (value) => {
        stderr += value;
      },
      stdout: (value) => {
        stdout += value;
      }
    });

    const exitCode = await cli.run(args);

    return {
      exitCode,
      stderr,
      stdout
    };
  }

  it('prints preview JSON by default', async () => {
    const result = await execute(['disk', 'cleanup']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('"ok": true');
    expect(result.stdout).toContain('"mode": "preview"');
    expect(result.stdout).toContain('"label": "npm cache"');
  });

  it('prints a table when -t is passed', async () => {
    const result = await execute(['disk', 'cleanup', '-t']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('label');
    expect(result.stdout).toContain('Windows Update download cache');
  });

  it('passes apply and hibernation flags through to the service', async () => {
    const runtime = createRuntime();
    let stdout = '';

    const cli = createCli({
      diskRuntime: runtime,
      env: {
        SystemRoot: 'C:\\Windows',
        USERPROFILE: 'C:\\Users\\Stephen'
      },
      stderr: () => undefined,
      stdout: (value) => {
        stdout += value;
      }
    });

    const exitCode = await cli.run(['disk', 'cleanup', '--apply', '--disable-hibernate']);

    expect(exitCode).toBe(0);
    expect(runtime.disableHibernation).toHaveBeenCalledTimes(1);
    expect(stdout).toContain('"mode": "apply"');
    expect(stdout).toContain('"status": "disabled"');
  });

  it('renders cleanup failures as stable JSON errors with partial progress details', async () => {
    let stderr = '';

    const runtime: DiskCleanupRuntime = {
      clearDirectoryContents: vi.fn(async (path: string) => {
        if (path.includes('npm-cache')) {
          throw new Error('Access denied');
        }
      }),
      disableHibernation: vi.fn(async () => undefined),
      inspectPath: vi.fn(async (path: string) => ({
        exists: path.includes('npm-cache') || path.includes('.cache'),
        sizeBytes: path.includes('npm-cache') ? 8 * 1024 * 1024 : 4 * 1024 * 1024
      }))
    };

    const cli = createCli({
      diskRuntime: runtime,
      env: {
        SystemRoot: 'C:\\Windows',
        USERPROFILE: 'C:\\Users\\Stephen'
      },
      stderr: (value) => {
        stderr += value;
      },
      stdout: () => undefined
    });

    const exitCode = await cli.run(['disk', 'cleanup', '--apply']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('"ok": false');
    expect(stderr).toContain('"code": "DISK_CLEANUP_ERROR"');
    expect(stderr).toContain('"status": "failed"');
    expect(stderr).toContain('"error": "Access denied"');
    expect(stderr).toContain('"status": "cleaned"');
  });
});
