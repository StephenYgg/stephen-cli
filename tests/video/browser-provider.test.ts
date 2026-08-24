import { describe, expect, it, vi } from 'vitest';

import { BrowserVideoSniffProvider } from '../../src/video/sniff/browser-provider.js';

describe('BrowserVideoSniffProvider', () => {
  it('delegates browser sniffing to the runtime launcher', async () => {
    const launchBrowserSniffer = vi.fn(async () => ({
      candidates: [
        {
          type: 'mp4' as const,
          url: 'https://cdn.example.com/video.mp4',
          origin: 'network' as const,
          mimeType: 'video/mp4',
          confidence: 0.9
        }
      ],
      title: 'Example Video'
    }));
    const provider = new BrowserVideoSniffProvider({
      runtime: {
        launchBrowserSniffer
      }
    });

    await expect(provider.sniff('https://example.com/watch')).resolves.toEqual({
      candidates: [
        {
          confidence: 0.9,
          mimeType: 'video/mp4',
          origin: 'network',
          type: 'mp4',
          url: 'https://cdn.example.com/video.mp4'
        }
      ],
      title: 'Example Video'
    });
    expect(launchBrowserSniffer).toHaveBeenCalledWith('https://example.com/watch', undefined);
  });

  it('adapts legacy runtime candidate arrays', async () => {
    const provider = new BrowserVideoSniffProvider({
      runtime: {
        launchBrowserSniffer: vi.fn(async () => [
          {
            origin: 'network' as const,
            type: 'mp4' as const,
            url: 'https://cdn.example.com/legacy.mp4'
          }
        ])
      }
    });

    await expect(provider.sniff('https://example.com/watch')).resolves.toEqual({
      candidates: [
        {
          origin: 'network',
          type: 'mp4',
          url: 'https://cdn.example.com/legacy.mp4'
        }
      ]
    });
  });
});
