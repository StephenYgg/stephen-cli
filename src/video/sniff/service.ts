import { rankVideoCandidates } from './candidate.js';
import type { VideoCandidate, VideoSniffMode, VideoSniffResult } from '../types.js';
import { optional } from '../utils.js';

export interface VideoSniffServiceDependencies {
  browserProvider: (sourceUrl: string, options?: { noProxy?: boolean; proxyUrl?: string }) => Promise<VideoCandidate[]>;
  httpProvider: (sourceUrl: string, options?: { noProxy?: boolean; proxyUrl?: string }) => Promise<VideoCandidate[]>;
}

export class VideoSniffService {
  private readonly browserProvider: VideoSniffServiceDependencies['browserProvider'];
  private readonly httpProvider: VideoSniffServiceDependencies['httpProvider'];

  constructor(dependencies: VideoSniffServiceDependencies) {
    this.browserProvider = dependencies.browserProvider;
    this.httpProvider = dependencies.httpProvider;
  }

  async sniff(options: { mode: VideoSniffMode; sourceUrl: string; noProxy?: boolean; proxyUrl?: string }): Promise<VideoSniffResult> {
    const providerOptions = buildProviderOptions(options);

    if (options.mode === 'http') {
      return this.createResult('http', options.sourceUrl, await this.httpProvider(options.sourceUrl, providerOptions));
    }

    if (options.mode === 'browser') {
      return this.createResult(
        'browser',
        options.sourceUrl,
        await this.browserProvider(options.sourceUrl, providerOptions)
      );
    }

    try {
      return this.createResult(
        'browser',
        options.sourceUrl,
        await this.browserProvider(options.sourceUrl, providerOptions)
      );
    } catch (error) {
      if (error instanceof Error && 'recoverable' in error && error.recoverable === true) {
        return this.createResult('http', options.sourceUrl, await this.httpProvider(options.sourceUrl, providerOptions));
      }

      throw error;
    }
  }

  private createResult(
    mode: 'browser' | 'http',
    sourceUrl: string,
    candidates: VideoCandidate[]
  ): VideoSniffResult {
    return {
      candidates: rankVideoCandidates(candidates),
      mode,
      sourceUrl
    };
  }
}

function buildProviderOptions(options: {
  noProxy?: boolean;
  proxyUrl?: string;
}): {
  noProxy?: boolean;
  proxyUrl?: string;
} {
  return {
    ...optional('noProxy', options.noProxy),
    ...optional('proxyUrl', options.proxyUrl)
  };
}
