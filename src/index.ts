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

/* v8 ignore next */
const createDefaultReadline = () => createInterface({ input, output });

export interface CreateCliOverrides
  extends Partial<Omit<AkCliDependencies, 'getRepository'>> {
  env?: NodeJS.ProcessEnv;
  paths?: StephenCliPaths;
  repository?: AkRepository;
}

export function createCli(overrides: CreateCliOverrides = {}) {
  const paths = overrides.paths ?? (envPaths('stephen') as StephenCliPaths);
  const runtimeEnv = overrides.env ?? process.env;
  const masterKey = overrides.masterKey ?? Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
  let repository = overrides.repository ?? null;

  const getRepository = () => {
    if (repository) {
      return repository;
    }

    const config = loadAkConfig(paths.config);
    const resolvedDatabasePath = resolveAkDatabasePath({
      config,
      defaultDataDir: paths.data,
      env: runtimeEnv
    });

    mkdirSync(dirname(resolvedDatabasePath.path), { recursive: true });

    try {
      repository = new AkRepository(createAkDatabase(resolvedDatabasePath.path));
      return repository;
    } catch (error) {
      throw new AkStorageInitError(resolvedDatabasePath.path, error);
    }
  };

  return createAkCli({
    confirm: overrides.confirm ?? defaultConfirm,
    env: runtimeEnv,
    getRepository,
    masterKey,
    now: overrides.now ?? (() => new Date().toISOString()),
    paths,
    stderr: overrides.stderr ?? ((value) => process.stderr.write(value)),
    stdout: overrides.stdout ?? ((value) => process.stdout.write(value))
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
