import { describe, expect, it, vi } from 'vitest';

import { VideoCompressionService } from '../../src/video/compress/service.js';

describe('VideoCompressionService', () => {
  it('uses ffmpeg defaults and returns a missing-ffmpeg error when probing fails', async () => {
    const service = new VideoCompressionService({
      runtime: {
        execFile: vi.fn(async () => ({
          code: 1,
          stderr: 'ffmpeg not found',
          stdout: ''
        }))
      }
    });

    await expect(
      service.compress({
        inputPath: 'D:/videos/input.mov'
      })
    ).rejects.toMatchObject({
      code: 'VIDEO_FFMPEG_MISSING',
      exitCode: 2,
      message: 'ffmpeg is required for video compression.'
    });
  });

  it('compresses with default output path and optional overrides when ffmpeg is available', async () => {
    const execFile = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stderr: '',
        stdout: 'ffmpeg version 7.1'
      })
      .mockResolvedValueOnce({
        code: 0,
        stderr: '',
        stdout: ''
      });
    const service = new VideoCompressionService({
      runtime: {
        execFile
      }
    });

    await expect(
      service.compress({
        audioBitrate: '96k',
        inputPath: 'D:/videos/input.mov',
        resolution: '1280x720',
        videoBitrate: '1500k'
      })
    ).resolves.toEqual({
      audioBitrate: '96k',
      audioCodec: 'aac',
      codec: 'libx265',
      inputPath: 'D:/videos/input.mov',
      outputPath: 'D:/videos/input.mp4',
      resolution: '1280x720',
      videoBitrate: '1500k'
    });
    expect(execFile).toHaveBeenNthCalledWith(2, 'ffmpeg', [
      '-i',
      'D:/videos/input.mov',
      '-c:v',
      'libx265',
      '-b:v',
      '1500k',
      '-vf',
      'scale=1280:720',
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      'D:/videos/input.mp4'
    ]);
  });

  it('surfaces ffmpeg execution failures after a successful probe', async () => {
    const service = new VideoCompressionService({
      runtime: {
        execFile: vi
          .fn()
          .mockResolvedValueOnce({
            code: 0,
            stderr: '',
            stdout: 'ffmpeg version 7.1'
          })
          .mockResolvedValueOnce({
            code: 1,
            stderr: 'encode failed',
            stdout: ''
          })
      }
    });

    await expect(
      service.compress({
        inputPath: 'D:/videos/input.mov'
      })
    ).rejects.toMatchObject({
      code: 'VIDEO_COMPRESSION_FAILED',
      message: 'encode failed'
    });
  });

  it('falls back to a generic compression error message and adds mp4 when the input has no extension', async () => {
    const service = new VideoCompressionService({
      runtime: {
        execFile: vi
          .fn()
          .mockResolvedValueOnce({
            code: 0,
            stderr: '',
            stdout: 'ffmpeg version 7.1'
          })
          .mockResolvedValueOnce({
            code: 1,
            stderr: '',
            stdout: ''
          })
      }
    });

    await expect(
      service.compress({
        inputPath: 'D:/videos/input'
      })
    ).rejects.toMatchObject({
      code: 'VIDEO_COMPRESSION_FAILED',
      message: 'Video compression failed.'
    });
  });
});
