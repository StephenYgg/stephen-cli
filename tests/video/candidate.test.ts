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
});
