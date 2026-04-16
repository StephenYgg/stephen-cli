import { mkdirSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import envPaths from 'env-paths';

import { createAkCli, type AkCliDependencies } from './ak/command.js';
import { createAkDatabase } from './ak/database.js';
import { AkRepository } from './ak/repository.js';

/* v8 ignore next */
const createDefaultReadline = () => createInterface({ input, output });

export function createCli(overrides: Partial<AkCliDependencies> = {}) {
  const paths = envPaths('stephen-cli');
  mkdirSync(paths.data, { recursive: true });
  const masterKey = overrides.masterKey ?? Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
  const repository =
    overrides.repository ?? new AkRepository(createAkDatabase(`${paths.data}/ak.db`));

  return createAkCli({
    confirm: overrides.confirm ?? defaultConfirm,
    masterKey,
    now: overrides.now ?? (() => new Date().toISOString()),
    repository,
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
