import { classifyVideoInput } from './resolver.js';
import { VideoCommandError, type VideoDownloadResult, type VideoSniffMode } from '../types.js';
import type { VideoSniffService } from '../sniff/service.js';
import type { DirectVideoDownloadDriver } from './direct-driver.js';
import type { HlsVideoDownloadDriver } from './hls-driver.js';

export interface VideoDownloadServiceDependencies {
  directDriver: Pick<DirectVideoDownloadDriver, 'download'>;
  hlsDriver: Pick<HlsVideoDownloadDriver, 'download'>;
  sniffService: Pick<VideoSniffService, 'sniff'>;
}

export class VideoDownloadService {
  private readonly directDriver: VideoDownloadServiceDependencies['directDriver'];
  private readonly hlsDriver: VideoDownloadServiceDependencies['hlsDriver'];
  private readonly sniffService: VideoDownloadServiceDependencies['sniffService'];

  constructor(dependencies: VideoDownloadServiceDependencies) {
    this.directDriver = dependencies.directDriver;
    this.hlsDriver = dependencies.hlsDriver;
    this.sniffService = dependencies.sniffService;
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

    if (classified.kind === 'mp4') {
      return this.directDriver.download(buildDownloadTargetOptions(options, classified.url));
    }

    if (classified.kind === 'm3u8') {
      return this.hlsDriver.download(buildDownloadTargetOptions(options, classified.url));
    }

    const sniffed = await this.sniffService.sniff({
      mode: options.mode,
      sourceUrl: classified.url,
      noProxy: options.noProxy,
      proxyUrl: options.proxyUrl
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

/* c8 ignore start */
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
    ...(options.outputDir ? { outputDir: options.outputDir } : {}),
    ...(options.outputPath ? { outputPath: options.outputPath } : {}),
    ...(options.noProxy !== undefined ? { noProxy: options.noProxy } : {}),
    ...(options.proxyUrl ? { proxyUrl: options.proxyUrl } : {}),
    sourceUrl
  };
}
/* c8 ignore end */
