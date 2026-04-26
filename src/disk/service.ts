import { win32 } from 'node:path';

import type { DiskCleanupReport, DiskCleanupTarget } from './types.js';
import type { DiskCleanupRuntime } from './runtime.js';

export { type DiskCleanupRuntime } from './runtime.js';

export interface DiskCleanupServiceDependencies {
  runtime: DiskCleanupRuntime;
  systemRoot: string;
  userProfileRoot: string;
}

export interface DiskCleanupOptions {
  apply: boolean;
  disableHibernate: boolean;
}

interface DiskCleanupTargetDefinition {
  action: DiskCleanupTarget['action'];
  label: string;
  path: string;
  requiresAdministrator: boolean;
}

export interface DiskCleanupErrorDetails {
  report: DiskCleanupReport;
}

export class DiskCleanupServiceError extends Error {
  code: string;
  details?: DiskCleanupErrorDetails;
  exitCode: number;

  constructor(code: string, message: string, exitCode = 2, details?: DiskCleanupErrorDetails) {
    super(message);
    this.code = code;
    this.details = details;
    this.exitCode = exitCode;
  }
}

export class DiskCleanupService {
  private readonly runtime: DiskCleanupRuntime;
  private readonly systemRoot: string;
  private readonly userProfileRoot: string;

  constructor(dependencies: DiskCleanupServiceDependencies) {
    this.runtime = dependencies.runtime;
    this.systemRoot = dependencies.systemRoot;
    this.userProfileRoot = dependencies.userProfileRoot;
  }

  async cleanup(options: DiskCleanupOptions): Promise<DiskCleanupReport> {
    const targetDefinitions = this.getConservativeTargets();
    const targets: DiskCleanupTarget[] = [];
    const failures: string[] = [];
    let estimatedReclaimBytes = 0;

    for (const target of targetDefinitions) {
      const inspection = await this.runtime.inspectPath(target.path);
      estimatedReclaimBytes += inspection.sizeBytes;

      let status: DiskCleanupTarget['status'] = inspection.exists
        ? (options.apply ? 'cleaned' : 'planned')
        : 'missing';
      let error: string | undefined;

      if (options.apply && inspection.exists) {
        try {
          await this.runtime.clearDirectoryContents(target.path);
        } catch (cause) {
          error = getErrorMessage(cause);
          failures.push(`${target.label}: ${error}`);
          status = 'failed';
        }
      }

      targets.push({
        action: target.action,
        error,
        exists: inspection.exists,
        label: target.label,
        path: target.path,
        requiresAdministrator: target.requiresAdministrator,
        sizeBytes: inspection.sizeBytes,
        sizeGB: bytesToGb(inspection.sizeBytes),
        status
      });
    }

    const hibernation: DiskCleanupReport['hibernation'] = {
      requested: options.disableHibernate,
      status: 'skipped'
    };

    if (options.apply && options.disableHibernate) {
      try {
        await this.runtime.disableHibernation();
        hibernation.status = 'disabled';
      } catch (error) {
        hibernation.status = 'failed';
        hibernation.error = getErrorMessage(error);
        failures.push(`hibernation: ${hibernation.error}`);
      }
    }

    const report: DiskCleanupReport = {
      estimatedReclaimBytes,
      estimatedReclaimGB: bytesToGb(estimatedReclaimBytes),
      hibernation,
      mode: options.apply ? 'apply' : 'preview',
      systemRoot: this.systemRoot,
      targets,
      userProfileRoot: this.userProfileRoot
    };

    if (failures.length > 0) {
      throw new DiskCleanupServiceError(
        'DISK_CLEANUP_ERROR',
        'Disk cleanup encountered failures.',
        2,
        {
          report
        }
      );
    };

    return report;
  }

  private getConservativeTargets(): DiskCleanupTargetDefinition[] {
    return [
      {
        action: 'clear-directory-contents',
        label: 'npm cache',
        path: win32.join(this.userProfileRoot, 'AppData', 'Local', 'npm-cache'),
        requiresAdministrator: false
      },
      {
        action: 'clear-directory-contents',
        label: 'NuGet cache',
        path: win32.join(this.userProfileRoot, 'AppData', 'Local', 'NuGet'),
        requiresAdministrator: false
      },
      {
        action: 'clear-directory-contents',
        label: 'Generic cache',
        path: win32.join(this.userProfileRoot, '.cache'),
        requiresAdministrator: false
      },
      {
        action: 'clear-directory-contents',
        label: 'Maven repository cache',
        path: win32.join(this.userProfileRoot, '.m2'),
        requiresAdministrator: false
      },
      {
        action: 'clear-directory-contents',
        label: 'User temp',
        path: win32.join(this.userProfileRoot, 'AppData', 'Local', 'Temp'),
        requiresAdministrator: false
      },
      {
        action: 'clear-directory-contents',
        label: 'Windows Update download cache',
        path: win32.join(this.systemRoot, 'SoftwareDistribution', 'Download'),
        requiresAdministrator: true
      }
    ];
  }
}

function bytesToGb(value: number): number {
  return Number((value / (1024 ** 3)).toFixed(2));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
