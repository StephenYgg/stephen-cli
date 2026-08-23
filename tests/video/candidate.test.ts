import { describe, expect, it } from 'vitest';

import {
  createVideoCandidate,
  extractVideoCandidatesFromText,
  rankVideoCandidates
} from '../../src/video/sniff/candidate.js';

describe('video candidate helpers', () => {
  it('deduplicates candidates by url and keeps the higher confidence result first', () => {
    const ranked = rankVideoCandidates([
      createVideoCandidate('mp4', 'https://cdn.example.com/video.mp4', 'html', 0.4),
      createVideoCandidate('m3u8', 'https://cdn.example.com/master.m3u8', 'network', 0.95),
      createVideoCandidate('mp4', 'https://cdn.example.com/video.mp4', 'network', 0.8)
    ]);

    expect(ranked).toEqual([
      {
        confidence: 0.95,
        mimeType: 'application/vnd.apple.mpegurl',
        origin: 'network',
        type: 'm3u8',
        url: 'https://cdn.example.com/master.m3u8'
      },
      {
        confidence: 0.8,
        mimeType: 'video/mp4',
        origin: 'network',
        type: 'mp4',
        url: 'https://cdn.example.com/video.mp4'
      }
    ]);
  });

  it('keeps stable ordering when equal-confidence candidates share the same type', () => {
    const ranked = rankVideoCandidates([
      createVideoCandidate('mp4', 'https://cdn.example.com/a.mp4', 'html', 0.5),
      createVideoCandidate('mp4', 'https://cdn.example.com/b.mp4', 'html', 0.5)
    ]);

    expect(ranked.map((candidate) => candidate.url)).toEqual([
      'https://cdn.example.com/a.mp4',
      'https://cdn.example.com/b.mp4'
    ]);
  });

  it('extracts candidates from non-html text and preserves lower-confidence duplicates', () => {
    expect(
      extractVideoCandidatesFromText(
        'https://cdn.example.com/a.mp4 https://cdn.example.com/b.m3u8',
        'script'
      )
    ).toEqual([
      {
        confidence: 0.65,
        mimeType: 'application/vnd.apple.mpegurl',
        origin: 'script',
        type: 'm3u8',
        url: 'https://cdn.example.com/b.m3u8'
      },
      {
        confidence: 0.65,
        mimeType: 'video/mp4',
        origin: 'script',
        type: 'mp4',
        url: 'https://cdn.example.com/a.mp4'
      }
    ]);
  });

  it('does not replace an existing candidate when the duplicate has lower confidence and orders mp4 after m3u8 ties', () => {
    const ranked = rankVideoCandidates([
      createVideoCandidate('m3u8', 'https://cdn.example.com/stream.m3u8', 'network', 0.6),
      createVideoCandidate('mp4', 'https://cdn.example.com/video.mp4', 'network', 0.6),
      createVideoCandidate('mp4', 'https://cdn.example.com/video.mp4', 'html', 0.4)
    ]);

    expect(ranked).toEqual([
      {
        confidence: 0.6,
        mimeType: 'application/vnd.apple.mpegurl',
        origin: 'network',
        type: 'm3u8',
        url: 'https://cdn.example.com/stream.m3u8'
      },
      {
        confidence: 0.6,
        mimeType: 'video/mp4',
        origin: 'network',
        type: 'mp4',
        url: 'https://cdn.example.com/video.mp4'
      }
    ]);
  });

  it('unescapes JSON slashes and ranks HLS template urls above ads and previews', () => {
    const html = [
      'sources: {"hlsAuto":"https:\\/\\/cdn.ashemaletube.com\\/key=abc,end=1\\/media=hls4A\\/2026-08\\/_TPL_.mp4"}',
      'https://edge-hls.ads.example.com/hls/1/master/1_240p.m3u8',
      'https://cc.example.com/pv/ast/2026-08/pv_hash.mp4',
      'https://cdn.example.com/thumbs/ast-full/2026-08/hash.mp4-full-2.jpg',
      'https://cdn.example.com/plain.mp4'
    ].join('\n');

    const ranked = extractVideoCandidatesFromText(html, 'html');

    expect(ranked.map((candidate) => candidate.url)).toEqual([
      'https://cdn.ashemaletube.com/key=abc,end=1/media=hls4A/2026-08/_TPL_.mp4',
      'https://edge-hls.ads.example.com/hls/1/master/1_240p.m3u8',
      'https://cdn.example.com/plain.mp4'
    ]);
    expect(ranked[0]).toMatchObject({
      confidence: 0.95,
      type: 'm3u8',
      mimeType: 'application/vnd.apple.mpegurl'
    });
  });

  it('keeps .mp4.m3u8 as HLS instead of truncating at .mp4', () => {
    expect(
      extractVideoCandidatesFromText(
        'https://cdn.example.com/media=hls4A/2026-08/hq_hash.mp4.m3u8',
        'html'
      )
    ).toEqual([
      {
        confidence: 0.95,
        mimeType: 'application/vnd.apple.mpegurl',
        origin: 'html',
        type: 'm3u8',
        url: 'https://cdn.example.com/media=hls4A/2026-08/hq_hash.mp4.m3u8'
      }
    ]);
  });
});

