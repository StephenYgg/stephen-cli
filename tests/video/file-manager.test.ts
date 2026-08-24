import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  sanitizeVideoFileName,
  VideoDownloadFileManager
} from '../../src/video/download/file-manager.js';

describe('sanitizeVideoFileName', () => {
  it('removes Windows-invalid characters and trailing dots', () => {
    expect(sanitizeVideoFileName('  A:  Video?<>.  ')).toBe('A Video');
  });

  it('protects reserved Windows names and limits long titles', () => {
    expect(sanitizeVideoFileName('CON')).toBe('_CON');
    expect(sanitizeVideoFileName('x'.repeat(300))).toHaveLength(180);
  });
});

describe('VideoDownloadFileManager', () => {
  it('plans a sibling temporary file with a sanitized title', async () => {
    const outputDir = await createTempDir();
    const manager = new VideoDownloadFileManager();
    const plan = manager.plan({
      mediaType: 'mp4',
      outputDir,
      sourceUrl: 'https://cdn.example.com/video.mp4',
      title: 'A: Video?'
    });

    expect(plan.targetPath).toBe(join(outputDir, 'A Video.mp4'));
    expect(dirname(plan.tempPath)).toBe(outputDir);
    expect(basename(plan.tempPath)).toMatch(/^\.stephen-video-[0-9a-f-]{36}\.part$/u);
  });

  it('keeps temporary names short for long explicit paths and URL names', async () => {
    const outputDir = await createTempDir();
    const manager = new VideoDownloadFileManager();
    const explicitPlan = manager.plan({
      mediaType: 'mp4',
      outputPath: join(outputDir, `${'x'.repeat(220)}.mp4`),
      sourceUrl: 'https://cdn.example.com/video.mp4'
    });
    const urlPlan = manager.plan({
      mediaType: 'mp4',
      outputDir,
      sourceUrl: `https://cdn.example.com/${'y'.repeat(280)}.mp4`
    });

    expect(basename(explicitPlan.tempPath).length).toBeLessThanOrEqual(255);
    expect(basename(urlPlan.tempPath).length).toBeLessThanOrEqual(255);
    expect(basename(urlPlan.targetPath).length).toBeLessThanOrEqual(255);
  });

  it('falls back to the media URL name without a title', async () => {
    const outputDir = await createTempDir();
    const manager = new VideoDownloadFileManager();

    expect(
      manager.plan({
        mediaType: 'mp4',
        outputDir,
        sourceUrl: 'https://cdn.example.com/path/original.mp4'
      }).targetPath
    ).toBe(join(outputDir, 'original.mp4'));
    expect(
      manager.plan({
        mediaType: 'm3u8',
        outputDir,
        sourceUrl: 'https://cdn.example.com/path/master.m3u8'
      }).targetPath
    ).toBe(join(outputDir, 'master.ts'));
  });

  it('reuses an existing same-title file with the same MD5', async () => {
    const outputDir = await createTempDir();
    const manager = new VideoDownloadFileManager();
    const plan = manager.plan({
      mediaType: 'mp4',
      outputDir,
      sourceUrl: 'https://cdn.example.com/video.mp4',
      title: 'Example Video'
    });
    await writeFile(plan.targetPath, 'same content');
    await writeFile(plan.tempPath, 'same content');

    await expect(manager.finalize(plan)).resolves.toEqual({
      md5: md5('same content'),
      outputPath: plan.targetPath,
      status: 'already_downloaded'
    });
    await expect(stat(plan.tempPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('checks the whole title family before choosing the first free name', async () => {
    const outputDir = await createTempDir();
    const manager = new VideoDownloadFileManager();
    const plan = manager.plan({
      mediaType: 'mp4',
      outputDir,
      sourceUrl: 'https://cdn.example.com/video.mp4',
      title: 'Example Video'
    });
    await writeFile(join(outputDir, 'Example Video.mp4'), 'first');
    await writeFile(join(outputDir, 'Example Video (3).mp4'), 'same content');
    await writeFile(plan.tempPath, 'same content');

    await expect(manager.finalize(plan)).resolves.toEqual({
      md5: md5('same content'),
      outputPath: join(outputDir, 'Example Video (3).mp4'),
      status: 'already_downloaded'
    });
  });

  it('uses the first free numeric suffix for different content', async () => {
    const outputDir = await createTempDir();
    const manager = new VideoDownloadFileManager();
    const plan = manager.plan({
      mediaType: 'm3u8',
      outputDir,
      sourceUrl: 'https://cdn.example.com/master.m3u8',
      title: 'Example Video'
    });
    await writeFile(plan.targetPath, 'first');
    await writeFile(join(outputDir, 'Example Video (2).ts'), 'second');
    await writeFile(plan.tempPath, 'third');

    await expect(manager.finalize(plan)).resolves.toEqual({
      md5: md5('third'),
      outputPath: join(outputDir, 'Example Video (3).ts'),
      status: 'downloaded'
    });
    await expect(readFile(join(outputDir, 'Example Video (3).ts'), 'utf8')).resolves.toBe('third');
  });

  it('does not treat a manually named (1) file as part of the title family', async () => {
    const outputDir = await createTempDir();
    const manager = new VideoDownloadFileManager();
    const plan = manager.plan({
      mediaType: 'mp4',
      outputDir,
      sourceUrl: 'https://cdn.example.com/video.mp4',
      title: 'Example Video'
    });
    await writeFile(join(outputDir, 'Example Video (1).mp4'), 'same content');
    await writeFile(plan.tempPath, 'same content');

    await expect(manager.finalize(plan)).resolves.toMatchObject({
      outputPath: plan.targetPath,
      status: 'downloaded'
    });
  });

  it('treats a same-name directory as occupied without trying to hash it', async () => {
    const outputDir = await createTempDir();
    const manager = new VideoDownloadFileManager();
    const plan = manager.plan({
      mediaType: 'mp4',
      outputDir,
      sourceUrl: 'https://cdn.example.com/video.mp4',
      title: 'Example Video'
    });
    await mkdir(plan.targetPath);
    await writeFile(plan.tempPath, 'content');

    await expect(manager.finalize(plan)).resolves.toMatchObject({
      outputPath: join(outputDir, 'Example Video (2).mp4'),
      status: 'downloaded'
    });
  });

  it('rejects different content at an explicit output path and removes the temporary file', async () => {
    const outputDir = await createTempDir();
    const manager = new VideoDownloadFileManager();
    const outputPath = join(outputDir, 'custom.mp4');
    const plan = manager.plan({
      mediaType: 'mp4',
      outputPath,
      sourceUrl: 'https://cdn.example.com/video.mp4',
      title: 'Ignored Title'
    });
    await writeFile(outputPath, 'existing');
    await writeFile(plan.tempPath, 'different');

    await expect(manager.finalize(plan)).rejects.toMatchObject({
      code: 'VIDEO_OUTPUT_CONFLICT'
    });
    await expect(stat(plan.tempPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes incomplete temporary files during cleanup', async () => {
    const outputDir = await createTempDir();
    const manager = new VideoDownloadFileManager();
    const plan = manager.plan({
      mediaType: 'mp4',
      outputDir,
      sourceUrl: 'https://cdn.example.com/video.mp4'
    });
    await writeFile(plan.tempPath, 'partial');

    await manager.cleanup(plan);

    await expect(stat(plan.tempPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(manager.cleanup(plan)).resolves.toBeUndefined();
  });
});

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'stephen-file-manager-'));
}

function md5(value: string): string {
  return createHash('md5').update(value).digest('hex');
}
