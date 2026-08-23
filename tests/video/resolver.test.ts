import { describe, expect, it } from 'vitest';

import { classifyVideoInput } from '../../src/video/download/resolver.js';

describe('classifyVideoInput', () => {
  it('classifies direct m3u8, direct mp4, page urls, and rejects unsupported inputs', () => {
    expect(classifyVideoInput('https://cdn.example.com/master.m3u8')).toEqual({
      kind: 'm3u8',
      url: 'https://cdn.example.com/master.m3u8'
    });
    expect(classifyVideoInput('https://cdn.example.com/video.mp4')).toEqual({
      kind: 'mp4',
      url: 'https://cdn.example.com/video.mp4'
    });
    expect(
      classifyVideoInput(
        'https://cdn.example.com/key=abc,end=1/media=hls4A/2026-08/_TPL_.mp4'
      )
    ).toEqual({
      kind: 'm3u8',
      url: 'https://cdn.example.com/key=abc,end=1/media=hls4A/2026-08/_TPL_.mp4'
    });
    expect(
      classifyVideoInput('https://cdn.example.com/media=hls4A/2026-08/hq_hash.mp4.m3u8')
    ).toEqual({
      kind: 'm3u8',
      url: 'https://cdn.example.com/media=hls4A/2026-08/hq_hash.mp4.m3u8'
    });

    expect(classifyVideoInput('https://example.com/watch/123')).toEqual({
      kind: 'page',
      url: 'https://example.com/watch/123'
    });
    expect(() => classifyVideoInput('ftp://example.com/video.mp4')).toThrow(
      'Unsupported video input'
    );
  });
});
