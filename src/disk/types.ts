export type DiskCleanupLevel = 'safe' | 'dev' | 'system' | 'deep';

export type DiskCleanupMode = 'preview' | 'apply';

export type DiskCleanupTargetAction = 'clear-directory-contents' | 'run-command' | 'inspect-only';

export type DiskCleanupTargetStatus = 'planned' | 'cleaned' | 'missing' | 'failed';

export interface DiskCleanupTarget {
  action: DiskCleanupTargetAction;
  command?: string;
  args?: string[];
  error?: string;
  exists: boolean;
  label: string;
  path: string;
  requiresAdministrator: boolean;
  sizeBytes: number;
  sizeGB: number;
  status: DiskCleanupTargetStatus;
}

export interface DiskDownloadsEntry {
  kind: 'file' | 'directory';
  name: string;
  path: string;
  sizeBytes: number;
  sizeGB: number;
}

export interface DiskDownloadsReport {
  path: string;
  topEntries: DiskDownloadsEntry[];
}

export interface DiskCleanupHibernationResult {
  error?: string;
  requested: boolean;
  status: 'skipped' | 'disabled' | 'failed';
}

export interface DiskCleanupReport {
  downloads?: DiskDownloadsReport;
  estimatedReclaimBytes: number;
  estimatedReclaimGB: number;
  hibernation: DiskCleanupHibernationResult;
  level: DiskCleanupLevel;
  mode: DiskCleanupMode;
  systemRoot: string;
  targets: DiskCleanupTarget[];
  userProfileRoot: string;
}
