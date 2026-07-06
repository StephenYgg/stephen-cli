import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('project documentation', () => {
  it('documents the project and ak command in README', () => {
    const readme = readFileSync('README.md', 'utf8');

    expect(readme).toContain('stephen');
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
    expect(claude).toContain('stephen');
    expect(claude).toContain('ak');
    expect(claude).toContain('gitlab');
  });

  it('ignores docs artifacts in git', () => {
    const gitignore = readFileSync('.gitignore', 'utf8');

    expect(gitignore).toContain('docs/');
  });

  it('includes basic npm publish metadata', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      bugs?: { url?: string };
      homepage?: string;
      repository?: { type?: string; url?: string };
    };
    const license = readFileSync('LICENSE', 'utf8');

    expect(packageJson.repository?.type).toBe('git');
    expect(packageJson.repository?.url).toContain('github.com/StephenYgg/stephen-cli.git');
    expect(packageJson.homepage).toContain('github.com/StephenYgg/stephen-cli');
    expect(packageJson.bugs?.url).toContain('github.com/StephenYgg/stephen-cli/issues');
    expect(license).toContain('MIT License');
  });
});
