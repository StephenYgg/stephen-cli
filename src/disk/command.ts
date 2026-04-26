import type { Command } from 'commander';
import { z } from 'zod';

import { renderDiskCleanupReportAsJson, renderDiskCleanupReportAsTable } from './output.js';
import { DiskCleanupService } from './service.js';

export interface DiskCommandDependencies {
  createDiskCleanupService: () => DiskCleanupService;
  stdout: (value: string) => void;
}

const diskCleanupOptionsSchema = z.object({
  apply: z.boolean().default(false),
  disableHibernate: z.boolean().default(false),
  format: z.enum(['json', 'table']).default('json')
});

export function registerDiskCommands(
  program: Command,
  dependencies: DiskCommandDependencies
): void {
  const disk = program.command('disk').description('Inspect and clean conservative disk caches.');

  disk.command('cleanup')
    .option('--apply', 'execute cleanup instead of previewing it')
    .option('--disable-hibernate', 'disable Windows hibernation during apply mode')
    .option('--format <format>', 'output format', 'json')
    .option('-t, --table', 'render as a table')
    .action(async (options) => {
      const parsed = diskCleanupOptionsSchema.parse(applyDiskTableShortcut(options));
      const report = await dependencies.createDiskCleanupService().cleanup({
        apply: parsed.apply,
        disableHibernate: parsed.disableHibernate
      });

      if (parsed.format === 'table') {
        dependencies.stdout(`${renderDiskCleanupReportAsTable(report)}\n`);
        return;
      }

      dependencies.stdout(`${renderDiskCleanupReportAsJson(report)}\n`);
    });
}

export function applyDiskTableShortcut<T extends { format?: string; table?: boolean }>(options: T): T & {
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

  /* v8 ignore next */
  throw new Error('Output format is required for this command.');
}
