import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('CLI entrypoint', () => {
  it('configures the build to emit a Node shebang for the CLI entrypoint', () => {
    const buildConfig = readFileSync('tsup.config.ts', 'utf8');

    expect(buildConfig).toContain("js: '#!/usr/bin/env node'");
  });
});
