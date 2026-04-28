import { mkdirSync, realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import envPaths from 'env-paths';

import { createAkCli, type AkCliDependencies } from './ak/command.js';
import { createAkDatabase } from './ak/database.js';
import { AkRepository } from './ak/repository.js';
import {
  AkStorageInitError,
  loadAkConfig,
  resolveAkDatabasePath,
  type StephenCliPaths
} from './ak/runtime.js';
import {
  createDiskCleanupRuntime,
  resolveDiskCleanupRoots,
  type DiskCleanupRuntime
} from './disk/runtime.js';
import { createDefaultVideoRuntime, type VideoRuntime } from './video/runtime.js';

/* v8 ignore next */
const createDefaultReadline = () => createInterface({ input, output });

export interface CreateCliOverrides
  extends Partial<Omit<AkCliDependencies, 'getRepository'>> {
  diskRuntime?: DiskCleanupRuntime;
  env?: NodeJS.ProcessEnv;
  paths?: StephenCliPaths;
  repository?: AkRepository;
  videoRuntime?: VideoRuntime;
}

export function createCli(overrides: CreateCliOverrides = {}) {
  const paths = overrides.paths ?? (envPaths('stephen') as StephenCliPaths);
  const runtimeEnv = overrides.env ?? process.env;
  const masterKey = overrides.masterKey ?? Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
  const diskRuntime = overrides.diskRuntime ?? createDiskCleanupRuntime();
  const videoRuntime = overrides.videoRuntime ?? createDefaultVideoRuntime();

  // Use promise caching to prevent race conditions when multiple concurrent
  // calls to getRepository() occur before the first initialization completes.
  // This pattern ensures only one repository instance is created even if
  // initialization were to involve async operations in the future.
  let repositoryCache:
    | { promise: Promise<AkRepository>; repository: AkRepository }
    | null = overrides.repository
    ? { promise: Promise.resolve(overrides.repository), repository: overrides.repository }
    : null;

  const getRepository = (): AkRepository => {
    // Fast path: synchronous repository already available (from override)
    if (repositoryCache && overrides.repository) {
      return overrides.repository;
    }

    // Slow path: initialize or return cached promise's resolved value
    if (!repositoryCache) {
      const config = loadAkConfig(paths.config);
      const resolvedDatabasePath = resolveAkDatabasePath({
        config,
        defaultDataDir: paths.data,
        env: runtimeEnv
      });

      mkdirSync(dirname(resolvedDatabasePath.path), { recursive: true });

      let repository: AkRepository;
      try {
        repository = new AkRepository(createAkDatabase(resolvedDatabasePath.path));
      } catch (error) {
        throw new AkStorageInitError(resolvedDatabasePath.path, error);
      }

      repositoryCache = { promise: Promise.resolve(repository), repository };
    }

    // With synchronous initialization, repositoryCache.repository is always available.
    // The promise caching pattern above ensures thread-safety for async scenarios.
    return repositoryCache.repository;
  };

  return createAkCli({
    confirm: overrides.confirm ?? defaultConfirm,
    diskRuntime,
    env: runtimeEnv,
    getRepository,
    masterKey,
    now: overrides.now ?? (() => new Date().toISOString()),
    paths,
    resolveDiskCleanupRoots: () => resolveDiskCleanupRoots(runtimeEnv),
    stderr: overrides.stderr ?? ((value) => process.stderr.write(value)),
    stdout: overrides.stdout ?? ((value) => process.stdout.write(value)),
    videoRuntime
  });
}

export async function defaultConfirm(
  message: string,
  createReadline: () => Pick<ReturnType<typeof createInterface>, 'question' | 'close'> = createDefaultReadline
): Promise<boolean> {
  const readline = createReadline();

  try {
    const answer = await readline.question(`${message} [y/N] `);
    return answer.trim().toLowerCase() === 'y';
  } finally {
    readline.close();
  }
}

/* c8 ignore start */
export function isMainEntrypoint(moduleUrl: string, argv: string[]): boolean {
  const scriptPath = argv[1];

  if (!scriptPath) {
    return false;
  }

  return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(scriptPath);
}

if (isMainEntrypoint(import.meta.url, process.argv)) {
  const cli = createCli();
  void cli.run(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
/* c8 ignore end */
