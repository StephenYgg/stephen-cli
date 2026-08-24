import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const race = vi.hoisted(() => ({
  beforeLink: undefined as (() => Promise<void>) | undefined
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    link: async (existingPath: string, newPath: string) => {
      const beforeLink = race.beforeLink;
      race.beforeLink = undefined;
      if (beforeLink) {
        await beforeLink();
      }
      return actual.link(existingPath, newPath);
    }
  };
});

import { VideoDownloadFileManager } from '../../src/video/download/file-manager.js';

describe('VideoDownloadFileManager explicit output races', () => {
  it('rechecks an explicit target created with the same content during publish', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'stephen-file-race-'));
    const outputPath = join(outputDir, 'explicit.mp4');
    const manager = new VideoDownloadFileManager();
    const plan = manager.plan({
      mediaType: 'mp4',
      outputPath,
      sourceUrl: 'https://cdn.example.com/video.mp4'
    });
    await writeFile(plan.tempPath, 'same content');
    race.beforeLink = async () => writeFile(outputPath, 'same content');

    await expect(manager.finalize(plan)).resolves.toMatchObject({
      outputPath,
      status: 'already_downloaded'
    });
  });

  it('maps different content created during publish to an output conflict', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'stephen-file-race-'));
    const outputPath = join(outputDir, 'explicit.mp4');
    const manager = new VideoDownloadFileManager();
    const plan = manager.plan({
      mediaType: 'mp4',
      outputPath,
      sourceUrl: 'https://cdn.example.com/video.mp4'
    });
    await writeFile(plan.tempPath, 'new content');
    race.beforeLink = async () => writeFile(outputPath, 'other content');

    await expect(manager.finalize(plan)).rejects.toMatchObject({
      code: 'VIDEO_OUTPUT_CONFLICT'
    });
  });
});
