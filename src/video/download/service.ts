import { classifyVideoInput } from './resolver.js';
import { optional } from '../utils.js';
import { VideoCommandError, type VideoDownloadResult, type VideoSniffMode } from '../types.js';
import type { VideoSniffService } from '../sniff/service.js';
import type { DirectVideoDownloadDriver } from './direct-driver.js';
import type { HlsVideoDownloadDriver } from './hls-driver.js';
import type { BrowserDownloadDriver } from './browser-driver.js';

export interface VideoDownloadServiceDependencies {
  directDriver: Pick<DirectVideoDownloadDriver, 'download'>;
  hlsDriver: Pick<HlsVideoDownloadDriver, 'download'>;
  sniffService: Pick<VideoSniffService, 'sniff'>;
  browserDriver?: Pick<BrowserDownloadDriver, 'download'>;
}

export class VideoDownloadService {
  private readonly directDriver: VideoDownloadServiceDependencies['directDriver'];
  private readonly hlsDriver: VideoDownloadServiceDependencies['hlsDriver'];
  private readonly sniffService: VideoDownloadServiceDependencies['sniffService'];
  private readonly browserDriver: VideoDownloadServiceDependencies['browserDriver'];

  constructor(dependencies: VideoDownloadServiceDependencies) {
    this.directDriver = dependencies.directDriver;
    this.hlsDriver = dependencies.hlsDriver;
    this.sniffService = dependencies.sniffService;
    this.browserDriver = dependencies.browserDriver;
  }

  async download(options: {
    input: string;
    mode: VideoSniffMode;
    outputDir?: string;
    outputPath?: string;
    noProxy?: boolean;
    proxyUrl?: string;
  }): Promise<VideoDownloadResult> {
    const classified = classifyVideoInput(options.input);

    // For page URLs, use browser driver if available (respects system proxy, handles cookies/sessions)
    if (classified.kind === 'page' && this.browserDriver) {
      const sniffed = await this.sniffService.sniff({
        mode: options.mode,
        sourceUrl: classified.url,
        ...buildProxyOptions(options)
      });
      const candidate = sniffed.candidates[0];
      if (!candidate) {
        throw new VideoCommandError(
          'VIDEO_NO_CANDIDATE',
          'No supported media candidate was detected for the provided input.'
        );
      }
      if (candidate.type === 'm3u8') {
        return this.hlsDriver.download(buildDownloadTargetOptions(options, candidate.url));
      }
      return this.browserDriver.download(buildDownloadTargetOptions(options, candidate.url));
    }

    if (classified.kind === 'm3u8') {
      return this.hlsDriver.download(buildDownloadTargetOptions(options, classified.url));
    }

    // For direct mp4 URLs, try browser driver first if available (handles cookie/session auth).
    // Then fall back to direct fetch.
    if (this.browserDriver) {
      try {
        return await this.browserDriver.download(buildDownloadTargetOptions(options, classified.url));
      } catch (error) {
        // If browser driver fails due to PLAYWRIGHT not available, fall through to direct
        if (error instanceof VideoCommandError && error.code === 'VIDEO_BROWSER_UNAVAILABLE') {
          // Browser not available, fall through to direct drivers
        } else if (!isBrowserDownloadTimeout(error)) {
          throw error;
        }
      }
    }

    // Direct drivers fallback
    if (classified.kind === 'mp4') {
      return this.directDriver.download(buildDownloadTargetOptions(options, classified.url));
    }

    // Fallback: sniff then use direct/hls driver
    const sniffed = await this.sniffService.sniff({
      mode: options.mode,
      sourceUrl: classified.url,
      ...buildProxyOptions(options)
    });
    const candidate = sniffed.candidates[0];

    if (!candidate) {
      throw new VideoCommandError(
        'VIDEO_NO_CANDIDATE',
        'No supported media candidate was detected for the provided input.'
      );
    }

    if (candidate.type === 'mp4') {
      return this.directDriver.download(buildDownloadTargetOptions(options, candidate.url));
    }

    return this.hlsDriver.download(buildDownloadTargetOptions(options, candidate.url));
  }
}

function isBrowserDownloadTimeout(error: unknown): boolean {
  return error instanceof Error && error.message.includes('waiting for event "download"');
}

function buildProxyOptions(options: {
  noProxy?: boolean;
  proxyUrl?: string;
}): {
  noProxy?: boolean;
  proxyUrl?: string;
} {
  return {
    ...(options.noProxy === undefined ? {} : { noProxy: options.noProxy }),
    ...(options.proxyUrl === undefined ? {} : { proxyUrl: options.proxyUrl })
  };
}

function buildDownloadTargetOptions(
  options: {
    outputDir?: string;
    outputPath?: string;
    noProxy?: boolean;
    proxyUrl?: string;
  },
  sourceUrl: string
): {
  outputDir?: string;
  outputPath?: string;
  sourceUrl: string;
  noProxy?: boolean;
  proxyUrl?: string;
} {
  return {
    ...optional('outputDir', options.outputDir),
    ...optional('outputPath', options.outputPath),
    ...optional('noProxy', options.noProxy),
    ...optional('proxyUrl', options.proxyUrl),
    sourceUrl
  };
}
