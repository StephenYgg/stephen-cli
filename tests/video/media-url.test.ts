import { describe, expect, it } from 'vitest';

import {
  isHlsMediaUrl,
  isNoiseMediaUrl,
  isTemplateHlsUrl
} from '../../src/video/media-url.js';

describe('media url classification', () => {
  it('treats playlists and HLS-disguised mp4 urls as HLS', () => {
    expect(isHlsMediaUrl('https://cdn.example.com/master.m3u8')).toBe(true);
    expect(isHlsMediaUrl('https://cdn.example.com/index.m3u8?token=1')).toBe(true);
    expect(
      isHlsMediaUrl(
        'https://cdn.example.com/key=abc,end=1/media=hls4A/2026-08/_TPL_.mp4'
      )
    ).toBe(true);
    expect(
      isHlsMediaUrl('https://cdn.example.com/key=abc/media=hls4A/2026-08/hq_hash.mp4.m3u8')
    ).toBe(true);
    expect(isHlsMediaUrl('https://cdn.example.com/video.mp4')).toBe(false);
    expect(isHlsMediaUrl('https://cdn.example.com/video.mp4?token=1')).toBe(false);
  });

  it('detects signed HLS template urls used by AH-CDN players', () => {
    expect(
      isTemplateHlsUrl(
        'https://cdn.example.com/key=abc,end=1/media=hls4A/2026-08/_TPL_.mp4'
      )
    ).toBe(true);
    expect(
      isTemplateHlsUrl('https://cdn.example.com/media=hls/2026-08/video.mp4')
    ).toBe(true);
    expect(isTemplateHlsUrl('https://cdn.example.com/master.m3u8')).toBe(false);
    expect(isTemplateHlsUrl('https://cdn.example.com/video.mp4')).toBe(false);
  });

  it('flags thumbnail and preview paths as noise', () => {
    expect(
      isNoiseMediaUrl(
        'https://cdn.example.com/b-site/thumbs/full/2026-08/hash.mp4'
      )
    ).toBe(true);
    expect(isNoiseMediaUrl('https://cdn.example.com/pv/ast/2026-08/pv_hash.mp4')).toBe(true);
    expect(isNoiseMediaUrl('https://cdn.example.com/media=hls4A/2026-08/_TPL_.mp4')).toBe(
      false
    );
    expect(isNoiseMediaUrl('https://cdn.example.com/master.m3u8')).toBe(false);
  });
});
