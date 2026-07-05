import { describe, expect, it, vi } from 'vitest';

import { DirectVideoDownloadDriver } from '../../src/video/download/direct-driver.js';

describe('DirectVideoDownloadDriver', () => {
  it('downloads an mp4 response and infers the output filename from the url', async () => {
    const writes: Array<{ path: string; value: string }> = [];
    const fetchCalls: Array<{ url: string; opts?: RequestInit }> = [];
    const driver = new DirectVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async (url, opts) => {
          fetchCalls.push({ url, opts });
          return {
          arrayBuffer: async () => Buffer.from('video-bytes'),
          headers: new Headers({
            'content-type': 'video/mp4'
          }),
          ok: true,
          status: 200,
          text: async () => ''
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
    expect(fetchCalls[0]!.opts?.headers).toMatchObject({
      'user-agent': expect.stringContaining('Mozilla'),
      referer: 'https://cdn.example.com/'
    });
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

  it('prints completion message after download finishes without fake progress bar', async () => {
    const stderrOutputs: string[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => { stderrOutputs.push(String(args.join(' '))); };

    const driver = new DirectVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async () => ({
          arrayBuffer: async () => Buffer.from('video-bytes'),
          headers: new Headers({ 'content-length': '11' }),
          ok: true,
          status: 200,
          text: async () => ''
        })),
        writeFile: vi.fn(async () => undefined)
      }
    });

    await driver.download({ sourceUrl: 'https://cdn.example.com/video.mp4' });

    console.error = origError;

    // Should print completion message (not instant-complete progress bar)
    expect(stderrOutputs.some(o => o.includes('Downloaded') || o.includes('video-bytes'))).toBe(true);
    // Should NOT contain percentage like "0%" or "100%" (no fake progress bar)
    expect(stderrOutputs.some(o => o.includes('%'))).toBe(false);
  });

  it('warns when proxy connection fails and falls back to direct', async () => {
    const stderrOutputs: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => { stderrOutputs.push(String(args.join(' '))); };

    const driver = new DirectVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async (url, opts) => {
          // When agent is present (proxy mode), simulate proxy failure
          if ((opts as any)?.agent) {
            throw new Error('proxy connection refused');
          }
          // Direct fallback succeeds
          return {
            arrayBuffer: async () => Buffer.from('video'),
            headers: new Headers({ 'content-length': '5' }),
            ok: true,
            status: 200,
            text: async () => ''
          };
        }),
        writeFile: vi.fn(async () => undefined)
      }
    });

    await driver.download({
      sourceUrl: 'https://cdn.example.com/video.mp4',
      proxyUrl: 'http://invalid-proxy:9999'
    });

    console.warn = origWarn;

    const joined = stderrOutputs.join(' ');
    expect(joined.includes('Proxy') || joined.includes('proxy')).toBe(true);
    expect(joined.includes('failed') || joined.includes('fallback')).toBe(true);
  });

  it('uses HTTP_PROXY env var when no explicit proxyUrl is provided and no default exists', async () => {
    const originalProxy = process.env.HTTP_PROXY;
    process.env.HTTP_PROXY = 'http://env-proxy:3128';

    const fetchCalls: Array<{ url: string; opts?: unknown }> = [];
    const driver = new DirectVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async (url, opts) => {
          fetchCalls.push({ url, opts });
          return {
            arrayBuffer: async () => Buffer.from('v'),
            headers: new Headers({ 'content-length': '1' }),
            ok: true,
            status: 200,
            text: async () => ''
          };
        }),
        writeFile: vi.fn(async () => undefined)
      }
    });

    await driver.download({ sourceUrl: 'https://cdn.example.com/video.mp4' });

    process.env.HTTP_PROXY = originalProxy ?? '';

    // Verify an agent was passed (proxy was used with env var URL)
    expect((fetchCalls[0]!.opts as any)?.agent).toBeDefined();
  });

  it('explicit proxyUrl takes precedence over HTTP_PROXY env var', async () => {
    const originalProxy = process.env.HTTP_PROXY;
    process.env.HTTP_PROXY = 'http://env-proxy:3128';

    const stderrOutputs: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => { stderrOutputs.push(String(args.join(' '))); };

    const driver = new DirectVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async (url, opts) => {
          // When agent is present (proxy mode), simulate proxy failure to capture URL
          if ((opts as any)?.agent) {
            throw new Error('proxy connection refused');
          }
          return {
            arrayBuffer: async () => Buffer.from('video'),
            headers: new Headers({ 'content-length': '5' }),
            ok: true,
            status: 200,
            text: async () => ''
          };
        }),
        writeFile: vi.fn(async () => undefined)
      }
    });

    await driver.download({
      sourceUrl: 'https://cdn.example.com/video.mp4',
      proxyUrl: 'http://explicit-proxy:8888'
    });

    console.warn = origWarn;
    process.env.HTTP_PROXY = originalProxy ?? '';

    // The warning should mention the explicit proxy URL, not the env var
    const joined = stderrOutputs.join(' ');
    expect(joined.includes('explicit-proxy')).toBe(true);
    expect(joined.includes('env-proxy')).toBe(false);
  });
});
