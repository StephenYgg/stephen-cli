import { beforeEach, describe, expect, it } from 'vitest';

import { createAkDatabase } from '../../src/ak/database.js';
import { AkRepository } from '../../src/ak/repository.js';
import { createCli } from '../../src/index.js';

const masterKey = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');

interface CliExecution {
  exitCode: number;
  stderr: string;
  stdout: string;
}

describe('stephen ak command', () => {
  let repository: AkRepository;

  beforeEach(() => {
    repository = new AkRepository(createAkDatabase(':memory:'));
  });

  async function execute(args: string[]): Promise<CliExecution> {
    let stdout = '';
    let stderr = '';

    const cli = createCli({
      confirm: async () => true,
      masterKey,
      now: () => '2026-04-16T00:00:00.000Z',
      repository,
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

  it('adds a record and prints JSON by default', async () => {
    const result = await execute([
      'ak',
      'add',
      '-e',
      'bzy-pre',
      '-k',
      'op_sk_abcdef123456',
      '-n',
      'Stephen'
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"ok": true');
    expect(result.stdout).toContain('"userName": "Stephen"');
  });

  it('accepts github as a valid fixed env value', async () => {
    const result = await execute([
      'ak',
      'add',
      '-e',
      'github',
      '-k',
      'ghp_abcdef123456',
      '-n',
      'Stephen'
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"env": "github"');
  });

  it('accepts a custom env value outside the recommended defaults', async () => {
    const result = await execute([
      'ak',
      'add',
      '-e',
      'team-a-prod',
      '-k',
      'custom_abcdef123456',
      '-n',
      'Stephen'
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"env": "team-a-prod"');
  });

  it('shows a table when -t is passed', async () => {
    await execute(['ak', 'add', '-e', 'bzy-pre', '-k', 'op_sk_abcdef123456']);

    const result = await execute([
      'ak',
      'list',
      '-f',
      'key',
      '-q',
      'op_sk_ab',
      '--limit',
      '1',
      '-t'
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('env');
    expect(result.stdout).toContain('bzy-pre');
  });

  it('shows the raw key only when --raw-key is provided', async () => {
    await execute(['ak', 'add', '-e', 'bzy-pre', '-k', 'op_sk_abcdef123456']);

    const result = await execute([
      'ak',
      'get',
      '-e',
      'bzy-pre',
      '-k',
      'op_sk_abcdef123456',
      '--raw-key'
    ]);

    expect(result.stdout).toContain('"key": "op_sk_abcdef123456"');
  });

  it('gets a record in table mode without the raw key flag', async () => {
    await execute(['ak', 'add', '-e', 'bzy-pre', '-k', 'op_sk_abcdef123456']);

    const result = await execute([
      'ak',
      'get',
      '-e',
      'bzy-pre',
      '-k',
      'op_sk_abcdef123456',
      '--format',
      'table'
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('op_s**********3456');
  });

  it('returns a validation error for unsupported query fields', async () => {
    const result = await execute(['ak', 'list', '-q', 'foo', '-f', 'unknown']);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Unsupported query field: unknown.');
  });

  it('deletes a record without prompting when --yes is supplied', async () => {
    const added = await execute(['ak', 'add', '-e', 'bzy-pre', '-k', 'op_sk_abcdef123456']);
    const parsed = JSON.parse(added.stdout) as { data: { id: string }[] };

    const result = await execute(['ak', 'delete', '--id', parsed.data[0]!.id, '--yes']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"ok": true');
  });

  it('deletes a record by id without relying on env fallback', async () => {
    const added = await execute(['ak', 'add', '-e', 'bzy-pre', '-k', 'op_sk_abcdef123456']);
    const parsed = JSON.parse(added.stdout) as { data: { id: string }[] };

    const result = await execute(['ak', 'delete', '--id', parsed.data[0]!.id, '--yes']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"id": "');
  });

  it('returns the actual deleted record data, not a fake object', async () => {
    const added = await execute([
      'ak',
      'add',
      '-e',
      'bzy-pre',
      '-k',
      'op_sk_abcdef123456',
      '-n',
      'Stephen'
    ]);
    const parsed = JSON.parse(added.stdout) as { data: { id: string; userName: string; key: string }[] };

    const result = await execute(['ak', 'delete', '--id', parsed.data[0]!.id, '--yes']);
    const resultParsed = JSON.parse(result.stdout) as { data: { id: string; userName: string; key: string }[] };

    expect(result.exitCode).toBe(0);
    expect(resultParsed.data[0]!.id).toBe(parsed.data[0]!.id);
    expect(resultParsed.data[0]!.userName).toBe('Stephen');
    expect(resultParsed.data[0]!.key).not.toBe('deleted');
  });

  it('updates metadata and can render the result as a table', async () => {
    await execute(['ak', 'add', '-e', 'bzy-pre', '-k', 'op_sk_abcdef123456', '-n', 'Stephen']);

    const result = await execute([
      'ak',
      'update',
      '-e',
      'bzy-pre',
      '-k',
      'op_sk_abcdef123456',
      '-n',
      'Stephen Yang',
      '-t'
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Stephen Yang');
  });

  it('maps env validation issues to exit code 2 and shows the recommended values', async () => {
    const result = await execute(['ak', 'add', '-e', 'wrong env', '-k', 'op_sk_abcdef123456']);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('"code": "INVALID_ARGUMENT"');
    expect(result.stderr).toContain(
      'Recommended values: bzy-pre, bzy-prod, op-pre, op-prod, gitee, github, gitlab'
    );
  });

  it('returns commander exit codes for missing required options', async () => {
    const result = await execute(['ak', 'add']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('required option');
  });

  it('returns an aborted error when delete confirmation is declined', async () => {
    let stdout = '';
    let stderr = '';

    const cli = createCli({
      confirm: async () => false,
      masterKey,
      now: () => '2026-04-16T00:00:00.000Z',
      repository,
      stderr: (value) => {
        stderr += value;
      },
      stdout: (value) => {
        stdout += value;
      }
    });

    await execute(['ak', 'add', '-e', 'bzy-pre', '-k', 'op_sk_abcdef123456']);
    const exitCode = await cli.run(['ak', 'delete', '-e', 'bzy-pre', '-k', 'op_sk_abcdef123456']);

    expect(exitCode).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain('"code": "ABORTED"');
  });

  it('deletes a record after an interactive confirmation succeeds', async () => {
    let prompted = false;

    const cli = createCli({
      confirm: async () => {
        prompted = true;
        return true;
      },
      masterKey,
      now: () => '2026-04-16T00:00:00.000Z',
      repository,
      stderr: () => undefined,
      stdout: () => undefined
    });

    await execute(['ak', 'add', '-e', 'bzy-pre', '-k', 'op_sk_abcdef123456']);
    const exitCode = await cli.run(['ak', 'delete', '-e', 'bzy-pre', '-k', 'op_sk_abcdef123456']);

    expect(exitCode).toBe(0);
    expect(prompted).toBe(true);
  });

  it('returns an unexpected error for unknown output formats', async () => {
    const result = await execute(['ak', 'list', '--format', 'yaml']);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('"code": "INVALID_ARGUMENT"');
  });

  it('maps unexpected thrown errors to exit code 1', async () => {
    let stderr = '';

    const cli = createCli({
      confirm: async () => {
        throw new Error('boom');
      },
      masterKey,
      now: () => '2026-04-16T00:00:00.000Z',
      repository,
      stderr: (value) => {
        stderr += value;
      },
      stdout: () => undefined
    });

    await execute(['ak', 'add', '-e', 'bzy-pre', '-k', 'op_sk_abcdef123456']);
    const exitCode = await cli.run(['ak', 'delete', '-e', 'bzy-pre', '-k', 'op_sk_abcdef123456']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('"code": "UNEXPECTED_ERROR"');
    expect(stderr).toContain('boom');
  });

  it('maps non-Error throws to a generic unexpected error', async () => {
    let stderr = '';

    const cli = createCli({
      confirm: async () => {
        throw 'boom';
      },
      masterKey,
      now: () => '2026-04-16T00:00:00.000Z',
      repository,
      stderr: (value) => {
        stderr += value;
      },
      stdout: () => undefined
    });

    await execute(['ak', 'add', '-e', 'bzy-pre', '-k', 'op_sk_abcdef123456']);
    const exitCode = await cli.run(['ak', 'delete', '-e', 'bzy-pre', '-k', 'op_sk_abcdef123456']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('"code": "UNEXPECTED_ERROR"');
    expect(stderr).toContain('Unexpected error.');
  });

  it('returns explicit exitCode errors without wrapping them as unexpected errors', async () => {
    const cli = createCli({
      confirm: async () => true,
      masterKey,
      now: () => '2026-04-16T00:00:00.000Z',
      repository,
      stderr: () => undefined,
      stdout: () => {
        const error = new Error('stop');
        Object.assign(error, { exitCode: 9 });
        throw error;
      }
    });

    const exitCode = await cli.run(['ak', 'list']);

    expect(exitCode).toBe(9);
  });

  it('returns a storage error when the repository reports a false delete', async () => {
    // Use a valid ciphertext so decryption succeeds before we hit the delete failure.
    // masterKey = '0123456789abcdef0123456789abcdef', plaintext = 'op_sk_test1234567890abcdef'
    const encrypted = 'lxMxQmh2iK7qgsGt.R6wCQaqlyCCFT-LxKnlmgw.nfDVVV6ze6pjqgK7jEv_XHwIM8NxwrIIFLM';
    let stderr = '';

    const cli = createCli({
      confirm: async () => true,
      masterKey,
      now: () => '2026-04-16T00:00:00.000Z',
      repository: {
        deleteById: () => false,
        getByEnvAndId: () => null,
        getById: () => ({
          createdAt: '2026-04-16T00:00:00.000Z',
          email: null,
          env: 'bzy-pre',
          id: 'abc123',
          keyCiphertext: encrypted,
          keySearchPrefix: 'op_sk_test12', // deriveAkSearchPrefix('op_sk_test1234567890abcdef')
          phone: null,
          updatedAt: '2026-04-16T00:00:00.000Z',
          userId: null,
          userName: null
        }),
        insert: () => undefined,
        list: () => [],
        updateMetadata: () => null
      } as unknown as AkRepository,
      stderr: (value) => {
        stderr += value;
      },
      stdout: () => undefined
    });

    const exitCode = await cli.run(['ak', 'delete', '--id', 'abc123', '--yes']);

    expect(exitCode).toBe(6);
    expect(stderr).toContain('"code": "STORAGE_ERROR"');
  });
});
