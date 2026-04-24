import { describe, expect, it } from 'vitest';

import { createAkDatabase } from '../../src/ak/database.js';
import { AkRepository } from '../../src/ak/repository.js';
import { createCli } from '../../src/index.js';

const masterKey = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');

describe('stephen smoke tests', () => {
  it('renders top-level help text', async () => {
    let stdout = '';

    const cli = createCli({
      masterKey,
      repository: new AkRepository(createAkDatabase(':memory:')),
      stdout: (value) => {
        stdout += value;
      }
    });

    const exitCode = await cli.run(['--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('stephen');
    expect(stdout).toContain('ak');
    expect(stdout).toContain('config');
  });
});
