export type DiskCleanupMode = 'preview' | 'apply';

export type DiskCleanupTargetAction = 'clear-directory-contents';

export type DiskCleanupTargetStatus = 'planned' | 'cleaned' | 'missing' | 'failed';

export interface DiskCleanupTarget {
  action: DiskCleanupTargetAction;
  error?: string;
  exists: boolean;
  label: string;
  path: string;
  requiresAdministrator: boolean;
  sizeBytes: number;
  sizeGB: number;
  status: DiskCleanupTargetStatus;
}

export interface DiskCleanupHibernationResult {
  error?: string;
  requested: boolean;
  status: 'skipped' | 'disabled' | 'failed';
}

export interface DiskCleanupReport {
  estimatedReclaimBytes: number;
  estimatedReclaimGB: number;
  hibernation: DiskCleanupHibernationResult;
  mode: DiskCleanupMode;
  systemRoot: string;
  targets: DiskCleanupTarget[];
  userProfileRoot: string;
}
