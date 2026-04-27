import { extractVideoCandidatesFromText } from './candidate.js';
import type { VideoRuntime } from '../runtime.js';
import { VideoCommandError, type VideoCandidate } from '../types.js';

export class HttpVideoSniffProvider {
  private readonly runtime: Pick<VideoRuntime, 'fetch'>;

  constructor(dependencies: { runtime: Pick<VideoRuntime, 'fetch'> }) {
    this.runtime = dependencies.runtime;
  }

  async sniff(sourceUrl: string): Promise<VideoCandidate[]> {
    const response = await this.runtime.fetch(sourceUrl);

    if (!response.ok) {
      throw new VideoCommandError(
        'VIDEO_SNIFF_FAILED',
        `Failed to inspect ${sourceUrl}. HTTP ${response.status}.`
      );
    }

    const text = await response.text();
    return extractVideoCandidatesFromText(text, 'html');
  }
}
