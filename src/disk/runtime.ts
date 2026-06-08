import { readdir, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, win32 } from 'node:path';

import type { DiskDownloadsEntry } from './types.js';

const execFileAsync = promisify(execFile);

export interface DiskCleanupRuntime {
  clearDirectoryContents: (path: string) => Promise<void>;
  disableHibernation: () => Promise<void>;
  inspectPath: (path: string) => Promise<{
    exists: boolean;
    isDirectory: boolean;
    sizeBytes: number;
  }>;
  listTopEntriesBySize: (path: string, limit: number) => Promise<DiskDownloadsEntry[]>;
  runCommand: (file: string, args: string[]) => Promise<void>;
}

export interface CreateDiskCleanupRuntimeDependencies {
  executeCommand?: (file: string, args: string[]) => Promise<void>;
}

export interface DiskCleanupRoots {
  systemRoot: string;
  userProfileRoot: string;
}

export function resolveDiskCleanupRoots(env: NodeJS.ProcessEnv): DiskCleanupRoots {
  const userProfileRoot = env.USERPROFILE ?? resolveHomeDrivePath(env);
  const systemRoot = env.SystemRoot ?? 'C:\\Windows';

  if (!userProfileRoot) {
    throw new Error(
      'Windows user profile could not be resolved. Set USERPROFILE or HOMEDRIVE and HOMEPATH.'
    );
  }

  return {
    systemRoot,
    userProfileRoot
  };
}

export function createDiskCleanupRuntime(
  dependencies: CreateDiskCleanupRuntimeDependencies = {}
): DiskCleanupRuntime {
  const executeCommand =
    dependencies.executeCommand ??
    /* v8 ignore next 3 */
    (async (file: string, args: string[]) => {
      await execFileAsync(file, args);
    });

  return {
    clearDirectoryContents: async (path: string) => {
      const entries = await readdir(path, { withFileTypes: true });
      await Promise.all(
        entries.map((entry) =>
          rm(join(path, entry.name), {
            force: true,
            recursive: true
          })
        )
      );
    },
    disableHibernation: async () => {
      await executeCommand('powercfg', ['-h', 'off']);
    },
    inspectPath: async (path: string) => inspectPath(path),
    listTopEntriesBySize: async (path: string, limit: number) => listTopEntriesBySize(path, limit),
    runCommand: async (file: string, args: string[]) => {
      await executeCommand(file, args);
    }
  };
}

async function inspectPath(path: string): Promise<{ exists: boolean; isDirectory: boolean; sizeBytes: number }> {
  try {
    const stats = await stat(path);

    if (!stats.isDirectory()) {
      return {
        exists: true,
        isDirectory: false,
        sizeBytes: stats.size
      };
    }

    const sizeBytes = await getDirectorySize(path);
    return {
      exists: true,
      isDirectory: true,
      sizeBytes
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        exists: false,
        isDirectory: false,
        sizeBytes: 0
      };
    }

    /* v8 ignore next */
    throw error;
  }
}

async function getDirectorySize(path: string): Promise<number> {
  const entries = await readdir(path, { withFileTypes: true });
  let total = 0;

  for (const entry of entries) {
    const entryPath = join(path, entry.name);

    if (entry.isDirectory()) {
      total += await getDirectorySize(entryPath);
      continue;
    }

    /* v8 ignore start */
    if (entry.isFile()) {
      total += (await stat(entryPath)).size;
    }
    /* v8 ignore stop */
  }

  return total;
}

async function listTopEntriesBySize(path: string, limit: number): Promise<DiskDownloadsEntry[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    const measured = await Promise.all(
      entries.map(async (entry): Promise<DiskDownloadsEntry | null> => {
        const entryPath = join(path, entry.name);

        if (entry.isDirectory()) {
          return {
            kind: 'directory',
            name: entry.name,
            path: entryPath,
            sizeBytes: await getDirectorySize(entryPath),
            sizeGB: 0
          };
        }

        if (entry.isFile()) {
          const stats = await stat(entryPath);
          return {
            kind: 'file',
            name: entry.name,
            path: entryPath,
            sizeBytes: stats.size,
            sizeGB: 0
          };
        }

        return null;
      })
    );

    return measured
      .filter((entry): entry is DiskDownloadsEntry => entry !== null)
      .map((entry) => ({
        ...entry,
        sizeGB: bytesToGb(entry.sizeBytes)
      }))
      .sort((left, right) => right.sizeBytes - left.sizeBytes)
      .slice(0, limit);
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }

    throw error;
  }
}

function bytesToGb(value: number): number {
  return Number((value / (1024 ** 3)).toFixed(2));
}

function resolveHomeDrivePath(env: NodeJS.ProcessEnv): string | null {
  if (!env.HOMEDRIVE || !env.HOMEPATH) {
    return null;
  }

  return win32.join(env.HOMEDRIVE, env.HOMEPATH);
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
