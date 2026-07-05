import { describe, expect, it, vi } from 'vitest';

import { DiskCleanupService, DiskCleanupServiceError, type DiskCleanupRuntime } from '../../src/disk/service.js';

function createRuntime(
  sizes: Record<string, number>,
  overrides: Partial<DiskCleanupRuntime> = {}
): DiskCleanupRuntime {
  return {
    clearDirectoryContents: vi.fn(async () => undefined),
    disableHibernation: vi.fn(async () => undefined),
    listTopEntriesBySize: vi.fn(async () => []),
    inspectPath: vi.fn(async (path: string) => ({
      exists: path in sizes,
      isDirectory: true,
      sizeBytes: sizes[path] ?? 0
    })),
    runCommand: vi.fn(async () => undefined),
    ...overrides
  };
}

describe('DiskCleanupService', () => {
  it('builds a preview report with conservative cleanup targets', async () => {
    const runtime = createRuntime({
      'C:\\Users\\Stephen\\AppData\\Local\\npm-cache': 8 * 1024 * 1024 * 1024,
      'C:\\Users\\Stephen\\AppData\\Local\\NuGet': 2 * 1024 * 1024 * 1024,
      'C:\\Windows\\SoftwareDistribution\\Download': 300 * 1024 * 1024
    });
    const service = new DiskCleanupService({
      runtime,
      systemRoot: 'C:\\Windows',
      userProfileRoot: 'C:\\Users\\Stephen'
    });

    const result = await service.cleanup({
      apply: false,
      confirm: false,
      disableHibernate: false,
      level: 'safe'
    });

    expect(result.mode).toBe('preview');
    expect(result.hibernation.status).toBe('skipped');
    expect(result.targets).toHaveLength(6);
    expect(result.targets[0]).toMatchObject({
      action: 'clear-directory-contents',
      label: 'npm cache',
      path: 'C:\\Users\\Stephen\\AppData\\Local\\npm-cache',
      status: 'planned'
    });
    expect(result.targets.at(-1)).toMatchObject({
      label: 'Windows Update download cache',
      requiresAdministrator: true
    });
    expect(result.estimatedReclaimBytes).toBeGreaterThan(0);
  });

  it('applies cleanup to existing targets and disables hibernation when requested', async () => {
    const cleared: string[] = [];
    const runtime = createRuntime(
      {
        'C:\\Users\\Stephen\\AppData\\Local\\npm-cache': 10,
        'C:\\Users\\Stephen\\.cache': 20
      },
      {
        clearDirectoryContents: vi.fn(async (path: string) => {
          cleared.push(path);
        })
      }
    );
    const service = new DiskCleanupService({
      runtime,
      systemRoot: 'C:\\Windows',
      userProfileRoot: 'C:\\Users\\Stephen'
    });

    const result = await service.cleanup({
      apply: true,
      confirm: false,
      disableHibernate: true,
      level: 'safe'
    });

    expect(result.mode).toBe('apply');
    expect(result.hibernation.status).toBe('disabled');
    expect(runtime.disableHibernation).toHaveBeenCalledTimes(1);
    expect(cleared).toEqual([
      'C:\\Users\\Stephen\\AppData\\Local\\npm-cache',
      'C:\\Users\\Stephen\\.cache'
    ]);
    expect(result.targets.filter((target) => target.status === 'cleaned')).toHaveLength(2);
    expect(result.targets.filter((target) => target.status === 'missing')).toHaveLength(4);
  });

  it('surfaces hibernation failures as command-friendly errors', async () => {
    const runtime = createRuntime(
      {},
      {
        disableHibernation: vi.fn(async () => {
          throw new Error('Access denied');
        })
      }
    );
    const service = new DiskCleanupService({
      runtime,
      systemRoot: 'C:\\Windows',
      userProfileRoot: 'C:\\Users\\Stephen'
    });

    await expect(
      service.cleanup({
        apply: true,
        confirm: false,
        disableHibernate: true,
        level: 'safe'
      })
    ).rejects.toMatchObject({
      code: 'DISK_CLEANUP_ERROR',
      exitCode: 2,
      message: 'Disk cleanup encountered failures.',
      details: {
        report: {
          hibernation: {
            error: 'Access denied',
            status: 'failed'
          }
        }
      }
    });
  });

  it('uses a generic message when hibernation disabling throws a non-Error value', async () => {
    const runtime = createRuntime(
      {},
      {
        disableHibernation: vi.fn(async () => {
          throw 'boom';
        })
      }
    );
    const service = new DiskCleanupService({
      runtime,
      systemRoot: 'C:\\Windows',
      userProfileRoot: 'C:\\Users\\Stephen'
    });

    await expect(
      service.cleanup({
        apply: true,
        confirm: false,
        disableHibernate: true,
        level: 'safe'
      })
    ).rejects.toMatchObject({
      code: 'DISK_CLEANUP_ERROR',
      message: 'Disk cleanup encountered failures.',
      details: {
        report: {
          hibernation: {
            error: 'Unknown error',
            status: 'failed'
          }
        }
      }
    });
  });

  it('surfaces cleanup target failures as command-friendly errors with a partial report', async () => {
    const runtime = createRuntime(
      {
        'C:\\Users\\Stephen\\AppData\\Local\\npm-cache': 10,
        'C:\\Users\\Stephen\\.cache': 20
      },
      {
        clearDirectoryContents: vi.fn(async (path: string) => {
          if (path.endsWith('npm-cache')) {
            throw new Error('Access denied');
          }
        })
      }
    );
    const service = new DiskCleanupService({
      runtime,
      systemRoot: 'C:\\Windows',
      userProfileRoot: 'C:\\Users\\Stephen'
    });

    await expect(
      service.cleanup({
        apply: true,
        confirm: false,
        disableHibernate: false,
        level: 'safe'
      })
    ).rejects.toMatchObject({
      code: 'DISK_CLEANUP_ERROR',
      exitCode: 2,
      message: 'Disk cleanup encountered failures.',
      details: {
        report: {
          mode: 'apply',
          hibernation: {
            status: 'skipped'
          },
          targets: expect.arrayContaining([
            expect.objectContaining({
              label: 'npm cache',
              status: 'failed',
              error: 'Access denied'
            }),
            expect.objectContaining({
              label: 'Generic cache',
              status: 'cleaned'
            })
          ])
        }
      }
    });
  });

  it('can construct a disk cleanup error without details', () => {
    const error = new DiskCleanupServiceError('DISK_CLEANUP_ERROR', 'boom');

    expect(error.code).toBe('DISK_CLEANUP_ERROR');
    expect(error.details).toBeUndefined();
  });

  it('builds a dev preview with developer cache targets', async () => {
    const runtime = createRuntime({
      'C:\\Users\\Stephen\\.gradle\\caches': 10,
      'C:\\Users\\Stephen\\AppData\\Local\\pip\\Cache': 20
    });
    const service = new DiskCleanupService({
      runtime,
      systemRoot: 'C:\\Windows',
      userProfileRoot: 'C:\\Users\\Stephen'
    });

    const result = await service.cleanup({
      apply: false,
      confirm: false,
      disableHibernate: false,
      level: 'dev'
    });

    expect(result.level).toBe('dev');
    expect(result.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Gradle cache' }),
        expect.objectContaining({ label: 'pip cache' })
      ])
    );
    expect(result.targets.length).toBeGreaterThan(6);
  });

  it('requires confirmation before applying system cleanup and does not clear anything first', async () => {
    const runtime = createRuntime({
      'C:\\Windows\\Temp': 10
    });
    const service = new DiskCleanupService({
      runtime,
      systemRoot: 'C:\\Windows',
      userProfileRoot: 'C:\\Users\\Stephen'
    });

    await expect(
      service.cleanup({
        apply: true,
        confirm: false,
        disableHibernate: false,
        level: 'system'
      })
    ).rejects.toMatchObject({
      code: 'DISK_CLEANUP_CONFIRMATION_REQUIRED',
      exitCode: 2,
      message: 'Disk cleanup level requires --confirm before apply.'
    });
    expect(runtime.clearDirectoryContents).not.toHaveBeenCalled();
    expect(runtime.runCommand).not.toHaveBeenCalled();
  });

  it('requires confirmation before applying deep cleanup', async () => {
    const runtime = createRuntime({});
    const service = new DiskCleanupService({
      runtime,
      systemRoot: 'C:\\Windows',
      userProfileRoot: 'C:\\Users\\Stephen'
    });

    await expect(
      service.cleanup({
        apply: true,
        confirm: false,
        disableHibernate: false,
        level: 'deep'
      })
    ).rejects.toMatchObject({
      code: 'DISK_CLEANUP_CONFIRMATION_REQUIRED'
    });
  });

  it('applies confirmed system cleanup and runs DISM component cleanup once', async () => {
    const runtime = createRuntime({
      'C:\\Windows\\Temp': 10,
      'C:\\Windows\\SoftwareDistribution\\Download': 20
    });
    const service = new DiskCleanupService({
      runtime,
      systemRoot: 'C:\\Windows',
      userProfileRoot: 'C:\\Users\\Stephen'
    });

    const result = await service.cleanup({
      apply: true,
      confirm: true,
      disableHibernate: false,
      level: 'system'
    });

    expect(result.level).toBe('system');
    expect(runtime.clearDirectoryContents).toHaveBeenCalledWith('C:\\Windows\\Temp');
    expect(runtime.runCommand).toHaveBeenCalledWith('dism.exe', [
      '/Online',
      '/Cleanup-Image',
      '/StartComponentCleanup'
    ]);
    expect(result.targets.filter((target) => target.label === 'Windows Update download cache')).toHaveLength(1);
  });

  it('reports Downloads top entries during deep preview without clearing Downloads', async () => {
    const downloadsPath = 'C:\\Users\\Stephen\\Downloads';
    const runtime = createRuntime(
      {},
      {
        listTopEntriesBySize: vi.fn(async () => [
          {
            kind: 'file' as const,
            name: 'large.iso',
            path: `${downloadsPath}\\large.iso`,
            sizeBytes: 100,
            sizeGB: 0
          }
        ])
      }
    );
    const service = new DiskCleanupService({
      runtime,
      systemRoot: 'C:\\Windows',
      userProfileRoot: 'C:\\Users\\Stephen'
    });

    const result = await service.cleanup({
      apply: false,
      confirm: false,
      disableHibernate: false,
      level: 'deep'
    });

    expect(result.downloads).toEqual({
      path: downloadsPath,
      topEntries: [
        {
          kind: 'file',
          name: 'large.iso',
          path: `${downloadsPath}\\large.iso`,
          sizeBytes: 100,
          sizeGB: 0
        }
      ]
    });
    expect(runtime.listTopEntriesBySize).toHaveBeenCalledWith(downloadsPath, 100);
    expect(runtime.clearDirectoryContents).not.toHaveBeenCalledWith(downloadsPath);
  });
});
