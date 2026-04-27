import { VIDEO_COMPRESSION_DEFAULTS } from './preset.js';

export interface FfmpegCommandOptions {
  audioBitrate?: string;
  inputPath: string;
  outputPath: string;
  resolution?: string;
  videoBitrate?: string;
}

export function buildFfmpegArgs(options: FfmpegCommandOptions): string[] {
  const args = [
    '-i',
    options.inputPath,
    '-c:v',
    VIDEO_COMPRESSION_DEFAULTS.videoCodec
  ];

  if (options.videoBitrate) {
    args.push('-b:v', options.videoBitrate);
  }

  if (options.resolution) {
    const [width, height] = options.resolution.split('x');
    args.push('-vf', `scale=${width}:${height}`);
  }

  args.push(
    '-c:a',
    VIDEO_COMPRESSION_DEFAULTS.audioCodec,
    '-b:a',
    options.audioBitrate ?? VIDEO_COMPRESSION_DEFAULTS.audioBitrate,
    options.outputPath
  );

  return args;
}

export function probeFfmpegResult(result: { code: number; stderr: string; stdout: string }): boolean {
  return result.code === 0 && result.stdout.includes('ffmpeg version');
}
