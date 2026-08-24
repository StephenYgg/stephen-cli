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

    await expect(provider.sniff('https://example.com/watch')).resolves.toEqual({
      candidates: [
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
      ],
      title: undefined
    });

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

  it('passes proxy options through to runtime fetch', async () => {
    const fetch = vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(0),
      headers: new Headers(),
      ok: true,
      status: 200,
      text: async () => '<div>https://cdn.example.com/master.m3u8</div>'
    }));
    const provider = new HttpVideoSniffProvider({
      runtime: { fetch }
    });

    await provider.sniff('https://example.com/watch', {
      proxyUrl: 'http://127.0.0.1:7890'
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const fetchCall = fetch.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(fetchCall[0]).toBe('https://example.com/watch');
    expect((fetchCall[1] as { dispatcher?: unknown } | undefined)?.dispatcher).toBeDefined();
  });

  it('extracts JSON-escaped HLS template urls from player config html', async () => {
    const provider = new HttpVideoSniffProvider({
      runtime: {
        fetch: vi.fn(async () => ({
          arrayBuffer: async () => new ArrayBuffer(0),
          headers: new Headers(),
          ok: true,
          status: 200,
          text: async () =>
            'var playerConfig = { sources: {"hlsAuto":"https:\\/\\/cdn.example.com\\/key=abc\\/media=hls4A\\/2026-08\\/_TPL_.mp4"} };'
        }))
      }
    });

    await expect(provider.sniff('https://example.com/watch')).resolves.toEqual({
      candidates: [
        {
          confidence: 0.95,
          mimeType: 'application/vnd.apple.mpegurl',
          origin: 'html',
          type: 'm3u8',
          url: 'https://cdn.example.com/key=abc/media=hls4A/2026-08/_TPL_.mp4'
        }
      ],
      title: undefined
    });
  });

  it('returns the normalized page title with candidates', async () => {
    const provider = new HttpVideoSniffProvider({
      runtime: {
        fetch: vi.fn(async () => ({
          arrayBuffer: async () => new ArrayBuffer(0),
          headers: new Headers(),
          ok: true,
          status: 200,
          text: async () =>
            '<meta property="og:title" content="  Page   Title  "><video src="https://cdn.example.com/video.mp4"></video>'
        }))
      }
    });

    await expect(provider.sniff('https://example.com/watch')).resolves.toMatchObject({
      title: 'Page Title'
    });
  });
});

