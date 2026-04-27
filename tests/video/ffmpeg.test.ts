import { describe, expect, it } from 'vitest';

import { buildFfmpegArgs, probeFfmpegResult } from '../../src/video/compress/ffmpeg.js';

describe('ffmpeg helpers', () => {
  it('builds ffmpeg args with h265 mp4 defaults and optional overrides', () => {
    expect(
      buildFfmpegArgs({
        audioBitrate: '96k',
        inputPath: 'D:/videos/in.mov',
        outputPath: 'D:/videos/out.mp4',
        resolution: '1280x720',
        videoBitrate: '1200k'
      })
    ).toEqual([
      '-i',
      'D:/videos/in.mov',
      '-c:v',
      'libx265',
      '-b:v',
      '1200k',
      '-vf',
      'scale=1280:720',
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      'D:/videos/out.mp4'
    ]);
    expect(probeFfmpegResult({ code: 0, stderr: '', stdout: 'ffmpeg version 7.1' })).toBe(true);
    expect(probeFfmpegResult({ code: 1, stderr: 'not found', stdout: '' })).toBe(false);
  });
});
