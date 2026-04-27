import { describe, expect, it, vi } from 'vitest';

import { HttpVideoSniffProvider } from '../../src/video/sniff/http-provider.js';

describe('HttpVideoSniffProvider', () => {
  it('extracts supported video urls from html and rejects non-ok responses', async () => {
    const provider = new HttpVideoSniffProvider({
      runtime: {
        fetch: vi.fn(async () => ({
          arrayBuffer: async () => new ArrayBuffer(0),
          headers: new Headers(),
          ok: true,
          status: 200,
          text: async () =>
            '<script>const a="https://cdn.example.com/video.mp4";</script><div>https://cdn.example.com/master.m3u8</div>'
        }))
      }
    });

    await expect(provider.sniff('https://example.com/watch')).resolves.toEqual([
      {
        confidence: 0.75,
        mimeType: 'application/vnd.apple.mpegurl',
        origin: 'html',
        type: 'm3u8',
        url: 'https://cdn.example.com/master.m3u8'
      },
      {
        confidence: 0.75,
        mimeType: 'video/mp4',
        origin: 'html',
        type: 'mp4',
        url: 'https://cdn.example.com/video.mp4'
      }
    ]);

    const failingProvider = new HttpVideoSniffProvider({
      runtime: {
        fetch: vi.fn(async () => ({
          arrayBuffer: async () => new ArrayBuffer(0),
          headers: new Headers(),
          ok: false,
          status: 403,
          text: async () => ''
        }))
      }
    });

    await expect(failingProvider.sniff('https://example.com/watch')).rejects.toMatchObject({
      code: 'VIDEO_SNIFF_FAILED'
    });
  });
});
