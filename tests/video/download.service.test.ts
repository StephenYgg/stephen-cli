import { describe, expect, it, vi } from 'vitest';

import { VideoDownloadService } from '../../src/video/download/service.js';

describe('VideoDownloadService', () => {
  it('routes page results to the correct driver and errors when no candidate exists', async () => {
    const directDriver = {
      download: vi.fn(async () => ({
        mediaType: 'mp4' as const,
        outputPath: 'D:\\videos\\video.mp4',
        sourceUrl: 'https://cdn.example.com/video.mp4'
      }))
    };
    const hlsDriver = {
      download: vi.fn(async () => ({
        mediaType: 'm3u8' as const,
        outputPath: 'D:\\videos\\master.ts',
        sourceUrl: 'https://cdn.example.com/master.m3u8'
      }))
    };
    const sniffService = {
      sniff: vi
        .fn()
        .mockResolvedValueOnce({
          candidates: [
            {
              type: 'mp4',
              url: 'https://cdn.example.com/video.mp4',
              origin: 'network',
              mimeType: 'video/mp4',
              confidence: 0.9
            }
          ],
          mode: 'browser',
          sourceUrl: 'https://example.com/watch/mp4'
        })
        .mockResolvedValueOnce({
          candidates: [
            {
              type: 'm3u8',
              url: 'https://cdn.example.com/master.m3u8',
              origin: 'network',
              mimeType: 'application/vnd.apple.mpegurl',
              confidence: 0.9
            }
          ],
          mode: 'browser',
          sourceUrl: 'https://example.com/watch/m3u8'
        })
        .mockResolvedValueOnce({
          candidates: [],
          mode: 'http',
          sourceUrl: 'https://example.com/watch/empty'
        })
    };
    const service = new VideoDownloadService({
      directDriver,
      hlsDriver,
      sniffService
    });

    await expect(
      service.download({
        input: 'https://example.com/watch/mp4',
        mode: 'auto'
      })
    ).resolves.toMatchObject({
      mediaType: 'mp4'
    });
    await expect(
      service.download({
        input: 'https://example.com/watch/m3u8',
        mode: 'auto'
      })
    ).resolves.toMatchObject({
      mediaType: 'm3u8'
    });
    await expect(
      service.download({
        input: 'https://example.com/watch/empty',
        mode: 'auto'
      })
    ).rejects.toMatchObject({
      code: 'VIDEO_NO_CANDIDATE'
    });
    expect(directDriver.download).toHaveBeenCalledWith({
      sourceUrl: 'https://cdn.example.com/video.mp4'
    });
    expect(hlsDriver.download).toHaveBeenCalledWith({
      sourceUrl: 'https://cdn.example.com/master.m3u8'
    });
  });

  it('routes direct media inputs without sniffing the page', async () => {
    const directDriver = {
      download: vi.fn(async () => ({
        mediaType: 'mp4' as const,
        outputPath: 'D:\\videos\\video.mp4',
        sourceUrl: 'https://cdn.example.com/video.mp4'
      }))
    };
    const hlsDriver = {
      download: vi.fn(async () => ({
        mediaType: 'm3u8' as const,
        outputPath: 'D:\\videos\\master.ts',
        sourceUrl: 'https://cdn.example.com/master.m3u8'
      }))
    };
    const sniffService = {
      sniff: vi.fn(async () => {
        throw new Error('should not run');
      })
    };
    const service = new VideoDownloadService({
      directDriver,
      hlsDriver,
      sniffService
    });

    await expect(
      service.download({
        input: 'https://cdn.example.com/video.mp4',
        mode: 'auto',
        outputDir: 'D:/videos',
        outputPath: 'D:/videos/custom.mp4'
      })
    ).resolves.toMatchObject({
      mediaType: 'mp4'
    });
    await expect(
      service.download({
        input: 'https://cdn.example.com/master.m3u8',
        mode: 'auto',
        outputDir: 'D:/videos'
      })
    ).resolves.toMatchObject({
      mediaType: 'm3u8'
    });
    expect(sniffService.sniff).not.toHaveBeenCalled();
    expect(directDriver.download).toHaveBeenCalledWith({
      outputDir: 'D:/videos',
      outputPath: 'D:/videos/custom.mp4',
      sourceUrl: 'https://cdn.example.com/video.mp4'
    });
    expect(hlsDriver.download).toHaveBeenCalledWith({
      outputDir: 'D:/videos',
      sourceUrl: 'https://cdn.example.com/master.m3u8'
    });
  });

  it('passes through explicit output paths when routing sniffed candidates', async () => {
    const directDriver = {
      download: vi.fn(async () => ({
        mediaType: 'mp4' as const,
        outputPath: 'D:/videos/custom.mp4',
        sourceUrl: 'https://cdn.example.com/video.mp4'
      }))
    };
    const hlsDriver = {
      download: vi.fn(async () => ({
        mediaType: 'm3u8' as const,
        outputPath: 'D:/videos/custom.ts',
        sourceUrl: 'https://cdn.example.com/master.m3u8'
      }))
    };
    const sniffService = {
      sniff: vi
        .fn()
        .mockResolvedValueOnce({
          candidates: [
            {
              type: 'mp4',
              url: 'https://cdn.example.com/video.mp4',
              origin: 'network',
              mimeType: 'video/mp4',
              confidence: 0.8
            }
          ],
          mode: 'browser',
          sourceUrl: 'https://example.com/watch'
        })
        .mockResolvedValueOnce({
          candidates: [
            {
              type: 'm3u8',
              url: 'https://cdn.example.com/master.m3u8',
              origin: 'network',
              mimeType: 'application/vnd.apple.mpegurl',
              confidence: 0.8
            }
          ],
          mode: 'browser',
          sourceUrl: 'https://example.com/watch'
        })
    };
    const service = new VideoDownloadService({
      directDriver,
      hlsDriver,
      sniffService
    });

    await service.download({
      input: 'https://example.com/watch',
      mode: 'auto',
      outputPath: 'D:/videos/custom.mp4'
    });
    await service.download({
      input: 'https://example.com/watch',
      mode: 'auto',
      outputPath: 'D:/videos/custom.ts'
    });

    expect(directDriver.download).toHaveBeenCalledWith({
      outputPath: 'D:/videos/custom.mp4',
      sourceUrl: 'https://cdn.example.com/video.mp4'
    });
    expect(hlsDriver.download).toHaveBeenCalledWith({
      outputPath: 'D:/videos/custom.ts',
      sourceUrl: 'https://cdn.example.com/master.m3u8'
    });
  });
});
