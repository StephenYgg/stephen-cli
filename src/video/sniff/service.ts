import { rankVideoCandidates } from './candidate.js';
import type { VideoSniffMode, VideoSniffProviderResult, VideoSniffResult } from '../types.js';
import { optional } from '../utils.js';

export interface VideoSniffServiceDependencies {
  browserProvider: (
    sourceUrl: string,
    options?: { noProxy?: boolean; proxyUrl?: string }
  ) => Promise<VideoSniffProviderResult>;
  httpProvider: (
    sourceUrl: string,
    options?: { noProxy?: boolean; proxyUrl?: string }
  ) => Promise<VideoSniffProviderResult>;
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
      const providerResult = await this.browserProvider(options.sourceUrl, providerOptions);
      if (providerResult.candidates.length > 0) {
        return this.createResult('browser', options.sourceUrl, providerResult);
      }
    } catch (error) {
      if (!(error instanceof Error && 'recoverable' in error && error.recoverable === true)) {
        throw error;
      }
    }

    return this.createResult(
      'http',
      options.sourceUrl,
      await this.httpProvider(options.sourceUrl, providerOptions)
    );
  }

  private createResult(
    mode: 'browser' | 'http',
    sourceUrl: string,
    providerResult: VideoSniffProviderResult
  ): VideoSniffResult {
    return {
      candidates: rankVideoCandidates(providerResult.candidates),
      mode,
      sourceUrl,
      title: providerResult.title
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
