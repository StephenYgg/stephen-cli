import { extname, win32 } from 'node:path';

import type { VideoRuntime } from '../runtime.js';
import { buildFfmpegArgs, probeFfmpegResult } from './ffmpeg.js';
import { VIDEO_COMPRESSION_DEFAULTS } from './preset.js';
import {
  VideoCommandError,
  type VideoCompressionOptions,
  type VideoCompressionResult
} from '../types.js';

export class VideoCompressionService {
  private readonly runtime: Pick<VideoRuntime, 'execFile'>;

  constructor(dependencies: { runtime: Pick<VideoRuntime, 'execFile'> }) {
    this.runtime = dependencies.runtime;
  }

  async compress(options: VideoCompressionOptions): Promise<VideoCompressionResult> {
    const probe = await this.runtime.execFile('ffmpeg', ['-version']);

    if (!probeFfmpegResult(probe)) {
      throw new VideoCommandError(
        'VIDEO_FFMPEG_MISSING',
        'ffmpeg is required for video compression.'
      );
    }

    const outputPath = options.outputPath ?? replaceExtension(options.inputPath, '.mp4');
    const execResult = await this.runtime.execFile(
      'ffmpeg',
      buildFfmpegArgs({
        inputPath: options.inputPath,
        outputPath,
        ...(options.audioBitrate ? { audioBitrate: options.audioBitrate } : {}),
        ...(options.resolution ? { resolution: options.resolution } : {}),
        ...(options.videoBitrate ? { videoBitrate: options.videoBitrate } : {})
      })
    );

    if (execResult.code !== 0) {
      throw new VideoCommandError(
        'VIDEO_COMPRESSION_FAILED',
        execResult.stderr || 'Video compression failed.'
      );
    }

    return {
      audioBitrate: options.audioBitrate ?? VIDEO_COMPRESSION_DEFAULTS.audioBitrate,
      audioCodec: VIDEO_COMPRESSION_DEFAULTS.audioCodec,
      codec: VIDEO_COMPRESSION_DEFAULTS.videoCodec,
      inputPath: options.inputPath,
      outputPath,
      ...(options.resolution ? { resolution: options.resolution } : {}),
      ...(options.videoBitrate ? { videoBitrate: options.videoBitrate } : {})
    };
  }
}

function replaceExtension(path: string, nextExtension: string): string {
  const currentExtension = extname(path);
  return currentExtension.length === 0
    ? `${path}${nextExtension}`
    : `${path.slice(0, -currentExtension.length)}${nextExtension}`;
}
