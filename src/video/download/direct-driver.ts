import { basename, win32 } from 'node:path';

import { SingleBar } from 'cli-progress';

import { applyProxyInit } from '../proxy.js';
import type { VideoRuntime } from '../runtime.js';
import { VideoCommandError, type VideoTransferResult } from '../types.js';
import { createMediaRequestInit } from './media-request.js';

async function fetchWithProxy(
  url: string,
  runtime: Pick<VideoRuntime, 'fetch'>,
  options?: { noProxy?: boolean; proxyUrl?: string }
): Promise<Awaited<ReturnType<VideoRuntime['fetch']>>> {
  return runtime.fetch(url, applyProxyInit(createMediaRequestInit(url), options));
}

export class DirectVideoDownloadDriver {
  private readonly runtime: Pick<VideoRuntime, 'fetch' | 'writeFile'>;

  constructor(dependencies: { runtime: Pick<VideoRuntime, 'fetch' | 'writeFile'> }) {
    this.runtime = dependencies.runtime;
  }

  async download(options: {
    outputDir?: string;
    outputPath?: string;
    sourceUrl: string;
    noProxy?: boolean;
    proxyUrl?: string;
  }): Promise<VideoTransferResult> {
    let response: Awaited<ReturnType<DirectVideoDownloadDriver['runtime']['fetch']>>;

    try {
      response = await fetchWithProxy(
        options.sourceUrl,
        this.runtime,
        buildProxyOptions(options)
      );
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

    const outputPath = options.outputPath ?? win32.join(options.outputDir ?? '.', inferFileName(options.sourceUrl));

    // Streaming download with progress bar
    const contentLength = response.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : undefined;
    let buffer: Buffer;

    /* c8 ignore start */
    if (response.body && totalBytes && totalBytes > 0) {
      buffer = await this.downloadWithProgress(response.body, totalBytes, outputPath);
    } else {
      buffer = await this.downloadAsBuffer(response);
    }
    /* c8 ignore stop */

    await this.runtime.writeFile(outputPath, buffer);

    const downloadedBytes = buffer.byteLength;
    if (downloadedBytes > 0) {
      console.error(`Downloaded ${formatBytes(downloadedBytes)}.`);
    }

    return {
      bytesWritten: buffer.byteLength,
      mediaType: 'mp4',
      outputPath,
      sourceUrl: options.sourceUrl
    };
  }

  /* c8 ignore start */ private async downloadWithProgress(
    body: ReadableStream<Uint8Array>,
    totalBytes: number,
    _outputPath: string
  ): Promise<Buffer> {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    const startTime = Date.now();

    const progressBar = new SingleBar({
      format: createProgressFormatter(startTime, 24),
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true,
      fps: 10,
      barsize: 24
    });

    progressBar.start(totalBytes, 0);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedBytes += value.length;
        progressBar.update(receivedBytes);
      }
    } finally {
      progressBar.stop();
      reader.releaseLock();
    }

    return Buffer.concat(chunks);
  }

  private async downloadAsBuffer(
    response: Awaited<ReturnType<DirectVideoDownloadDriver['runtime']['fetch']>>
  ): Promise<Buffer> {
    const payload = await response.arrayBuffer();
    return payload instanceof Uint8Array ? Buffer.from(payload) : Buffer.from(payload);
  }
}

function createProgressFormatter(startTime: number, barsize: number) {
  return (_options: unknown, params: { progress: number; value: number; total: number; eta: number }): string => {
    const elapsed = (Date.now() - startTime) / 1000;
    const speed = elapsed > 0 ? params.value / elapsed : 0;

    const completeCount = Math.round(params.progress * barsize);
    const bar = '█'.repeat(completeCount) + '░'.repeat(barsize - completeCount);

    const percentage = (params.progress * 100).toFixed(1);
    return `Downloading ${bar} ${percentage}% | ${formatBytes(speed)}/s | ETA ${formatETA(params.eta)} | ${formatBytes(params.value)} / ${formatBytes(params.total)}`;
  };
}

function inferFileName(sourceUrl: string): string {
  const name = basename(new URL(sourceUrl).pathname);
  return name || 'video.mp4';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatETA(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '--:--';
  const s = Math.round(seconds);
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function buildProxyOptions(options: {
  noProxy?: boolean;
  proxyUrl?: string;
}): {
  noProxy?: boolean;
  proxyUrl?: string;
} {
  return {
    ...(options.noProxy === undefined ? {} : { noProxy: options.noProxy }),
    ...(options.proxyUrl === undefined ? {} : { proxyUrl: options.proxyUrl })
  };
}
/* c8 ignore stop */
