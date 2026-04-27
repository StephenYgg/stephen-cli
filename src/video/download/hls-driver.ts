import { basename, extname, win32 } from 'node:path';

import type { VideoRuntime } from '../runtime.js';
import { VideoCommandError, type VideoDownloadResult } from '../types.js';

export class HlsVideoDownloadDriver {
  private readonly runtime: Pick<VideoRuntime, 'fetch' | 'writeFile'>;

  constructor(dependencies: { runtime: Pick<VideoRuntime, 'fetch' | 'writeFile'> }) {
    this.runtime = dependencies.runtime;
  }

  async download(options: {
    outputDir?: string;
    outputPath?: string;
    sourceUrl: string;
  }): Promise<VideoDownloadResult> {
    const playlistResponse = await this.runtime.fetch(options.sourceUrl);

    if (!playlistResponse.ok) {
      throw new VideoCommandError(
        'VIDEO_DOWNLOAD_FAILED',
        `Failed to download ${options.sourceUrl}. HTTP ${playlistResponse.status}.`
      );
    }

    const playlist = await playlistResponse.text();
    const segmentUrls = playlist
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => new URL(line, options.sourceUrl).toString());

    const chunks: Buffer[] = [];

    for (const segmentUrl of segmentUrls) {
      const segmentResponse = await this.runtime.fetch(segmentUrl);

      if (!segmentResponse.ok) {
        throw new VideoCommandError(
          'VIDEO_DOWNLOAD_FAILED',
          `Failed to download ${segmentUrl}. HTTP ${segmentResponse.status}.`
        );
      }

      const payload = await segmentResponse.arrayBuffer();
      chunks.push(payload instanceof Uint8Array ? Buffer.from(payload) : Buffer.from(payload));
    }

    const merged = Buffer.concat(chunks);
    const outputPath =
      options.outputPath ??
      win32.join(options.outputDir ?? '.', `${stripExtension(basename(new URL(options.sourceUrl).pathname))}.ts`);
    await this.runtime.writeFile(outputPath, merged);

    return {
      bytesWritten: merged.byteLength,
      mediaType: 'm3u8',
      outputPath,
      sourceUrl: options.sourceUrl
    };
  }
}

function stripExtension(value: string): string {
  const extension = extname(value);
  return extension.length === 0 ? value : value.slice(0, -extension.length);
}
