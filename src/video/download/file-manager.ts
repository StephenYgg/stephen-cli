import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { link, readdir, unlink } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

import { VideoCommandError, type VideoCandidateType } from '../types.js';

const MAX_BASE_NAME_LENGTH = 180;
const WINDOWS_RESERVED_NAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu;

export interface VideoDownloadFilePlan {
  baseName: string;
  directory: string;
  explicitOutputPath: boolean;
  extension: string;
  targetPath: string;
  tempPath: string;
}

export interface VideoDownloadFinalization {
  md5: string;
  outputPath: string;
  status: 'downloaded' | 'already_downloaded';
}

export function sanitizeVideoFileName(value: string): string | undefined {
  let name = value
    .replace(/[\u0000-\u001f]/gu, ' ')
    .replace(/[<>:"/\\|?*]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[ .]+$/gu, '');

  if (!name) {
    return undefined;
  }

  if (WINDOWS_RESERVED_NAME.test(name)) {
    name = `_${name}`;
  }

  return name.slice(0, MAX_BASE_NAME_LENGTH).replace(/[ .]+$/gu, '') || undefined;
}

export class VideoDownloadFileManager {
  plan(options: {
    mediaType: VideoCandidateType;
    outputDir?: string;
    outputPath?: string;
    sourceUrl: string;
    title?: string | undefined;
  }): VideoDownloadFilePlan {
    const explicitOutputPath = options.outputPath !== undefined;
    const targetPath = options.outputPath ?? join(
      options.outputDir ?? '.',
      inferAutomaticFileName(options)
    );
    const directory = dirname(targetPath);
    const targetFileName = basename(targetPath);
    const extension = extname(targetFileName);
    const baseName = extension ? targetFileName.slice(0, -extension.length) : targetFileName;

    return {
      baseName,
      directory,
      explicitOutputPath,
      extension,
      targetPath,
      tempPath: join(directory, `.stephen-video-${randomUUID()}.part`)
    };
  }

  async finalize(plan: VideoDownloadFilePlan): Promise<VideoDownloadFinalization> {
    try {
      const md5 = await hashFile(plan.tempPath);
      return plan.explicitOutputPath
        ? await this.finalizeExplicit(plan, md5)
        : await this.finalizeAutomatic(plan, md5);
    } catch (error) {
      try {
        await this.cleanup(plan);
      } catch (cleanupError) {
        throw new VideoCommandError(
          'VIDEO_TEMP_CLEANUP_FAILED',
          `Failed to remove temporary download ${plan.tempPath}.`,
          2,
          {
            cleanupCause: toErrorMessage(cleanupError),
            originalCause: toErrorMessage(error)
          }
        );
      }
      throw error;
    }
  }

  async cleanup(plan: VideoDownloadFilePlan): Promise<void> {
    try {
      await unlink(plan.tempPath);
    } catch (error) {
      if (!isFileSystemError(error, 'ENOENT')) {
        throw error;
      }
    }
  }

  private async finalizeExplicit(
    plan: VideoDownloadFilePlan,
    md5: string
  ): Promise<VideoDownloadFinalization> {
    while (true) {
      try {
        const existingMd5 = await hashFile(plan.targetPath);
        if (existingMd5 === md5) {
          await this.cleanup(plan);
          return {
            md5,
            outputPath: plan.targetPath,
            status: 'already_downloaded'
          };
        }

        throw createOutputConflict(plan.targetPath);
      } catch (error) {
        if (!isFileSystemError(error, 'ENOENT')) {
          throw error;
        }
      }

      try {
        await publishFile(plan.tempPath, plan.targetPath);
        return {
          md5,
          outputPath: plan.targetPath,
          status: 'downloaded'
        };
      } catch (error) {
        if (!isFileSystemError(error, 'EEXIST')) {
          throw error;
        }
      }
    }
  }

  private async finalizeAutomatic(
    plan: VideoDownloadFilePlan,
    md5: string
  ): Promise<VideoDownloadFinalization> {
    while (true) {
      const family = await findTitleFamily(plan);

      for (const existing of family.values()) {
        if (existing.isFile && await hashFile(existing.path) === md5) {
          await this.cleanup(plan);
          return {
            md5,
            outputPath: existing.path,
            status: 'already_downloaded'
          };
        }
      }

      let index = 1;
      while (family.has(index)) {
        index += 1;
      }
      const outputPath = buildFamilyPath(plan, index);

      try {
        await publishFile(plan.tempPath, outputPath);
        return {
          md5,
          outputPath,
          status: 'downloaded'
        };
      } catch (error) {
        if (!isFileSystemError(error, 'EEXIST')) {
          throw error;
        }
      }
    }
  }
}

function inferAutomaticFileName(options: {
  mediaType: VideoCandidateType;
  sourceUrl: string;
  title?: string | undefined;
}): string {
  const title = sanitizeVideoFileName(options.title ?? '');
  if (title) {
    return `${title}${options.mediaType === 'm3u8' ? '.ts' : '.mp4'}`;
  }

  const sourceName = basename(new URL(options.sourceUrl).pathname);
  const extension = extname(sourceName);
  const rawBaseName = extension ? sourceName.slice(0, -extension.length) : sourceName;
  const baseName = sanitizeVideoFileName(rawBaseName) ?? 'video';
  if (options.mediaType === 'mp4') {
    return `${baseName}${extension}`;
  }

  return `${baseName}.ts`;
}

async function findTitleFamily(
  plan: VideoDownloadFilePlan
): Promise<Map<number, { isFile: boolean; path: string }>> {
  const entries = await readdir(plan.directory, { withFileTypes: true });
  const pattern = new RegExp(
    `^${escapeRegExp(plan.baseName)}(?: \\(([2-9]|[1-9]\\d+)\\))?${escapeRegExp(plan.extension)}$`,
    'iu'
  );
  const family = new Map<number, { isFile: boolean; path: string }>();

  for (const entry of entries) {
    const match = pattern.exec(entry.name);
    if (!match) {
      continue;
    }

    const index = match[1] ? Number.parseInt(match[1], 10) : 1;
    if (index >= 1) {
      family.set(index, {
        isFile: entry.isFile(),
        path: join(plan.directory, entry.name)
      });
    }
  }

  return family;
}

function buildFamilyPath(plan: VideoDownloadFilePlan, index: number): string {
  const suffix = index === 1 ? '' : ` (${index})`;
  return join(plan.directory, `${plan.baseName}${suffix}${plan.extension}`);
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('md5');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

async function publishFile(tempPath: string, outputPath: string): Promise<void> {
  await link(tempPath, outputPath);
  try {
    await unlink(tempPath);
  } catch (error) {
    try {
      await unlink(outputPath);
    } catch {
      // Preserve the original cleanup failure.
    }
    throw error;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function isFileSystemError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createOutputConflict(outputPath: string): VideoCommandError {
  return new VideoCommandError(
    'VIDEO_OUTPUT_CONFLICT',
    `Output path already exists with different content: ${outputPath}.`
  );
}
