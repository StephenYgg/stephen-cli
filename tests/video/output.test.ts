import { describe, expect, it } from 'vitest';

import {
  renderVideoCandidatesAsJson,
  renderVideoCommandErrorAsJson,
  renderVideoCompressionResultAsJson,
  renderVideoDownloadResultAsJson,
  renderVideoOperationAsTable
} from '../../src/video/output.js';

describe('video output helpers', () => {
  it('renders JSON payloads and tables for video operations', () => {
    expect(
      renderVideoCandidatesAsJson({
        candidates: [
          {
            type: 'mp4',
            url: 'https://cdn.example.com/video.mp4',
            origin: 'network',
            mimeType: 'video/mp4',
            confidence: 0.9
          }
        ],
        mode: 'browser',
        sourceUrl: 'https://example.com/watch'
      })
    ).toContain('"ok": true');
    expect(
      renderVideoCommandErrorAsJson('VIDEO_NO_CANDIDATE', 'No supported media candidate was detected.')
    ).toContain('"ok": false');
    expect(
      renderVideoCommandErrorAsJson('VIDEO_DOWNLOAD_FAILED', 'failed', {
        status: 404
      })
    ).toContain('"status": 404');
    const downloadJson = renderVideoDownloadResultAsJson({
      md5: '0123456789abcdef0123456789abcdef',
      mediaType: 'mp4',
      outputPath: 'D:\\videos\\video.mp4',
      sourceUrl: 'https://cdn.example.com/video.mp4',
      status: 'already_downloaded'
    });
    expect(downloadJson).toContain('"mediaType": "mp4"');
    expect(downloadJson).toContain('"md5": "0123456789abcdef0123456789abcdef"');
    expect(downloadJson).toContain('"status": "already_downloaded"');
    expect(
      renderVideoCompressionResultAsJson({
        audioBitrate: '64k',
        audioCodec: 'aac',
        codec: 'libx265',
        inputPath: 'D:\\videos\\in.mov',
        outputPath: 'D:\\videos\\out.mp4'
      })
    ).toContain('"codec": "libx265"');
    expect(
      renderVideoOperationAsTable([
        ['field', 'value'],
        ['type', 'mp4']
      ])
    ).toContain('field');
  });
});
