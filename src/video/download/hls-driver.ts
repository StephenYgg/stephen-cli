import { basename, extname, win32 } from 'node:path';

import type { VideoRuntime } from '../runtime.js';
import { VideoCommandError, type VideoDownloadResult } from '../types.js';
import { createMediaRequestInit } from './media-request.js';

const HLS_SEGMENT_CONCURRENCY = 8;

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
    const media = await loadMediaPlaylist(this.runtime, options.sourceUrl);
    const segmentUrls = parsePlaylistResourceUrls(media.body, media.url);

    const chunks = await mapLimit(segmentUrls, HLS_SEGMENT_CONCURRENCY, async (segmentUrl) => {
      const segmentResponse = await this.runtime.fetch(
        segmentUrl,
        createMediaRequestInit(segmentUrl)
      );

      if (!segmentResponse.ok) {
        throw new VideoCommandError(
          'VIDEO_DOWNLOAD_FAILED',
          `Failed to download ${segmentUrl}. HTTP ${segmentResponse.status}.`
        );
      }

      const payload = await segmentResponse.arrayBuffer();
      return payload instanceof Uint8Array ? Buffer.from(payload) : Buffer.from(payload);
    });

    if (chunks.length === 0) {
      throw new VideoCommandError(
        'VIDEO_DOWNLOAD_FAILED',
        `No media segments found in ${media.url}.`
      );
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

async function loadMediaPlaylist(
  runtime: Pick<VideoRuntime, 'fetch'>,
  sourceUrl: string
): Promise<{ body: string; url: string }> {
  const playlist = await fetchPlaylistText(runtime, sourceUrl);
  const variantUrl = pickHighestBandwidthVariant(playlist, sourceUrl);
  if (!variantUrl) {
    return { body: playlist, url: sourceUrl };
  }

  return {
    body: await fetchPlaylistText(runtime, variantUrl),
    url: variantUrl
  };
}

async function fetchPlaylistText(
  runtime: Pick<VideoRuntime, 'fetch'>,
  url: string
): Promise<string> {
  const response = await runtime.fetch(url, createMediaRequestInit(url));
  if (!response.ok) {
    throw new VideoCommandError(
      'VIDEO_DOWNLOAD_FAILED',
      `Failed to download ${url}. HTTP ${response.status}.`
    );
  }

  return response.text();
}

function pickHighestBandwidthVariant(playlist: string, sourceUrl: string): string | null {
  let bestUrl: string | null = null;
  let bestBandwidth = -1;
  let pendingBandwidth: number | null = null;

  for (const rawLine of playlist.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    if (line.startsWith('#EXT-X-STREAM-INF')) {
      const bandwidth = /(?:^|[:,])BANDWIDTH=(\d+)/i.exec(line)?.[1];
      pendingBandwidth = bandwidth ? Number.parseInt(bandwidth, 10) : 0;
      continue;
    }

    if (pendingBandwidth === null || line.startsWith('#')) {
      continue;
    }

    if (pendingBandwidth > bestBandwidth) {
      bestBandwidth = pendingBandwidth;
      bestUrl = new URL(line, sourceUrl).toString();
    }
    pendingBandwidth = null;
  }

  return bestUrl;
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

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!, index);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
