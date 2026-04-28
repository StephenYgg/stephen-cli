import type { VideoRuntime } from '../runtime.js';
import type { VideoCandidate } from '../types.js';

export class BrowserVideoSniffProvider {
  private readonly runtime: Pick<VideoRuntime, 'launchBrowserSniffer'>;

  constructor(dependencies: { runtime: Pick<VideoRuntime, 'launchBrowserSniffer'> }) {
    this.runtime = dependencies.runtime;
  }

  sniff(sourceUrl: string, options?: { noProxy?: boolean; proxyUrl?: string }): Promise<VideoCandidate[]> {
    return this.runtime.launchBrowserSniffer(sourceUrl, options);
  }
}
