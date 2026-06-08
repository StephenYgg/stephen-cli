import { win32 } from 'node:path';

import type { DiskCleanupLevel, DiskCleanupReport, DiskCleanupTarget } from './types.js';
import type { DiskCleanupRuntime } from './runtime.js';

export { type DiskCleanupRuntime } from './runtime.js';

export interface DiskCleanupServiceDependencies {
  runtime: DiskCleanupRuntime;
  systemRoot: string;
  userProfileRoot: string;
}

export interface DiskCleanupOptions {
  apply: boolean;
  confirm: boolean;
  disableHibernate: boolean;
  level: DiskCleanupLevel;
}

interface DiskCleanupTargetDefinition {
  args?: string[];
  action: DiskCleanupTarget['action'];
  command?: string;
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
    if (details) {
      this.details = details;
    }
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
    if (requiresConfirmation(options.level) && options.apply && !options.confirm) {
      throw new DiskCleanupServiceError(
        'DISK_CLEANUP_CONFIRMATION_REQUIRED',
        'Disk cleanup level requires --confirm before apply.'
      );
    }

    const targetDefinitions = this.getTargets(options.level);
    const targets: DiskCleanupTarget[] = [];
    const failures: string[] = [];
    let estimatedReclaimBytes = 0;

    for (const target of targetDefinitions) {
      const inspection =
        target.action === 'run-command'
          ? { exists: true, isDirectory: false, sizeBytes: 0 }
          : await this.runtime.inspectPath(target.path);
      estimatedReclaimBytes += inspection.sizeBytes;

      let status: DiskCleanupTarget['status'] = inspection.exists
        ? (options.apply ? 'cleaned' : 'planned')
        : 'missing';
      let error: string | undefined;

      if (options.apply && inspection.exists) {
        try {
          if (target.action === 'clear-directory-contents') {
            await this.runtime.clearDirectoryContents(target.path);
          }
          if (target.action === 'run-command') {
            await this.runtime.runCommand(target.command!, target.args ?? []);
          }
          if (target.action === 'inspect-only') {
            status = 'planned';
          }
        } catch (cause) {
          error = getErrorMessage(cause);
          failures.push(`${target.label}: ${error}`);
          status = 'failed';
        }
      }

      targets.push({
        action: target.action,
        ...(target.command ? { command: target.command } : {}),
        ...(target.args ? { args: target.args } : {}),
        exists: inspection.exists,
        label: target.label,
        path: target.path,
        requiresAdministrator: target.requiresAdministrator,
        sizeBytes: inspection.sizeBytes,
        sizeGB: bytesToGb(inspection.sizeBytes),
        status,
        ...(error ? { error } : {})
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
      ...(options.level === 'deep' ? { downloads: await this.getDownloadsReport() } : {}),
      estimatedReclaimBytes,
      estimatedReclaimGB: bytesToGb(estimatedReclaimBytes),
      hibernation,
      level: options.level,
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

  private async getDownloadsReport(): Promise<NonNullable<DiskCleanupReport['downloads']>> {
    const path = win32.join(this.userProfileRoot, 'Downloads');
    return {
      path,
      topEntries: await this.runtime.listTopEntriesBySize(path, 100)
    };
  }

  private getTargets(level: DiskCleanupLevel): DiskCleanupTargetDefinition[] {
    if (level === 'safe') {
      return this.getSafeTargets();
    }

    if (level === 'dev') {
      return dedupeTargets([...this.getSafeTargets(), ...this.getDevTargets()]);
    }

    if (level === 'system') {
      return dedupeTargets([...this.getSafeTargets(), ...this.getSystemTargets()]);
    }

    return dedupeTargets([...this.getSafeTargets(), ...this.getDevTargets(), ...this.getSystemTargets()]);
  }

  private getSafeTargets(): DiskCleanupTargetDefinition[] {
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

  private getDevTargets(): DiskCleanupTargetDefinition[] {
    return [
      {
        action: 'clear-directory-contents',
        label: 'Gradle cache',
        path: win32.join(this.userProfileRoot, '.gradle', 'caches'),
        requiresAdministrator: false
      },
      {
        action: 'clear-directory-contents',
        label: 'pnpm store',
        path: win32.join(this.userProfileRoot, '.pnpm-store'),
        requiresAdministrator: false
      },
      {
        action: 'clear-directory-contents',
        label: 'pnpm local store',
        path: win32.join(this.userProfileRoot, 'AppData', 'Local', 'pnpm', 'store'),
        requiresAdministrator: false
      },
      {
        action: 'clear-directory-contents',
        label: 'Yarn cache',
        path: win32.join(this.userProfileRoot, 'AppData', 'Local', 'Yarn', 'Cache'),
        requiresAdministrator: false
      },
      {
        action: 'clear-directory-contents',
        label: 'pip cache',
        path: win32.join(this.userProfileRoot, 'AppData', 'Local', 'pip', 'Cache'),
        requiresAdministrator: false
      }
    ];
  }

  private getSystemTargets(): DiskCleanupTargetDefinition[] {
    return [
      {
        action: 'clear-directory-contents',
        label: 'Windows temp',
        path: win32.join(this.systemRoot, 'Temp'),
        requiresAdministrator: true
      },
      {
        action: 'run-command',
        args: ['/Online', '/Cleanup-Image', '/StartComponentCleanup'],
        command: 'dism.exe',
        label: 'DISM component cleanup',
        path: 'dism.exe /Online /Cleanup-Image /StartComponentCleanup',
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

function requiresConfirmation(level: DiskCleanupLevel): boolean {
  return level === 'system' || level === 'deep';
}

function dedupeTargets(targets: DiskCleanupTargetDefinition[]): DiskCleanupTargetDefinition[] {
  const seen = new Set<string>();
  const result: DiskCleanupTargetDefinition[] = [];

  for (const target of targets) {
    const key = `${target.action}:${target.command ?? target.path}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(target);
  }

  return result;
}
