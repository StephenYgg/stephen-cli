import type { Command } from 'commander';
import { z } from 'zod';

import { BrowserVideoSniffProvider } from './sniff/browser-provider.js';
import { VideoSniffService } from './sniff/service.js';
import { HttpVideoSniffProvider } from './sniff/http-provider.js';
import { DirectVideoDownloadDriver } from './download/direct-driver.js';
import { HlsVideoDownloadDriver } from './download/hls-driver.js';
import { VideoDownloadService } from './download/service.js';
import { VideoCompressionService } from './compress/service.js';
import {
  renderVideoCandidatesAsJson,
  renderVideoCandidatesAsTable,
  renderVideoCommandErrorAsJson,
  renderVideoCompressionResultAsJson,
  renderVideoDownloadResultAsJson,
  renderVideoOperationAsTable
} from './output.js';
import type { VideoRuntime } from './runtime.js';
import { VideoCommandError } from './types.js';

export interface VideoCommandDependencies {
  runtime: VideoRuntime;
  stderr: (value: string) => void;
  stdout: (value: string) => void;
}

const sniffOptionsSchema = z.object({
  format: z.enum(['json', 'table']).default('json'),
  mode: z.enum(['auto', 'browser', 'http']).default('auto'),
  proxy: z.string().optional(),
  skipProxy: z.boolean().default(false)
});

const downloadOptionsSchema = z.object({
  format: z.enum(['json', 'table']).default('json'),
  mode: z.enum(['auto', 'browser', 'http']).default('auto'),
  outputDir: z.string().optional(),
  proxy: z.string().optional(),
  skipProxy: z.boolean().default(false)
});

const compressOptionsSchema = z.object({
  audioBitrate: z.string().optional(),
  format: z.enum(['json', 'table']).default('json'),
  outputPath: z.string().optional(),
  resolution: z.string().optional(),
  videoBitrate: z.string().optional()
});

export function registerVideoCommands(
  program: Command,
  dependencies: VideoCommandDependencies
): void {
  const video = program.command('video').description('Inspect, download, and compress video media.');
  const browserProvider = new BrowserVideoSniffProvider({
    runtime: dependencies.runtime
  });
  const httpProvider = new HttpVideoSniffProvider({
    runtime: dependencies.runtime
  });
  const sniffService = new VideoSniffService({
    browserProvider: (sourceUrl, opts) => browserProvider.sniff(sourceUrl, opts),
    httpProvider: (sourceUrl, opts) => httpProvider.sniff(sourceUrl, opts)
  });
  const downloadService = new VideoDownloadService({
    directDriver: new DirectVideoDownloadDriver({
      runtime: dependencies.runtime
    }),
    hlsDriver: new HlsVideoDownloadDriver({
      runtime: dependencies.runtime
    }),
    sniffService
  });
  const compressionService = new VideoCompressionService({
    runtime: dependencies.runtime
  });

  video.command('sniff')
    .argument('<input>', 'page url or media url')
    .option('--mode <mode>', 'sniff mode', 'auto')
    .option('--format <format>', 'output format', 'json')
    .option('-t, --table', 'render as a table')
    .option('--proxy <proxy>', 'proxy URL')
    .option('--skip-proxy', 'disable proxy')
    .action(async (input, options) => {
      const parsed = sniffOptionsSchema.parse(applyVideoTableShortcut(options));
      const result = await sniffService.sniff({
        mode: parsed.mode,
        sourceUrl: input,
        ...(parsed.proxy ? { proxy: parsed.proxy } : {}),
        ...(parsed.skipProxy ? { noProxy: true } : {})
      });

      if (parsed.format === 'table') {
        dependencies.stdout(`${renderVideoCandidatesAsTable(result)}\n`);
        return;
      }

      dependencies.stdout(`${renderVideoCandidatesAsJson(result)}\n`);
    });

  video.command('download')
    .argument('<input>', 'page url, m3u8 url, or mp4 url')
    .option('--mode <mode>', 'sniff mode', 'auto')
    .option('--output-dir <outputDir>', 'output directory')
    .option('--format <format>', 'output format', 'json')
    .option('-t, --table', 'render as a table')
    .option('--proxy <proxy>', 'proxy URL')
    .option('--skip-proxy', 'disable proxy')
    .action(async (input, options) => {
      const parsed = downloadOptionsSchema.parse(applyVideoTableShortcut(options));
      const result = await downloadService.download({
        input,
        mode: parsed.mode,
        ...(parsed.outputDir ? { outputDir: parsed.outputDir } : {}),
        ...(parsed.proxy ? { proxy: parsed.proxy } : {}),
        ...(parsed.skipProxy ? { noProxy: true } : {})
      });

      if (parsed.format === 'table') {
        dependencies.stdout(
          `${renderVideoOperationAsTable([
            ['field', 'value'],
            ['mediaType', result.mediaType],
            ['outputPath', result.outputPath]
          ])}\n`
        );
        return;
      }

      dependencies.stdout(`${renderVideoDownloadResultAsJson(result)}\n`);
    });

  video.command('compress')
    .argument('<input>', 'local input video path')
    .option('--output-path <outputPath>', 'output path')
    .option('--resolution <resolution>', 'target resolution, such as 1280x720')
    .option('--video-bitrate <videoBitrate>', 'target video bitrate')
    .option('--audio-bitrate <audioBitrate>', 'target audio bitrate')
    .option('--format <format>', 'output format', 'json')
    .option('-t, --table', 'render as a table')
    .action(async (input, options) => {
      const parsed = compressOptionsSchema.parse(applyVideoTableShortcut(options));
      const result = await compressionService.compress({
        inputPath: input,
        ...(parsed.audioBitrate ? { audioBitrate: parsed.audioBitrate } : {}),
        ...(parsed.outputPath ? { outputPath: parsed.outputPath } : {}),
        ...(parsed.resolution ? { resolution: parsed.resolution } : {}),
        ...(parsed.videoBitrate ? { videoBitrate: parsed.videoBitrate } : {})
      });

      if (parsed.format === 'table') {
        dependencies.stdout(
          `${renderVideoOperationAsTable([
            ['field', 'value'],
            ['codec', result.codec],
            ['outputPath', result.outputPath]
          ])}\n`
        );
        return;
      }

      dependencies.stdout(`${renderVideoCompressionResultAsJson(result)}\n`);
    });
}

export function handleVideoCommandError(
  error: unknown,
  dependencies: Pick<VideoCommandDependencies, 'stderr'>
): number | undefined {
  if (error instanceof VideoCommandError) {
    const details = (error as { details?: unknown }).details;
    dependencies.stderr(
      `${renderVideoCommandErrorAsJson(
        error.code,
        error.message,
        details
      )}\n`
    );
    return error.exitCode;
  }

  return undefined;
}

export function applyVideoTableShortcut<T extends { format?: string; table?: boolean }>(options: T): T & {
  format: 'json' | 'table';
} {
  if (options.table) {
    return {
      ...options,
      format: 'table'
    };
  }

  if (options.format) {
    return {
      ...options,
      format: options.format as 'json' | 'table'
    };
  }

  throw new Error('Output format is required for this command.');
}
