import { Command } from 'commander';
import { ZodError, z } from 'zod';
import { table } from 'table';

import { renderAkErrorAsJson, renderAkRecordsAsJson, renderAkRecordsAsTable } from './output.js';
import { AkService, AkServiceError } from './service.js';
import type { AkRepository } from './repository.js';
import { normalizeAkEnv } from './schema.js';
import { AK_RECOMMENDED_ENVS } from './types.js';
import {
  assertSupportedConfigKey,
  getConfigEntry,
  listConfigEntries,
  setConfigValue,
  type ConfigKey,
  type StephenCliPaths
} from './runtime.js';
import { registerDiskCommands } from '../disk/command.js';
import { DiskCleanupService } from '../disk/service.js';
import type { DiskCleanupRuntime, DiskCleanupRoots } from '../disk/runtime.js';

export interface AkCliDependencies {
  confirm: (message: string) => Promise<boolean>;
  diskRuntime: DiskCleanupRuntime;
  env: NodeJS.ProcessEnv;
  getRepository: () => AkRepository;
  masterKey: Buffer;
  now: () => string;
  paths: StephenCliPaths;
  resolveDiskCleanupRoots: () => DiskCleanupRoots;
  stderr: (value: string) => void;
  stdout: (value: string) => void;
}

export interface AkCliRunner {
  run: (args: string[]) => Promise<number>;
}

const envSchema = z.string().transform((value, context) => {
  try {
    return normalizeAkEnv(value);
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: (error as Error).message
    });
    return z.NEVER;
  }
});
const envDescription = `environment (recommended: ${AK_RECOMMENDED_ENVS.join(', ')}; custom values allowed)`;

const addOptionsSchema = z.object({
  email: z.string().optional(),
  env: envSchema,
  key: z.string(),
  phone: z.string().optional(),
  rawKey: z.boolean().optional(),
  userId: z.string().optional(),
  userName: z.string().optional()
});

const listOptionsSchema = z.object({
  env: envSchema.optional(),
  field: z.string().optional(),
  format: z.enum(['json', 'table']).default('json'),
  limit: z.number().int().positive().max(100).default(50),
  query: z.string().optional(),
  rawKey: z.boolean().optional()
});

const getOptionsSchema = z.object({
  env: envSchema.optional(),
  format: z.enum(['json', 'table']).default('json'),
  id: z.string().optional(),
  key: z.string().optional(),
  rawKey: z.boolean().optional()
});

const updateOptionsSchema = z.object({
  email: z.string().optional(),
  env: envSchema.optional(),
  format: z.enum(['json', 'table']).default('json'),
  id: z.string().optional(),
  key: z.string().optional(),
  phone: z.string().optional(),
  rawKey: z.boolean().optional(),
  userId: z.string().optional(),
  userName: z.string().optional()
});

const deleteOptionsSchema = z.object({
  env: envSchema.optional(),
  format: z.enum(['json', 'table']).default('json'),
  id: z.string().optional(),
  key: z.string().optional(),
  yes: z.boolean().default(false)
});

const configFormatSchema = z.object({
  format: z.enum(['json', 'table']).default('json')
});

const configGetOptionsSchema = z.object({
  format: z.enum(['json', 'table']).default('json'),
  key: z.string()
});

const configSetOptionsSchema = z.object({
  format: z.enum(['json', 'table']).default('json'),
  key: z.string(),
  value: z.string()
});

