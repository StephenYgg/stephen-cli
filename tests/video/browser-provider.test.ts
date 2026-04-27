import { describe, expect, it, vi } from 'vitest';

import { BrowserVideoSniffProvider } from '../../src/video/sniff/browser-provider.js';

describe('BrowserVideoSniffProvider', () => {
  it('delegates browser sniffing to the runtime launcher', async () => {
    const launchBrowserSniffer = vi.fn(async () => [
      {
        type: 'mp4' as const,
        url: 'https://cdn.example.com/video.mp4',
        origin: 'network' as const,
        mimeType: 'video/mp4',
        confidence: 0.9
      }
    ]);
    const provider = new BrowserVideoSniffProvider({
      runtime: {
        launchBrowserSniffer
      }
    });

    await expect(provider.sniff('https://example.com/watch')).resolves.toEqual([
      {
        confidence: 0.9,
        mimeType: 'video/mp4',
        origin: 'network',
        type: 'mp4',
        url: 'https://cdn.example.com/video.mp4'
      }
    ]);
    expect(launchBrowserSniffer).toHaveBeenCalledWith('https://example.com/watch');
  });
});
