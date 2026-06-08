import { describe, expect, it } from 'vitest';

import { applyDiskTableShortcut } from '../../src/disk/command.js';
import {
  renderDiskCleanupReportAsJson,
  renderDiskCleanupReportAsTable
} from '../../src/disk/output.js';
import type { DiskCleanupReport } from '../../src/disk/types.js';

const report: DiskCleanupReport = {
  estimatedReclaimBytes: 1024,
  estimatedReclaimGB: 0,
  hibernation: {
    requested: false,
    status: 'skipped'
  },
  level: 'safe',
  mode: 'preview',
  systemRoot: 'C:\\Windows',
  targets: [
    {
      action: 'clear-directory-contents',
      exists: true,
      label: 'npm cache',
      path: 'C:\\Users\\Stephen\\AppData\\Local\\npm-cache',
      requiresAdministrator: false,
      sizeBytes: 1024,
      sizeGB: 0,
      status: 'planned'
    }
  ],
  userProfileRoot: 'C:\\Users\\Stephen'
};

describe('disk output', () => {
  it('renders cleanup reports as JSON by default', () => {
    const output = renderDiskCleanupReportAsJson(report);

    expect(output).toContain('"ok": true');
    expect(output).toContain('"level": "safe"');
    expect(output).toContain('"mode": "preview"');
    expect(output).toContain('"label": "npm cache"');
  });

  it('renders cleanup reports as tables for human inspection', () => {
    const output = renderDiskCleanupReportAsTable(report);

    expect(output).toContain('label');
    expect(output).toContain('npm cache');
    expect(output).toContain('planned');
  });

  it('renders Downloads entries in JSON and table output when present', () => {
    const deepReport: DiskCleanupReport = {
      ...report,
      downloads: {
        path: 'C:\\Users\\Stephen\\Downloads',
        topEntries: [
          {
            kind: 'file',
            name: 'large.iso',
            path: 'C:\\Users\\Stephen\\Downloads\\large.iso',
            sizeBytes: 1024,
            sizeGB: 0
          }
        ]
      },
      level: 'deep'
    };

    const json = renderDiskCleanupReportAsJson(deepReport);
    const table = renderDiskCleanupReportAsTable(deepReport);

    expect(json).toContain('"downloads"');
    expect(json).toContain('"large.iso"');
    expect(table).toContain('Downloads top entries');
    expect(table).toContain('large.iso');
  });

  it('maps the table shortcut and rejects missing output format state', () => {
    expect(applyDiskTableShortcut({ table: true })).toEqual({
      format: 'table',
      table: true
    });
    expect(() => applyDiskTableShortcut({})).toThrow('Output format is required for this command.');
  });
});
