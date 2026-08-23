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

  it('attaches a proxy dispatcher to playlist and segment fetches', async () => {
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
      proxyUrl: 'http://127.0.0.1:7890',
      sourceUrl: 'https://cdn.example.com/path/master.m3u8'
    });

    expect(fetchCalls).toHaveLength(2);
    for (const call of fetchCalls) {
      expect((call.init as { dispatcher?: unknown } | undefined)?.dispatcher).toBeDefined();
    }
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

  it('resolves master playlists to the highest-bandwidth variant before downloading segments', async () => {
    const fetched: string[] = [];
    const writes: Array<{ path: string; value: string }> = [];
    const driver = new HlsVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async (input) => {
          const url = String(input);
          fetched.push(url);

          if (url.endsWith('/_TPL_.mp4')) {
            return {
              ok: true,
              status: 200,
              text: async () =>
                [
                  '#EXTM3U',
                  '#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=9000000,BANDWIDTH=800000,RESOLUTION=426x240',
                  'low.mp4.m3u8',
                  '#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=1000000,BANDWIDTH=3500000,RESOLUTION=1280x720',
                  '',
                  'hq.mp4.m3u8',
                  '#EXT-X-STREAM-INF:BANDWIDTH=1600000,RESOLUTION=854x480',
                  '#EXT-X-INDEPENDENT-SEGMENTS',
                  'mid.mp4.m3u8'
                ].join('\n'),
              arrayBuffer: async () => new ArrayBuffer(0),
              headers: new Headers()
            };
          }

          if (url.endsWith('hq.mp4.m3u8')) {
            return {
              ok: true,
              status: 200,
              text: async () => '#EXTM3U\n#EXTINF:4,\nseg-a.ts\n#EXTINF:4,\nseg-b.ts\n',
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
      sourceUrl: 'https://cdn.example.com/media=hls4A/2026-08/_TPL_.mp4'
    });

    expect(fetched).toEqual([
      'https://cdn.example.com/media=hls4A/2026-08/_TPL_.mp4',
      'https://cdn.example.com/media=hls4A/2026-08/hq.mp4.m3u8',
      'https://cdn.example.com/media=hls4A/2026-08/seg-a.ts',
      'https://cdn.example.com/media=hls4A/2026-08/seg-b.ts'
    ]);
    expect(result.outputPath).toBe('D:\\videos\\_TPL_.ts');
    expect(writes).toEqual([
      {
        path: 'D:\\videos\\_TPL_.ts',
        value: 'AAABBB'
      }
    ]);
  });

  it('picks the first variant when STREAM-INF omits BANDWIDTH', async () => {
    const fetched: string[] = [];
    const driver = new HlsVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async (input) => {
          const url = String(input);
          fetched.push(url);

          if (url.endsWith('master.m3u8')) {
            return {
              ok: true,
              status: 200,
              text: async () =>
                '#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=640x360\nfirst.m3u8\n#EXT-X-STREAM-INF:RESOLUTION=1280x720\nsecond.m3u8\n',
              arrayBuffer: async () => new ArrayBuffer(0),
              headers: new Headers()
            };
          }

          if (url.endsWith('.m3u8')) {
            return {
              ok: true,
              status: 200,
              text: async () => '#EXTM3U\nseg-a.ts\n',
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
      sourceUrl: 'https://cdn.example.com/master.m3u8'
    });

    expect(fetched).toContain('https://cdn.example.com/first.m3u8');
    expect(fetched).not.toContain('https://cdn.example.com/second.m3u8');
  });

  it('fails when a master variant playlist cannot be downloaded', async () => {
    const driver = new HlsVideoDownloadDriver({
      runtime: {
        fetch: vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nvariant.m3u8\n',
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
      driver.download({
        sourceUrl: 'https://cdn.example.com/master.m3u8'
      })
    ).rejects.toMatchObject({
      code: 'VIDEO_DOWNLOAD_FAILED'
    });
  });

  it('fails when a media playlist has no segments', async () => {
    const driver = new HlsVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async () => ({
          ok: true,
          status: 200,
          text: async () => '#EXTM3U\n#EXT-X-ENDLIST\n',
          arrayBuffer: async () => new ArrayBuffer(0),
          headers: new Headers()
        })),
        writeFile: vi.fn(async () => undefined)
      }
    });

    await expect(
      driver.download({
        sourceUrl: 'https://cdn.example.com/empty.m3u8'
      })
    ).rejects.toMatchObject({
      code: 'VIDEO_DOWNLOAD_FAILED'
    });
  });

  it('keeps segment downloads bounded under a long playlist', async () => {
    const segmentCount = 20;
    const segmentUrls = Array.from(
      { length: segmentCount },
      (_, index) => `https://cdn.example.com/seg-${index}.ts`
    );
    let inFlight = 0;
    let maxInFlight = 0;
    const driver = new HlsVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async (input) => {
          const url = String(input);
          if (url.endsWith('.m3u8')) {
            return {
              ok: true,
              status: 200,
              text: async () => segmentUrls.join('\n'),
              arrayBuffer: async () => new ArrayBuffer(0),
              headers: new Headers()
            };
          }

          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 15));
          inFlight -= 1;
          return {
            ok: true,
            status: 200,
            text: async () => '',
            arrayBuffer: async () => Buffer.from('S'),
            headers: new Headers()
          };
        }),
        writeFile: vi.fn(async () => undefined)
      }
    });

    await driver.download({
      sourceUrl: 'https://cdn.example.com/master.m3u8'
    });

    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(8);
  });
});