export function createAkCli(dependencies: AkCliDependencies): AkCliRunner {
  const program = new Command();
  const createService = () =>
    new AkService({
      masterKey: dependencies.masterKey,
      now: dependencies.now,
      repository: dependencies.getRepository()
    });
  const createDiskCleanupService = () => {
    const roots = dependencies.resolveDiskCleanupRoots();

    return new DiskCleanupService({
      runtime: dependencies.diskRuntime,
      systemRoot: roots.systemRoot,
      userProfileRoot: roots.userProfileRoot
    });
  };

  program
    .name('stephen')
    .description('A personal TypeScript CLI for agent-friendly workflows.')
    .showHelpAfterError()
    .exitOverride();
  program.configureOutput({
    outputError: (value) => dependencies.stderr(value),
    writeErr: (value) => dependencies.stderr(value),
    writeOut: (value) => dependencies.stdout(value)
  });

  const ak = program.command('ak').description('Manage API key records.');
  const config = program.command('config').description('Manage local CLI configuration.');
  registerDiskCommands(program, {
    createDiskCleanupService,
    stdout: dependencies.stdout
  });

  ak.command('add')
    .requiredOption('-e, --env <env>', envDescription)
    .requiredOption('-k, --key <key>', 'api key')
    .option('-u, --user-id <userId>', 'user id')
    .option('-n, --user-name <userName>', 'user name')
    .option('-m, --email <email>', 'email')
    .option('-p, --phone <phone>', 'phone')
    .option('--raw-key', 'show the raw key in the output')
    .action((options) => {
      const parsed = addOptionsSchema.parse(options);
      writeRecords([createService().add(parsed)], 'json', parsed.rawKey ?? false, 50, dependencies);
    });

  ak.command('get')
    .option('--id <id>', 'record id')
    .option('-e, --env <env>', envDescription)
    .option('-k, --key <key>', 'api key')
    .option('--raw-key', 'show the raw key in the output')
    .option('--format <format>', 'output format', 'json')
    .option('-t, --table', 'render as a table')
    .action((options) => {
      const parsed = getOptionsSchema.parse(applyTableShortcut(options));
      writeRecords(
        [createService().get(parsed)],
        parsed.format,
        parsed.rawKey ?? false,
        1,
        dependencies
      );
    });

  ak.command('list')
    .option('-e, --env <env>', envDescription)
    .option('-q, --query <query>', 'fuzzy query')
    .option('-f, --field <field>', 'query fields')
    .option('--limit <limit>', 'result limit', parseLimit, 50)
    .option('--raw-key', 'show the raw key in the output')
    .option('--format <format>', 'output format', 'json')
    .option('-t, --table', 'render as a table')
    .action((options) => {
      const parsed = listOptionsSchema.parse(applyTableShortcut(options));
      writeRecords(
        createService().list(parsed),
        parsed.format,
        parsed.rawKey ?? false,
        parsed.limit,
        dependencies
      );
    });

  ak.command('update')
    .option('--id <id>', 'record id')
    .option('-e, --env <env>', envDescription)
    .option('-k, --key <key>', 'api key')
    .option('-u, --user-id <userId>', 'user id')
    .option('-n, --user-name <userName>', 'user name')
    .option('-m, --email <email>', 'email')
    .option('-p, --phone <phone>', 'phone')
    .option('--raw-key', 'show the raw key in the output')
    .option('--format <format>', 'output format', 'json')
    .option('-t, --table', 'render as a table')
    .action((options) => {
      const parsed = updateOptionsSchema.parse(applyTableShortcut(options));
      writeRecords(
        [createService().update(parsed)],
        parsed.format,
        parsed.rawKey ?? false,
        1,
        dependencies
      );
    });

  ak.command('delete')
    .option('--id <id>', 'record id')
    .option('-e, --env <env>', envDescription)
    .option('-k, --key <key>', 'api key')
    .option('--yes', 'skip confirmation')
    .option('--format <format>', 'output format', 'json')
    .option('-t, --table', 'render as a table')
    .action(async (options) => {
      const parsed = deleteOptionsSchema.parse(applyTableShortcut(options));

      if (!parsed.yes) {
        const confirmed = await dependencies.confirm('Delete the API key record?');
        if (!confirmed) {
          throw new AkServiceError('ABORTED', 'Delete operation cancelled.', 2);
        }
      }

      const deleted = createService().delete(parsed);
      dependencies.stdout(
        `${renderAkRecordsAsJson(
          [
            {
              createdAt: '',
              email: null,
              env: parsed.env ?? 'bzy-pre',
              id: parsed.id ?? '',
              key: deleted ? 'deleted' : 'not-deleted',
              phone: null,
              updatedAt: '',
              userId: null,
              userName: null
            }
          ],
          1
        )}\n`
      );
    });

  config.command('list')
    .option('--format <format>', 'output format', 'json')
    .option('-t, --table', 'render as a table')
    .action((options) => {
      const parsed = configFormatSchema.parse(applyTableShortcut(options));
      const entries = listConfigEntries({
        configDir: dependencies.paths.config,
        dataDir: dependencies.paths.data,
        env: dependencies.env
      });

      writeConfigEntries(entries, parsed.format, dependencies);
    });

  config.command('get')
    .argument('<key>', 'config key')
    .option('--format <format>', 'output format', 'json')
    .option('-t, --table', 'render as a table')
    .action((key, options) => {
      const parsed = configGetOptionsSchema.parse({
        ...applyTableShortcut(options),
        key
      });
      assertSupportedConfigKey(parsed.key);
      const entry = getConfigEntry(parsed.key, {
        configDir: dependencies.paths.config,
        dataDir: dependencies.paths.data,
        env: dependencies.env
      });

      writeConfigEntries([entry], parsed.format, dependencies);
    });

  config.command('set')
    .argument('<key>', 'config key')
    .argument('<value>', 'config value')
    .option('--format <format>', 'output format', 'json')
    .option('-t, --table', 'render as a table')
    .action((key, value, options) => {
      const parsed = configSetOptionsSchema.parse({
        ...applyTableShortcut(options),
        key,
        value
      });
      assertSupportedConfigKey(parsed.key);
      setConfigValue(parsed.key, parsed.value, {
        configDir: dependencies.paths.config
      });
      const entry = getConfigEntry(parsed.key, {
        configDir: dependencies.paths.config,
        dataDir: dependencies.paths.data,
        env: dependencies.env
      });

      writeConfigEntries([entry], parsed.format, dependencies);
    });

  return {
    run: async (args: string[]) => {
      try {
        await program.parseAsync(['node', 'stephen', ...args], {
          from: 'node'
        });
        return 0;
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'commander.helpDisplayed') {
          return 0;
        }

        if (isCliError(error)) {
          dependencies.stderr(
            `${renderAkErrorAsJson(error.code, error.message, 'details' in error ? error.details : undefined)}\n`
          );
          return error.exitCode;
        }

        if (error instanceof ZodError) {
          dependencies.stderr(
            `${renderAkErrorAsJson('INVALID_ARGUMENT', error.issues[0]!.message)}\n`
          );
          return 2;
        }

        if (error instanceof Error && 'exitCode' in error && typeof error.exitCode === 'number') {
          return error.exitCode;
        }

        const message = error instanceof Error ? error.message : 'Unexpected error.';
        dependencies.stderr(`${renderAkErrorAsJson('UNEXPECTED_ERROR', message)}\n`);
        return 1;
      }
    }
  };
}

