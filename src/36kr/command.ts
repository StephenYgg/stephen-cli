import type { Command } from 'commander';
import { z } from 'zod';

import { renderKr36ArticleAsJson, renderKr36CommandErrorAsJson } from './output.js';
import type { Kr36Runtime } from './runtime.js';
import { Kr36ArticleService } from './service.js';
import { Kr36CommandError } from './types.js';

export interface Kr36CommandDependencies {
  runtime: Kr36Runtime;
  stderr: (value: string) => void;
  stdout: (value: string) => void;
}

const articleOptionsSchema = z.object({
  format: z.enum(['json']).default('json')
});

export function registerKr36Commands(
  program: Command,
  dependencies: Kr36CommandDependencies
): void {
  const kr36 = program.command('36kr').description('Fetch and parse 36kr content.');
  const articleService = new Kr36ArticleService(dependencies.runtime);

  kr36.command('article')
    .argument('<articleId>', '36kr article id')
    .option('--format <format>', 'output format', 'json')
    .action(async (articleId, options) => {
      articleOptionsSchema.parse(options);
      const article = await articleService.getArticle(articleId);
      dependencies.stdout(`${renderKr36ArticleAsJson(article)}\n`);
    });
}

export function handleKr36CommandError(
  error: unknown,
  dependencies: Pick<Kr36CommandDependencies, 'stderr'>
): number | undefined {
  if (error instanceof Kr36CommandError) {
    dependencies.stderr(
      `${renderKr36CommandErrorAsJson(error.code, error.message, error.details)}\n`
    );
    return error.exitCode;
  }

  return undefined;
}
