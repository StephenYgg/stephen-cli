import { describe, expect, it, vi } from 'vitest';

import { HlsVideoDownloadDriver } from '../../src/video/download/hls-driver.js';

describe('HlsVideoDownloadDriver', () => {
  it('downloads playlist segments and merges them into a single ts file', async () => {
    const writes: Array<{ path: string; value: string }> = [];
    const driver = new HlsVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async (input) => {
          const url = String(input);

          if (url.endsWith('.m3u8')) {
            return {
              ok: true,
              status: 200,
              text: async () => '#EXTM3U\n#EXTINF:5,\nseg-a.ts\n#EXTINF:5,\nseg-b.ts\n',
              arrayBuffer: async () => new ArrayBuffer(0),
              headers: new Headers()
            };
          }

          return {
            ok: true,
            status: 200,
            text: async () => '',
            arrayBuffer: async () => Buffer.from(url.endsWith('seg-a.ts') ? 'AAA' : 'BBB'),
            headers: new Headers()
          };
        }),
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
      sourceUrl: 'https://cdn.example.com/master.m3u8'
    });

    expect(result.outputPath).toBe('D:\\videos\\master.ts');
    expect(writes).toEqual([
      {
        path: 'D:\\videos\\master.ts',
        value: 'AAABBB'
      }
    ]);
  });

  it('prepends EXT-X-MAP initialization data before media segments', async () => {
    const writes: Array<{ path: string; value: string }> = [];
    const driver = new HlsVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async (input) => {
          const url = String(input);

          if (url.endsWith('.m3u8')) {
            return {
              ok: true,
              status: 200,
              text: async () => '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:5,\nseg-a.m4s\n',
              arrayBuffer: async () => new ArrayBuffer(0),
              headers: new Headers()
            };
          }

          return {
            ok: true,
            status: 200,
            text: async () => '',
            arrayBuffer: async () => Buffer.from(url.endsWith('init.mp4') ? 'INIT' : 'SEG'),
            headers: new Headers()
          };
        }),
        writeFile: vi.fn(async (path, value) => {
          writes.push({
            path,
            value: Buffer.from(value).toString('utf8')
          });
        })
      }
    });

    await driver.download({
      sourceUrl: 'https://cdn.example.com/master.m3u8'
    });

    expect(writes).toEqual([
      {
        path: 'master.ts',
        value: 'INITSEG'
      }
    ]);
  });

  it('sends browser-like media headers for playlists and segments', async () => {
    const fetchCalls: Array<{ init?: RequestInit; url: string }> = [];
    const driver = new HlsVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async (input, init) => {
          const url = String(input);
          fetchCalls.push({ init, url });

          if (url.endsWith('.m3u8')) {
            return {
              ok: true,
              status: 200,
              text: async () => '#EXTM3U\n#EXTINF:5,\nseg-a.ts\n',
              arrayBuffer: async () => new ArrayBuffer(0),
              headers: new Headers()
            };
          }

          return {
            ok: true,
            status: 200,
            text: async () => '',
            arrayBuffer: async () => Buffer.from('SEG'),
            headers: new Headers()
          };
        }),
        writeFile: vi.fn(async () => undefined)
      }
    });

    await driver.download({
      sourceUrl: 'https://cdn.example.com/path/master.m3u8'
    });

    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0]?.init?.headers).toMatchObject({
      'user-agent': expect.stringContaining('Mozilla'),
      referer: 'https://cdn.example.com/'
    });
    expect(fetchCalls[1]?.init?.headers).toMatchObject({
      'user-agent': expect.stringContaining('Mozilla'),
      referer: 'https://cdn.example.com/'
    });
  });

  it('surfaces playlist and segment download failures as structured errors', async () => {
    const playlistFailure = new HlsVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async () => ({
          ok: false,
          status: 500,
          text: async () => '',
          arrayBuffer: async () => new ArrayBuffer(0),
          headers: new Headers()
        })),
        writeFile: vi.fn(async () => undefined)
      }
    });

    await expect(
      playlistFailure.download({
        sourceUrl: 'https://cdn.example.com/master.m3u8'
      })
    ).rejects.toMatchObject({
      code: 'VIDEO_DOWNLOAD_FAILED'
    });

    const segmentFailure = new HlsVideoDownloadDriver({
      runtime: {
        fetch: vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => '#EXTM3U\nseg-a.ts\n',
            arrayBuffer: async () => new ArrayBuffer(0),
            headers: new Headers()
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 403,
            text: async () => '',
            arrayBuffer: async () => new ArrayBuffer(0),
            headers: new Headers()
          }),
        writeFile: vi.fn(async () => undefined)
      }
    });

    await expect(
      segmentFailure.download({
        sourceUrl: 'https://cdn.example.com/master.m3u8'
      })
    ).rejects.toMatchObject({
      code: 'VIDEO_DOWNLOAD_FAILED'
    });
  });

  it('supports explicit output paths and playlists without an extension', async () => {
    const writes: string[] = [];
    const driver = new HlsVideoDownloadDriver({
      runtime: {
        fetch: vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => '#EXTM3U\nseg-a.ts\n',
            arrayBuffer: async () => new ArrayBuffer(0),
            headers: new Headers()
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => '',
            arrayBuffer: async () => Uint8Array.from([65, 66]).buffer,
            headers: new Headers()
          }),
        writeFile: vi.fn(async (path) => {
          writes.push(path);
        })
      }
    });

    await expect(
      driver.download({
        outputPath: 'D:/videos/custom.ts',
        sourceUrl: 'https://cdn.example.com/live'
      })
    ).resolves.toMatchObject({
      outputPath: 'D:/videos/custom.ts'
    });
    expect(writes).toEqual(['D:/videos/custom.ts']);

    const inferredDriver = new HlsVideoDownloadDriver({
      runtime: {
        fetch: vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => '#EXTM3U\nseg-a.ts\n',
            arrayBuffer: async () => new ArrayBuffer(0),
            headers: new Headers()
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => '',
            arrayBuffer: async () => new ArrayBuffer(1),
            headers: new Headers()
          }),
        writeFile: vi.fn(async (path) => {
          writes.push(path);
        })
      }
    });

    await expect(
      inferredDriver.download({
        outputDir: 'D:/videos',
        sourceUrl: 'https://cdn.example.com/live'
      })
    ).resolves.toMatchObject({
      outputPath: 'D:\\videos\\live.ts'
    });
  });
});
