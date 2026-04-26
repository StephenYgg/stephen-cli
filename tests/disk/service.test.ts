import { describe, expect, it, vi } from 'vitest';

import { DiskCleanupService, type DiskCleanupRuntime } from '../../src/disk/service.js';

function createRuntime(
  sizes: Record<string, number>,
  overrides: Partial<DiskCleanupRuntime> = {}
): DiskCleanupRuntime {
  return {
    clearDirectoryContents: vi.fn(async () => undefined),
    disableHibernation: vi.fn(async () => undefined),
    inspectPath: vi.fn(async (path: string) => ({
      exists: path in sizes,
      sizeBytes: sizes[path] ?? 0
    })),
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
      disableHibernate: false
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
      disableHibernate: true
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
        disableHibernate: true
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
        disableHibernate: true
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
        disableHibernate: false
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
});
