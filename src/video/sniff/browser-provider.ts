import type { VideoRuntime } from '../runtime.js';
import type { VideoSniffProviderResult } from '../types.js';

export class BrowserVideoSniffProvider {
  private readonly runtime: Pick<VideoRuntime, 'launchBrowserSniffer'>;

  constructor(dependencies: { runtime: Pick<VideoRuntime, 'launchBrowserSniffer'> }) {
    this.runtime = dependencies.runtime;
  }

  async sniff(
    sourceUrl: string,
    options?: { noProxy?: boolean; proxyUrl?: string }
  ): Promise<VideoSniffProviderResult> {
    const result = await this.runtime.launchBrowserSniffer(sourceUrl, options);
    return Array.isArray(result) ? { candidates: result } : result;
  }
}
