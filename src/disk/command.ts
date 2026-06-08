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
  confirm: z.boolean().default(false),
  disableHibernate: z.boolean().default(false),
  format: z.enum(['json', 'table']).default('json'),
  level: z.enum(['safe', 'dev', 'system', 'deep']).default('safe')
});

export function registerDiskCommands(
  program: Command,
  dependencies: DiskCommandDependencies
): void {
  const disk = program.command('disk').description('Inspect and clean conservative disk caches.');

  disk.command('cleanup')
    .option('--apply', 'execute cleanup instead of previewing it')
    .option('--confirm', 'confirm apply for system or deep cleanup levels')
    .option('--disable-hibernate', 'disable Windows hibernation during apply mode')
    .option('--format <format>', 'output format', 'json')
    .option('--level <level>', 'cleanup level: safe, dev, system, or deep', 'safe')
    .option('-t, --table', 'render as a table')
    .action(async (options) => {
      const parsed = diskCleanupOptionsSchema.parse(applyDiskTableShortcut(options));
      const report = await dependencies.createDiskCleanupService().cleanup({
        apply: parsed.apply,
        confirm: parsed.confirm,
        disableHibernate: parsed.disableHibernate,
        level: parsed.level
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
