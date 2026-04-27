import { describe, expect, it, vi } from 'vitest';

import { VideoSniffService } from '../../src/video/sniff/service.js';

describe('VideoSniffService', () => {
  it('uses browser results first in auto mode and falls back to http on recoverable browser errors', async () => {
    const browserProvider = vi.fn(async () => {
      throw Object.assign(new Error('missing browser runtime'), {
        code: 'VIDEO_BROWSER_UNAVAILABLE',
        recoverable: true
      });
    });
    const httpProvider = vi.fn(async () => [
      {
        type: 'm3u8' as const,
        url: 'https://cdn.example.com/master.m3u8',
        origin: 'html' as const,
        mimeType: 'application/vnd.apple.mpegurl',
        confidence: 0.75
      }
    ]);
    const service = new VideoSniffService({
      browserProvider,
      httpProvider
    });

    const result = await service.sniff({
      mode: 'auto',
      sourceUrl: 'https://example.com/watch/1'
    });

    expect(result).toEqual({
      candidates: [
        {
          confidence: 0.75,
          mimeType: 'application/vnd.apple.mpegurl',
          origin: 'html',
          type: 'm3u8',
          url: 'https://cdn.example.com/master.m3u8'
        }
      ],
      mode: 'http',
      sourceUrl: 'https://example.com/watch/1'
    });
    expect(browserProvider).toHaveBeenCalledTimes(1);
    expect(httpProvider).toHaveBeenCalledTimes(1);
  });

  it('returns browser candidates directly in browser mode', async () => {
    const service = new VideoSniffService({
      browserProvider: vi.fn(async () => [
        {
          type: 'mp4' as const,
          url: 'https://cdn.example.com/video.mp4',
          origin: 'network' as const,
          mimeType: 'video/mp4',
          confidence: 0.9
        }
      ]),
      httpProvider: vi.fn(async () => [])
    });

    await expect(
      service.sniff({
        mode: 'browser',
        sourceUrl: 'https://example.com/watch/2'
      })
    ).resolves.toEqual({
      candidates: [
        {
          confidence: 0.9,
          mimeType: 'video/mp4',
          origin: 'network',
          type: 'mp4',
          url: 'https://cdn.example.com/video.mp4'
        }
      ],
      mode: 'browser',
      sourceUrl: 'https://example.com/watch/2'
    });
  });

  it('uses the http provider directly in http mode', async () => {
    const browserProvider = vi.fn(async () => []);
    const httpProvider = vi.fn(async () => []);
    const service = new VideoSniffService({
      browserProvider,
      httpProvider
    });

    await expect(
      service.sniff({
        mode: 'http',
        sourceUrl: 'https://example.com/watch/3'
      })
    ).resolves.toEqual({
      candidates: [],
      mode: 'http',
      sourceUrl: 'https://example.com/watch/3'
    });
    expect(browserProvider).not.toHaveBeenCalled();
    expect(httpProvider).toHaveBeenCalledTimes(1);
  });

  it('rethrows unrecoverable browser errors in auto mode', async () => {
    const service = new VideoSniffService({
      browserProvider: vi.fn(async () => {
        throw Object.assign(new Error('boom'), {
          code: 'VIDEO_BROWSER_FAILED',
          recoverable: false
        });
      }),
      httpProvider: vi.fn(async () => [])
    });

    await expect(
      service.sniff({
        mode: 'auto',
        sourceUrl: 'https://example.com/watch/4'
      })
    ).rejects.toMatchObject({
      message: 'boom'
    });
  });
});
