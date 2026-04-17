import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('project documentation', () => {
  it('documents the project and ak command in README', () => {
    const readme = readFileSync('README.md', 'utf8');

    expect(readme).toContain('stephen-cli');
    expect(readme).toContain('ak');
    expect(readme).toContain('JSON');
    expect(readme).toContain('gitee');
    expect(readme).toContain('github');
    expect(readme).toContain('gitlab');
  });

  it('includes agent guidance in AGENTS.md and CLAUDE.md', () => {
    const agents = readFileSync('AGENTS.md', 'utf8');
    const claude = readFileSync('CLAUDE.md', 'utf8');

    expect(agents).toContain('agent');
    expect(agents).toContain('TDD');
    expect(agents).toContain('github');
    expect(claude).toContain('stephen-cli');
    expect(claude).toContain('ak');
    expect(claude).toContain('gitlab');
  });
});
