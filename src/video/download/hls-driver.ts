import { basename, extname, win32 } from 'node:path';

import type { VideoRuntime } from '../runtime.js';
import { VideoCommandError, type VideoDownloadResult } from '../types.js';
import { createMediaRequestInit } from './media-request.js';

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
    const playlistResponse = await this.runtime.fetch(
      options.sourceUrl,
      createMediaRequestInit(options.sourceUrl)
    );

    if (!playlistResponse.ok) {
      throw new VideoCommandError(
        'VIDEO_DOWNLOAD_FAILED',
        `Failed to download ${options.sourceUrl}. HTTP ${playlistResponse.status}.`
      );
    }

    const playlist = await playlistResponse.text();
    const segmentUrls = parsePlaylistResourceUrls(playlist, options.sourceUrl);

    const chunks: Buffer[] = [];

    // Fetch all segments concurrently
    const segmentResponses = await Promise.all(
      segmentUrls.map((segmentUrl) => this.runtime.fetch(segmentUrl, createMediaRequestInit(segmentUrl)))
    );

    for (let i = 0; i < segmentResponses.length; i++) {
      const segmentResponse = segmentResponses[i];
      const segmentUrl = segmentUrls[i];

      if (!segmentResponse || !segmentUrl) {
        throw new VideoCommandError(
          'VIDEO_DOWNLOAD_FAILED',
          `Failed to download segment ${i}.`
        );
      }

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

function parsePlaylistResourceUrls(playlist: string, sourceUrl: string): string[] {
  const urls: string[] = [];

  for (const rawLine of playlist.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (line.length === 0) {
      continue;
    }

    const mapUri = /^#EXT-X-MAP:.*URI="([^"]+)"/u.exec(line)?.[1];
    if (mapUri) {
      urls.push(new URL(mapUri, sourceUrl).toString());
      continue;
    }

    if (!line.startsWith('#')) {
      urls.push(new URL(line, sourceUrl).toString());
    }
  }

  return urls;
}
