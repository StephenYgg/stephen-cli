import { classifyVideoInput } from './resolver.js';
import { optional } from '../utils.js';
import { VideoCommandError, type VideoDownloadResult, type VideoSniffMode } from '../types.js';
import type { VideoSniffService } from '../sniff/service.js';
import type { DirectVideoDownloadDriver } from './direct-driver.js';
import type { HlsVideoDownloadDriver } from './hls-driver.js';
import type { BrowserDownloadDriver } from './browser-driver.js';
import type { VideoDownloadFileManager, VideoDownloadFilePlan } from './file-manager.js';

export interface VideoDownloadServiceDependencies {
  directDriver: Pick<DirectVideoDownloadDriver, 'download'>;
  hlsDriver: Pick<HlsVideoDownloadDriver, 'download'>;
  sniffService: Pick<VideoSniffService, 'sniff'>;
  browserDriver?: Pick<BrowserDownloadDriver, 'download'>;
  fileManager: Pick<VideoDownloadFileManager, 'cleanup' | 'finalize' | 'plan'>;
}

export class VideoDownloadService {
  private readonly directDriver: VideoDownloadServiceDependencies['directDriver'];
  private readonly hlsDriver: VideoDownloadServiceDependencies['hlsDriver'];
  private readonly sniffService: VideoDownloadServiceDependencies['sniffService'];
  private readonly browserDriver: VideoDownloadServiceDependencies['browserDriver'];
  private readonly fileManager: VideoDownloadServiceDependencies['fileManager'];

  constructor(dependencies: VideoDownloadServiceDependencies) {
    this.directDriver = dependencies.directDriver;
    this.hlsDriver = dependencies.hlsDriver;
    this.sniffService = dependencies.sniffService;
    this.browserDriver = dependencies.browserDriver;
    this.fileManager = dependencies.fileManager;
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

    if (classified.kind === 'page') {
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
      return this.downloadCandidate({
        candidateType: candidate.type,
        options,
        sourceUrl: candidate.url,
        title: sniffed.title,
        useBrowser: candidate.type === 'mp4' && this.browserDriver !== undefined
      });
    }

    if (classified.kind === 'm3u8') {
      return this.downloadCandidate({
        candidateType: 'm3u8',
        options,
        sourceUrl: classified.url,
        useBrowser: false
      });
    }

    return this.downloadCandidate({
      allowBrowserFallback: true,
      candidateType: 'mp4',
      options,
      sourceUrl: classified.url,
      useBrowser: this.browserDriver !== undefined
    });
  }

  private async downloadCandidate(input: {
    allowBrowserFallback?: boolean;
    candidateType: 'm3u8' | 'mp4';
    options: {
      outputDir?: string;
      outputPath?: string;
      noProxy?: boolean;
      proxyUrl?: string;
    };
    sourceUrl: string;
    title?: string | undefined;
    useBrowser: boolean;
  }): Promise<VideoDownloadResult> {
    const plan = this.fileManager.plan({
      mediaType: input.candidateType,
      ...optional('outputDir', input.options.outputDir),
      ...optional('outputPath', input.options.outputPath),
      sourceUrl: input.sourceUrl,
      ...optional('title', input.title)
    });
    const driverOptions = buildDriverOptions(input.options, input.sourceUrl, plan.tempPath);

    try {
      let transfer;

      if (input.candidateType === 'm3u8') {
        transfer = await this.hlsDriver.download(driverOptions);
      } else if (input.useBrowser && this.browserDriver) {
        try {
          transfer = await this.browserDriver.download(driverOptions);
        } catch (error) {
          if (!input.allowBrowserFallback || !isRecoverableBrowserDownloadError(error)) {
            throw error;
          }
          await this.cleanupAfterFailure(plan, error);
          transfer = await this.directDriver.download(driverOptions);
        }
      } else {
        transfer = await this.directDriver.download(driverOptions);
      }

      const finalization = await this.fileManager.finalize(plan);
      return {
        ...transfer,
        ...finalization
      };
    } catch (error) {
      await this.cleanupAfterFailure(plan, error);
      throw error;
    }
  }

  private async cleanupAfterFailure(plan: VideoDownloadFilePlan, originalError: unknown): Promise<void> {
    try {
      await this.fileManager.cleanup(plan);
    } catch (cleanupError) {
      throw new VideoCommandError(
        'VIDEO_TEMP_CLEANUP_FAILED',
        `Failed to remove temporary download ${plan.tempPath}.`,
        2,
        {
          cleanupCause: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          originalCause: originalError instanceof Error ? originalError.message : String(originalError)
        }
      );
    }
  }
}

function isRecoverableBrowserDownloadError(error: unknown): boolean {
  return (
    (error instanceof VideoCommandError && error.code === 'VIDEO_BROWSER_UNAVAILABLE') ||
    isBrowserDownloadTimeout(error)
  );
}

function buildDriverOptions(
  options: {
    noProxy?: boolean;
    proxyUrl?: string;
  },
  sourceUrl: string,
  outputPath: string
): {
  noProxy?: boolean;
  outputPath: string;
  proxyUrl?: string;
  sourceUrl: string;
} {
  return {
    ...optional('noProxy', options.noProxy),
    outputPath,
    ...optional('proxyUrl', options.proxyUrl),
    sourceUrl
  };
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
