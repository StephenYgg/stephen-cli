import { basename, win32 } from 'node:path';

import type { VideoRuntime } from '../runtime.js';
import { VideoCommandError, type VideoDownloadResult } from '../types.js';

export class DirectVideoDownloadDriver {
  private readonly runtime: Pick<VideoRuntime, 'fetch' | 'writeFile'>;

  constructor(dependencies: { runtime: Pick<VideoRuntime, 'fetch' | 'writeFile'> }) {
    this.runtime = dependencies.runtime;
  }

  async download(options: {
    outputDir?: string;
    outputPath?: string;
    sourceUrl: string;
  }): Promise<VideoDownloadResult> {
    let response: Awaited<ReturnType<DirectVideoDownloadDriver['runtime']['fetch']>>;

    try {
      response = await this.runtime.fetch(options.sourceUrl);
    } catch (error) {
      throw new VideoCommandError(
        'VIDEO_DOWNLOAD_FAILED',
        `Failed to download ${options.sourceUrl}.`,
        2,
        {
          cause: error instanceof Error ? error.message : String(error)
        }
      );
    }

    if (!response.ok) {
      throw new VideoCommandError(
        'VIDEO_DOWNLOAD_FAILED',
        `Failed to download ${options.sourceUrl}. HTTP ${response.status}.`
      );
    }

    const payload = await response.arrayBuffer();
    const buffer = payload instanceof Uint8Array ? Buffer.from(payload) : Buffer.from(payload);
    /* c8 ignore next */
    const outputPath = options.outputPath ?? win32.join(options.outputDir ?? '.', inferFileName(options.sourceUrl));
    await this.runtime.writeFile(outputPath, buffer);

    return {
      bytesWritten: buffer.byteLength,
      mediaType: 'mp4',
      outputPath,
      sourceUrl: options.sourceUrl
    };
  }
}

function inferFileName(sourceUrl: string): string {
  const name = basename(new URL(sourceUrl).pathname);
  return name || 'video.mp4';
}
