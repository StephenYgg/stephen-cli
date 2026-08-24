import { applyProxyInit } from '../proxy.js';
import type { VideoRuntime } from '../runtime.js';
import { VideoCommandError, type VideoSniffProviderResult } from '../types.js';
import { extractVideoCandidatesFromText } from './candidate.js';
import { extractVideoTitleFromHtml } from './title.js';

export class HttpVideoSniffProvider {
  private readonly runtime: Pick<VideoRuntime, 'fetch'>;

  constructor(dependencies: { runtime: Pick<VideoRuntime, 'fetch'> }) {
    this.runtime = dependencies.runtime;
  }

  async sniff(
    sourceUrl: string,
    options?: { noProxy?: boolean; proxyUrl?: string }
  ): Promise<VideoSniffProviderResult> {
    const response = await this.runtime.fetch(sourceUrl, applyProxyInit(undefined, options));

    if (!response.ok) {
      throw new VideoCommandError(
        'VIDEO_SNIFF_FAILED',
        `Failed to inspect ${sourceUrl}. HTTP ${response.status}.`
      );
    }

    const text = await response.text();
    return {
      candidates: extractVideoCandidatesFromText(text, 'html'),
      title: extractVideoTitleFromHtml(text)
    };
  }
}
