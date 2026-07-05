import type { Command } from 'commander';
import { z } from 'zod';

import {
  renderHackerNewsCommandErrorAsJson,
  renderHackerNewsSearchAsJson,
  renderHackerNewsStoriesAsJson
} from './output.js';
import type { HackerNewsRuntime } from './runtime.js';
import { HackerNewsService } from './service.js';
import { HackerNewsCommandError, type HackerNewsStorySource } from './types.js';

export interface HackerNewsCommandDependencies {
  runtime: HackerNewsRuntime;
  stderr: (value: string) => void;
  stdout: (value: string) => void;
}

const storiesOptionsSchema = z.object({
  format: z.enum(['json']).default('json'),
  limit: z.number().int().default(30)
});

const searchOptionsSchema = z.object({
  format: z.enum(['json']).default('json'),
  limit: z.number().int().default(30),
  sort: z.enum(['relevance', 'date']).default('relevance')
});

export function registerHackerNewsCommands(
  program: Command,
  dependencies: HackerNewsCommandDependencies
): void {
  const hn = program.command('hn').description('Fetch Hacker News stories and search results.');
  const service = new HackerNewsService({ runtime: dependencies.runtime });

  for (const source of ['top', 'new', 'best'] as const) {
    hn.command(source)
      .option('--limit <limit>', 'number of stories to fetch', parseLimit, 30)
      .option('--format <format>', 'output format', 'json')
      .action(async (options) => {
        const parsed = storiesOptionsSchema.parse(options);
        const result = await service.stories({
          limit: parsed.limit,
          source
        });
        dependencies.stdout(`${renderHackerNewsStoriesAsJson(result)}\n`);
      });
  }

  hn.command('search')
    .argument('<query>', 'search query')
    .option('--limit <limit>', 'number of search results to fetch', parseLimit, 30)
    .option('--sort <sort>', 'search sort: relevance or date', 'relevance')
    .option('--format <format>', 'output format', 'json')
    .action(async (query, options) => {
      const parsed = searchOptionsSchema.parse(options);
      const result = await service.search({
        limit: parsed.limit,
        query,
        sort: parsed.sort
      });
      dependencies.stdout(`${renderHackerNewsSearchAsJson(result)}\n`);
    });
}

export function handleHackerNewsCommandError(
  error: unknown,
  dependencies: Pick<HackerNewsCommandDependencies, 'stderr'>
): number | undefined {
  if (error instanceof HackerNewsCommandError) {
    dependencies.stderr(
      `${renderHackerNewsCommandErrorAsJson(error.code, error.message, error.details)}\n`
    );
    return error.exitCode;
  }

  return undefined;
}

function parseLimit(value: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw new HackerNewsCommandError(
      'HN_INVALID_LIMIT',
      'Hacker News limit must be an integer between 1 and 100.',
      2,
      {
        limit: value
      }
    );
  }

  return parsed;
}