function isCliError(
  error: unknown
): error is Pick<AkServiceError, 'code' | 'exitCode' | 'message'> & { details?: unknown } {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    'exitCode' in error &&
    typeof error.exitCode === 'number'
  );
}

function parseLimit(value: string): number {
  return Number.parseInt(value, 10);
}

export function applyTableShortcut<T extends { format?: string; table?: boolean }>(options: T): T & {
  format: 'json' | 'table';
} {
  if (options.table) {
    return {
      ...options,
      format: 'table'
    };
  }

  if (options.format) {
    return {
      ...options,
      format: options.format as 'json' | 'table'
    };
  }

  throw new Error('Output format is required for this command.');
}

function writeRecords(
  records: Parameters<typeof renderAkRecordsAsJson>[0],
  format: 'json' | 'table',
  _rawKey: boolean,
  limit: number,
  dependencies: Pick<AkCliDependencies, 'stdout'>
): void {
  if (format === 'table') {
    dependencies.stdout(`${renderAkRecordsAsTable(records)}\n`);
    return;
  }

  dependencies.stdout(`${renderAkRecordsAsJson(records, limit)}\n`);
}

function writeConfigEntries(
  entries: ReturnType<typeof listConfigEntries>,
  format: 'json' | 'table',
  dependencies: Pick<AkCliDependencies, 'stdout'>
): void {
  if (format === 'table') {
    dependencies.stdout(`${renderConfigEntriesAsTable(entries)}\n`);
    return;
  }

  dependencies.stdout(`${renderConfigEntriesAsJson(entries)}\n`);
}

function renderConfigEntriesAsJson(entries: ReturnType<typeof listConfigEntries>): string {
  return JSON.stringify(
    {
      ok: true,
      data: entries,
      meta: {
        count: entries.length
      }
    },
    null,
    2
  );
}

function renderConfigEntriesAsTable(entries: ReturnType<typeof listConfigEntries>): string {
  return table([
    ['key', 'value', 'source', 'fileValue', 'envValue', 'defaultValue'],
    ...entries.map((entry) => [
      entry.key,
      entry.value,
      entry.source,
      entry.fileValue ?? '',
      entry.envValue ?? '',
      entry.defaultValue
    ])
  ]);
}
