import { table } from 'table';

import type { DiskCleanupReport } from './types.js';

export function renderDiskCleanupReportAsJson(report: DiskCleanupReport): string {
  return JSON.stringify(
    {
      ok: true,
      data: report,
      meta: {
        count: report.targets.length,
        estimatedReclaimBytes: report.estimatedReclaimBytes,
        estimatedReclaimGB: report.estimatedReclaimGB
      }
    },
    null,
    2
  );
}

export function renderDiskCleanupReportAsTable(report: DiskCleanupReport): string {
  const targetTable = table([
    ['label', 'status', 'sizeGB', 'exists', 'requiresAdmin', 'path'],
    ...report.targets.map((target) => [
      target.label,
      target.status,
      String(target.sizeGB),
      target.exists ? 'yes' : 'no',
      target.requiresAdministrator ? 'yes' : 'no',
      target.path
    ])
  ]);

  if (!report.downloads) {
    return targetTable;
  }

  return `${targetTable}\nDownloads top entries\n${table([
    ['kind', 'sizeGB', 'path'],
    ...report.downloads.topEntries.map((entry) => [entry.kind, String(entry.sizeGB), entry.path])
  ])}`;
}
