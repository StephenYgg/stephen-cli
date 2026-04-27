import { rankVideoCandidates } from './candidate.js';
import type { VideoCandidate, VideoSniffMode, VideoSniffResult } from '../types.js';

export interface VideoSniffServiceDependencies {
  browserProvider: (sourceUrl: string) => Promise<VideoCandidate[]>;
  httpProvider: (sourceUrl: string) => Promise<VideoCandidate[]>;
}

export class VideoSniffService {
  private readonly browserProvider: VideoSniffServiceDependencies['browserProvider'];
  private readonly httpProvider: VideoSniffServiceDependencies['httpProvider'];

  constructor(dependencies: VideoSniffServiceDependencies) {
    this.browserProvider = dependencies.browserProvider;
    this.httpProvider = dependencies.httpProvider;
  }

  async sniff(options: { mode: VideoSniffMode; sourceUrl: string }): Promise<VideoSniffResult> {
    if (options.mode === 'http') {
      return this.createResult('http', options.sourceUrl, await this.httpProvider(options.sourceUrl));
    }

    if (options.mode === 'browser') {
      return this.createResult(
        'browser',
        options.sourceUrl,
        await this.browserProvider(options.sourceUrl)
      );
    }

    try {
      return this.createResult(
        'browser',
        options.sourceUrl,
        await this.browserProvider(options.sourceUrl)
      );
    } catch (error) {
      if (error instanceof Error && 'recoverable' in error && error.recoverable === true) {
        return this.createResult('http', options.sourceUrl, await this.httpProvider(options.sourceUrl));
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
