import { readdir, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, win32 } from 'node:path';

const execFileAsync = promisify(execFile);

export interface DiskCleanupRuntime {
  clearDirectoryContents: (path: string) => Promise<void>;
  disableHibernation: () => Promise<void>;
  inspectPath: (path: string) => Promise<{
    exists: boolean;
    isDirectory: boolean;
    sizeBytes: number;
  }>;
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
    inspectPath: async (path: string) => inspectPath(path)
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

function resolveHomeDrivePath(env: NodeJS.ProcessEnv): string | null {
  if (!env.HOMEDRIVE || !env.HOMEPATH) {
    return null;
  }

  return win32.join(env.HOMEDRIVE, env.HOMEPATH);
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
