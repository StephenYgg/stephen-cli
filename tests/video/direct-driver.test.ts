import { describe, expect, it, vi } from 'vitest';

import { DirectVideoDownloadDriver } from '../../src/video/download/direct-driver.js';

describe('DirectVideoDownloadDriver', () => {
  it('downloads an mp4 response and infers the output filename from the url', async () => {
    const writes: Array<{ path: string; value: string }> = [];
    const driver = new DirectVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async () => ({
          arrayBuffer: async () => Buffer.from('video-bytes'),
          headers: new Headers({
            'content-type': 'video/mp4'
          }),
          ok: true,
          status: 200,
          text: async () => ''
        })),
        writeFile: vi.fn(async (path, value) => {
          writes.push({
            path,
            value: Buffer.from(value).toString('utf8')
          });
        })
      }
    });

    const result = await driver.download({
      outputDir: 'D:/videos',
      sourceUrl: 'https://cdn.example.com/folder/video.mp4'
    });

    expect(result.outputPath).toBe('D:\\videos\\video.mp4');
    expect(result.mediaType).toBe('mp4');
    expect(writes).toEqual([
      {
        path: 'D:\\videos\\video.mp4',
        value: 'video-bytes'
      }
    ]);
  });

  it('surfaces non-ok direct download responses as structured errors', async () => {
    const driver = new DirectVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async () => ({
          arrayBuffer: async () => new ArrayBuffer(0),
          headers: new Headers(),
          ok: false,
          status: 404,
          text: async () => ''
        })),
        writeFile: vi.fn(async () => undefined)
      }
    });

    await expect(
      driver.download({
        sourceUrl: 'https://cdn.example.com/missing.mp4'
      })
    ).rejects.toMatchObject({
      code: 'VIDEO_DOWNLOAD_FAILED'
    });
  });

  it('wraps direct download network failures as structured errors', async () => {
    const driver = new DirectVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async () => {
          throw new Error('fetch failed');
        }),
        writeFile: vi.fn(async () => undefined)
      }
    });

    await expect(
      driver.download({
        sourceUrl: 'https://cdn.example.com/video.mp4'
      })
    ).rejects.toMatchObject({
      code: 'VIDEO_DOWNLOAD_FAILED',
      details: {
        cause: 'fetch failed'
      }
    });
  });

  it('uses explicit output paths and falls back to a default filename when the url path is empty', async () => {
    const writes: string[] = [];
    const driver = new DirectVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async () => ({
          arrayBuffer: async () => new ArrayBuffer(3),
          headers: new Headers(),
          ok: true,
          status: 200,
          text: async () => ''
        })),
        writeFile: vi.fn(async (path) => {
          writes.push(path);
        })
      }
    });

    await expect(
      driver.download({
        outputPath: 'D:/videos/custom.mp4',
        sourceUrl: 'https://cdn.example.com/'
      })
    ).resolves.toMatchObject({
      outputPath: 'D:/videos/custom.mp4'
    });
    await expect(
      driver.download({
        outputDir: 'D:/videos',
        sourceUrl: 'https://cdn.example.com/'
      })
    ).resolves.toMatchObject({
      outputPath: 'D:\\videos\\video.mp4'
    });
    expect(writes).toEqual(['D:/videos/custom.mp4', 'D:\\videos\\video.mp4']);
  });

  it('defaults to the current directory when no output path or directory is provided', async () => {
    const driver = new DirectVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async () => ({
          arrayBuffer: async () => new ArrayBuffer(1),
          headers: new Headers(),
          ok: true,
          status: 200,
          text: async () => ''
        })),
        writeFile: vi.fn(async () => undefined)
      }
    });

    await expect(
      driver.download({
        sourceUrl: 'https://cdn.example.com/video.mp4'
      })
    ).resolves.toMatchObject({
      outputPath: 'video.mp4'
    });
  });
});
