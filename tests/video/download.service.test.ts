import { describe, expect, it, vi } from 'vitest';

import { VideoCommandError } from '../../src/video/types.js';
import { VideoDownloadService } from '../../src/video/download/service.js';

describe('VideoDownloadService', () => {
  describe('file finalization', () => {
    it('uses a page title for the file plan and finalizes the temporary download', async () => {
      const plan = {
        baseName: 'Example Video',
        directory: 'D:/videos',
        explicitOutputPath: false,
        extension: '.mp4',
        targetPath: 'D:/videos/Example Video.mp4',
        tempPath: 'D:/videos/.Example Video.mp4.download.part'
      };
      const fileManager = {
        cleanup: vi.fn(async () => undefined),
        finalize: vi.fn(async () => ({
          md5: '0123456789abcdef0123456789abcdef',
          outputPath: plan.targetPath,
          status: 'downloaded' as const
        })),
        plan: vi.fn(() => plan)
      };
      const directDriver = {
        download: vi.fn(async () => ({
          bytesWritten: 12,
          mediaType: 'mp4' as const,
          outputPath: plan.tempPath,
          sourceUrl: 'https://cdn.example.com/video.mp4'
        }))
      };
      const service = new VideoDownloadService({
        directDriver,
        fileManager,
        hlsDriver: { download: vi.fn() },
        sniffService: {
          sniff: vi.fn(async () => ({
            candidates: [
              {
                origin: 'html' as const,
                type: 'mp4' as const,
                url: 'https://cdn.example.com/video.mp4'
              }
            ],
            mode: 'http' as const,
            sourceUrl: 'https://example.com/watch',
            title: 'Example Video'
          }))
        }
      });

      await expect(service.download({
        input: 'https://example.com/watch',
        mode: 'http',
        outputDir: 'D:/videos'
      })).resolves.toEqual({
        bytesWritten: 12,
        md5: '0123456789abcdef0123456789abcdef',
        mediaType: 'mp4',
        outputPath: plan.targetPath,
        sourceUrl: 'https://cdn.example.com/video.mp4',
        status: 'downloaded'
      });
      expect(fileManager.plan).toHaveBeenCalledWith({
        mediaType: 'mp4',
        outputDir: 'D:/videos',
        sourceUrl: 'https://cdn.example.com/video.mp4',
        title: 'Example Video'
      });
      expect(directDriver.download).toHaveBeenCalledWith({
        outputPath: plan.tempPath,
        sourceUrl: 'https://cdn.example.com/video.mp4'
      });
      expect(fileManager.finalize).toHaveBeenCalledWith(plan);
    });

    it('returns an existing path when finalization detects an identical download', async () => {
      const plan = {
        baseName: 'video',
        directory: '.',
        explicitOutputPath: false,
        extension: '.mp4',
        targetPath: 'video.mp4',
        tempPath: '.video.mp4.download.part'
      };
      const service = new VideoDownloadService({
        directDriver: {
          download: vi.fn(async () => ({
            mediaType: 'mp4' as const,
            outputPath: plan.tempPath,
            sourceUrl: 'https://cdn.example.com/video.mp4'
          }))
        },
        fileManager: {
          cleanup: vi.fn(async () => undefined),
          finalize: vi.fn(async () => ({
            md5: 'same-md5',
            outputPath: 'video (2).mp4',
            status: 'already_downloaded' as const
          })),
          plan: vi.fn(() => plan)
        },
        hlsDriver: { download: vi.fn() },
        sniffService: { sniff: vi.fn() }
      });

      await expect(service.download({
        input: 'https://cdn.example.com/video.mp4',
        mode: 'http'
      })).resolves.toMatchObject({
        md5: 'same-md5',
        outputPath: 'video (2).mp4',
        status: 'already_downloaded'
      });
    });

    it('cleans up the planned temporary file when a driver fails', async () => {
      const plan = {
        baseName: 'video',
        directory: '.',
        explicitOutputPath: false,
        extension: '.mp4',
        targetPath: 'video.mp4',
        tempPath: '.video.mp4.download.part'
      };
      const fileManager = {
        cleanup: vi.fn(async () => undefined),
        finalize: vi.fn(),
        plan: vi.fn(() => plan)
      };
      const service = new VideoDownloadService({
        directDriver: {
          download: vi.fn(async () => {
            throw new Error('transfer failed');
          })
        },
        fileManager,
        hlsDriver: { download: vi.fn() },
        sniffService: { sniff: vi.fn() }
      });

      await expect(service.download({
        input: 'https://cdn.example.com/video.mp4',
        mode: 'http'
      })).rejects.toThrow('transfer failed');
      expect(fileManager.cleanup).toHaveBeenCalledWith(plan);
      expect(fileManager.finalize).not.toHaveBeenCalled();
    });
  });

  describe('browser driver routing', () => {
    it('uses browserDriver for direct mp4 URLs when available', async () => {
      const browserDriver = {
        download: vi.fn(async () => ({
          mediaType: 'mp4' as const,
          outputPath: 'D:\\videos\\browser-download.mp4',
          sourceUrl: 'https://cdn.example.com/video.mp4'
        }))
      };
      const directDriver = { download: vi.fn() };
      const hlsDriver = { download: vi.fn() };
      const sniffService = { sniff: vi.fn() };

      const service = createDownloadService({
        directDriver,
        hlsDriver,
        sniffService,
        browserDriver
      });

      await expect(
        service.download({
          input: 'https://cdn.example.com/video.mp4',
          mode: 'auto'
        })
      ).resolves.toMatchObject({
        mediaType: 'mp4'
      });

      expect(browserDriver.download).toHaveBeenCalledWith({
        outputPath: 'D:/videos/.download.part',
        sourceUrl: 'https://cdn.example.com/video.mp4'
      });
      expect(directDriver.download).not.toHaveBeenCalled();
    });

    it('uses hlsDriver for direct m3u8 URLs even when browserDriver is available', async () => {
      const browserDriver = {
        download: vi.fn(async () => ({
          mediaType: 'm3u8' as const,
          outputPath: 'D:\\videos\\browser-download.ts',
          sourceUrl: 'https://cdn.example.com/master.m3u8'
        }))
      };
      const directDriver = { download: vi.fn() };
      const hlsDriver = {
        download: vi.fn(async () => ({
          mediaType: 'm3u8' as const,
          outputPath: 'D:\\videos\\master.ts',
          sourceUrl: 'https://cdn.example.com/master.m3u8'
        }))
      };
      const sniffService = { sniff: vi.fn() };

      const service = createDownloadService({
        directDriver,
        hlsDriver,
        sniffService,
        browserDriver
      });

      await expect(
        service.download({
          input: 'https://cdn.example.com/master.m3u8',
          mode: 'auto'
        })
      ).resolves.toMatchObject({
        mediaType: 'm3u8'
      });

      expect(hlsDriver.download).toHaveBeenCalledWith({
        outputPath: 'D:/videos/.download.part',
        sourceUrl: 'https://cdn.example.com/master.m3u8'
      });
      expect(browserDriver.download).not.toHaveBeenCalled();
    });

    it('uses hlsDriver for HLS-disguised mp4 template urls', async () => {
      const templateUrl =
        'https://cdn.example.com/key=abc,end=1/media=hls4A/2026-08/_TPL_.mp4';
      const browserDriver = { download: vi.fn() };
      const directDriver = { download: vi.fn() };
      const hlsDriver = {
        download: vi.fn(async () => ({
          mediaType: 'm3u8' as const,
          outputPath: 'D:\\videos\\_TPL_.ts',
          sourceUrl: templateUrl
        }))
      };
      const sniffService = { sniff: vi.fn() };
      const service = createDownloadService({
        directDriver,
        hlsDriver,
        sniffService,
        browserDriver
      });

      await expect(
        service.download({
          input: templateUrl,
          mode: 'auto'
        })
      ).resolves.toMatchObject({
        mediaType: 'm3u8'
      });

      expect(hlsDriver.download).toHaveBeenCalledWith({
        outputPath: 'D:/videos/.download.part',
        sourceUrl: templateUrl
      });
      expect(browserDriver.download).not.toHaveBeenCalled();
      expect(directDriver.download).not.toHaveBeenCalled();
    });


    it('falls back to directDriver when browserDriver is unavailable for mp4', async () => {
      const browserDriver = {
        download: vi.fn(async () => {
          throw new VideoCommandError('VIDEO_BROWSER_UNAVAILABLE', 'Playwright not available', 2, undefined, true);
        })
      };
      const directDriver = {
        download: vi.fn(async () => ({
          mediaType: 'mp4' as const,
          outputPath: 'D:\\videos\\video.mp4',
          sourceUrl: 'https://cdn.example.com/video.mp4'
        }))
      };
      const hlsDriver = { download: vi.fn() };
      const sniffService = { sniff: vi.fn() };

      const service = createDownloadService({
        directDriver,
        hlsDriver,
        sniffService,
        browserDriver
      });

      await expect(
        service.download({
          input: 'https://cdn.example.com/video.mp4',
          mode: 'auto'
        })
      ).resolves.toMatchObject({
        mediaType: 'mp4'
      });

      expect(directDriver.download).toHaveBeenCalled();
    });

    it('falls back to directDriver when browserDriver cannot trigger a direct mp4 download event', async () => {
      const browserDriver = {
        download: vi.fn(async () => {
          throw new Error('browserContext.waitForEvent: Timeout 30000ms exceeded while waiting for event "download"');
        })
      };
      const directDriver = {
        download: vi.fn(async () => ({
          mediaType: 'mp4' as const,
          outputPath: 'D:\\videos\\video.mp4',
          sourceUrl: 'https://cdn.example.com/video.mp4'
        }))
      };
      const hlsDriver = { download: vi.fn() };
      const sniffService = { sniff: vi.fn() };

      const service = createDownloadService({
        directDriver,
        hlsDriver,
        sniffService,
        browserDriver
      });

      await expect(
        service.download({
          input: 'https://cdn.example.com/video.mp4',
          mode: 'auto'
        })
      ).resolves.toMatchObject({
        mediaType: 'mp4'
      });

      expect(directDriver.download).toHaveBeenCalledWith({
        outputPath: 'D:/videos/.download.part',
        sourceUrl: 'https://cdn.example.com/video.mp4'
      });
    });

    it('uses browserDriver for page URLs when available', async () => {
      const browserDriver = {
        download: vi.fn(async () => ({
          mediaType: 'mp4' as const,
          outputPath: 'D:\\videos\\page-download.mp4',
          sourceUrl: 'https://cdn.example.com/real-video.mp4'
        }))
      };
      const directDriver = { download: vi.fn() };
      const hlsDriver = { download: vi.fn() };
      const sniffService = {
        sniff: vi.fn(async () => ({
          candidates: [
            {
              type: 'mp4' as const,
              url: 'https://cdn.example.com/real-video.mp4',
              origin: 'network' as const,
              mimeType: 'video/mp4',
              confidence: 0.9
            }
          ],
          mode: 'browser' as const,
          sourceUrl: 'https://example.com/watch'
        }))
      };

      const service = createDownloadService({
        directDriver,
        hlsDriver,
        sniffService,
        browserDriver
      });

      await expect(
        service.download({
          input: 'https://example.com/watch',
          mode: 'auto'
        })
      ).resolves.toMatchObject({
        mediaType: 'mp4'
      });

      expect(sniffService.sniff).toHaveBeenCalled();
      expect(browserDriver.download).toHaveBeenCalledWith({
        outputPath: 'D:/videos/.download.part',
        sourceUrl: 'https://cdn.example.com/real-video.mp4'
      });
    });

    it('uses hlsDriver for sniffed HLS candidates from page urls when browserDriver is available', async () => {
      const hlsUrl = 'https://cdn.example.com/media=hls4A/2026-08/_TPL_.mp4';
      const browserDriver = { download: vi.fn() };
      const directDriver = { download: vi.fn() };
      const hlsDriver = {
        download: vi.fn(async () => ({
          mediaType: 'm3u8' as const,
          outputPath: 'D:\\videos\\_TPL_.ts',
          sourceUrl: hlsUrl
        }))
      };
      const sniffService = {
        sniff: vi.fn(async () => ({
          candidates: [
            {
              type: 'm3u8' as const,
              url: hlsUrl,
              origin: 'html' as const,
              mimeType: 'application/vnd.apple.mpegurl',
              confidence: 0.95
            }
          ],
          mode: 'http' as const,
          sourceUrl: 'https://example.com/watch'
        }))
      };
      const service = createDownloadService({
        directDriver,
        hlsDriver,
        sniffService,
        browserDriver
      });

      await expect(
        service.download({
          input: 'https://example.com/watch',
          mode: 'http'
        })
      ).resolves.toMatchObject({
        mediaType: 'm3u8'
      });

      expect(hlsDriver.download).toHaveBeenCalledWith({
        outputPath: 'D:/videos/.download.part',
        sourceUrl: hlsUrl
      });
      expect(browserDriver.download).not.toHaveBeenCalled();
    });
  });

  describe('fallback routing without browserDriver', () => {
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
      const service = createDownloadService({
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
        outputPath: 'D:/videos/.download.part',
        sourceUrl: 'https://cdn.example.com/video.mp4'
      });
      expect(hlsDriver.download).toHaveBeenCalledWith({
        outputPath: 'D:/videos/.download.part',
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
      const service = createDownloadService({
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
        outputPath: 'D:/videos/.download.part',
        sourceUrl: 'https://cdn.example.com/video.mp4'
      });
      expect(hlsDriver.download).toHaveBeenCalledWith({
        outputPath: 'D:/videos/.download.part',
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
      const service = createDownloadService({
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
        outputPath: 'D:/videos/.download.part',
        sourceUrl: 'https://cdn.example.com/video.mp4'
      });
      expect(hlsDriver.download).toHaveBeenCalledWith({
        outputPath: 'D:/videos/.download.part',
        sourceUrl: 'https://cdn.example.com/master.m3u8'
      });
    });

    it('passes all download options including proxy options through to driver', async () => {
      const directDriver = {
        download: vi.fn(async () => ({
          mediaType: 'mp4' as const,
          outputPath: 'out.mp4',
          sourceUrl: 'https://cdn.example.com/video.mp4'
        }))
      };
      const hlsDriver = { download: vi.fn() };
      const sniffService = {
        sniff: vi.fn(async () => {
          throw new Error('should not run');
        })
      };
      const service = createDownloadService({ directDriver, hlsDriver, sniffService });

      await service.download({
        input: 'https://cdn.example.com/video.mp4',
        mode: 'auto',
        outputDir: '/output',
        outputPath: '/output/video.mp4',
        noProxy: true,
        proxyUrl: 'http://proxy.example.com:8080'
      });

      // Verify ALL fields are passed through
      expect(directDriver.download).toHaveBeenCalledWith({
        outputPath: 'D:/videos/.download.part',
        noProxy: true,
        proxyUrl: 'http://proxy.example.com:8080',
        sourceUrl: 'https://cdn.example.com/video.mp4'
      });
    });

    it('omits undefined optional fields from driver call', async () => {
      const directDriver = {
        download: vi.fn(async () => ({
          mediaType: 'mp4' as const,
          outputPath: 'out.mp4',
          sourceUrl: 'https://cdn.example.com/video.mp4'
        }))
      };
      const hlsDriver = { download: vi.fn() };
      const sniffService = {
        sniff: vi.fn(async () => {
          throw new Error('should not run');
        })
      };
      const service = createDownloadService({ directDriver, hlsDriver, sniffService });

      await service.download({
        input: 'https://cdn.example.com/video.mp4',
        mode: 'auto'
        // no outputDir, outputPath, noProxy, or proxyUrl
      });

      // Verify only defined fields are passed
      expect(directDriver.download).toHaveBeenCalledWith({
        outputPath: 'D:/videos/.download.part',
        sourceUrl: 'https://cdn.example.com/video.mp4'
      });
    });
  });
});

function createDownloadService(
  dependencies: Omit<ConstructorParameters<typeof VideoDownloadService>[0], 'fileManager'>
): VideoDownloadService {
  return new VideoDownloadService({
    ...dependencies,
    fileManager: {
      cleanup: vi.fn(async () => undefined),
      finalize: vi.fn(async (plan) => ({
        md5: 'test-md5',
        outputPath: plan.targetPath,
        status: 'downloaded' as const
      })),
      plan: vi.fn((options) => {
        const extension = options.mediaType === 'm3u8' ? '.ts' : '.mp4';
        const targetPath = options.outputPath ?? `D:/videos/download${extension}`;
        return {
          baseName: 'download',
          directory: 'D:/videos',
          explicitOutputPath: options.outputPath !== undefined,
          extension,
          targetPath,
          tempPath: 'D:/videos/.download.part'
        };
      })
    }
  });
}
