import { Command } from 'commander';
import { ZodError, z } from 'zod';

import { renderAkErrorAsJson, renderAkRecordsAsJson, renderAkRecordsAsTable } from './output.js';
import { AkService, AkServiceError } from './service.js';
import type { AkRepository } from './repository.js';
import { AK_ENVS } from './types.js';

export interface AkCliDependencies {
  confirm: (message: string) => Promise<boolean>;
  masterKey: Buffer;
  now: () => string;
  repository: AkRepository;
  stderr: (value: string) => void;
  stdout: (value: string) => void;
}

export interface AkCliRunner {
  run: (args: string[]) => Promise<number>;
}

const envSchema = z.enum(AK_ENVS);

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

export function createAkCli(dependencies: AkCliDependencies): AkCliRunner {
  const service = new AkService({
    masterKey: dependencies.masterKey,
    now: dependencies.now,
    repository: dependencies.repository
  });
  const program = new Command();

  program
    .name('stephen-cli')
    .description('A personal TypeScript CLI for agent-friendly workflows.')
    .showHelpAfterError()
    .exitOverride();
  program.configureOutput({
    outputError: (value) => dependencies.stderr(value),
    writeErr: (value) => dependencies.stderr(value),
    writeOut: (value) => dependencies.stdout(value)
  });

  const ak = program.command('ak').description('Manage API key records.');

  ak.command('add')
    .requiredOption('-e, --env <env>', 'environment')
    .requiredOption('-k, --key <key>', 'api key')
    .option('-u, --user-id <userId>', 'user id')
    .option('-n, --user-name <userName>', 'user name')
    .option('-m, --email <email>', 'email')
    .option('-p, --phone <phone>', 'phone')
    .option('--raw-key', 'show the raw key in the output')
    .action((options) => {
      const parsed = addOptionsSchema.parse(options);
      writeRecords([service.add(parsed)], 'json', parsed.rawKey ?? false, 50, dependencies);
    });

  ak.command('get')
    .option('--id <id>', 'record id')
    .option('-e, --env <env>', 'environment')
    .option('-k, --key <key>', 'api key')
    .option('--raw-key', 'show the raw key in the output')
    .option('--format <format>', 'output format', 'json')
    .option('-t, --table', 'render as a table')
    .action((options) => {
      const parsed = getOptionsSchema.parse(applyTableShortcut(options));
      writeRecords([service.get(parsed)], parsed.format, parsed.rawKey ?? false, 1, dependencies);
    });

  ak.command('list')
    .option('-e, --env <env>', 'environment')
    .option('-q, --query <query>', 'fuzzy query')
    .option('-f, --field <field>', 'query fields')
    .option('--limit <limit>', 'result limit', parseLimit, 50)
    .option('--raw-key', 'show the raw key in the output')
    .option('--format <format>', 'output format', 'json')
    .option('-t, --table', 'render as a table')
    .action((options) => {
      const parsed = listOptionsSchema.parse(applyTableShortcut(options));
      writeRecords(service.list(parsed), parsed.format, parsed.rawKey ?? false, parsed.limit, dependencies);
    });

  ak.command('update')
    .option('--id <id>', 'record id')
    .option('-e, --env <env>', 'environment')
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
      writeRecords([service.update(parsed)], parsed.format, parsed.rawKey ?? false, 1, dependencies);
    });

  ak.command('delete')
    .option('--id <id>', 'record id')
    .option('-e, --env <env>', 'environment')
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

      const deleted = service.delete(parsed);
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

  return {
    run: async (args: string[]) => {
      try {
        await program.parseAsync(['node', 'stephen-cli', ...args], {
          from: 'node'
        });
        return 0;
      } catch (error) {
        if (error instanceof AkServiceError) {
          dependencies.stderr(`${renderAkErrorAsJson(error.code, error.message)}\n`);
          return error.exitCode;
        }

        if (error instanceof ZodError) {
          dependencies.stderr(
            `${renderAkErrorAsJson('INVALID_ARGUMENT', error.issues[0]!.message)}\n`
          );
          return 2;
        }

        if (error instanceof Error && 'code' in error && error.code === 'commander.helpDisplayed') {
          return 0;
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
