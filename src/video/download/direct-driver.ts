import { basename, win32 } from 'node:path';

import type { VideoRuntime } from '../runtime.js';
import { VideoCommandError, type VideoDownloadResult } from '../types.js';

async function fetchWithProxy(
  url: string,
  runtime: Pick<VideoRuntime, 'fetch'>,
  options?: { noProxy?: boolean; proxyUrl?: string }
): Promise<Awaited<ReturnType<VideoRuntime['fetch']>>> {
  if (options?.noProxy) {
    return await runtime.fetch(url);
  }

  const proxyUrl = options?.proxyUrl ?? process.env.HTTP_PROXY ?? process.env.HTTPS_PROXY;
  if (!proxyUrl) {
    return await runtime.fetch(url);
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // @ts-ignore -- https-proxy-agent uses exports map that NodeNext can't resolve in dynamic import
    const mod = (await import('https-proxy-agent')) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit any
    const response = await runtime.fetch(url, { agent: new mod.HttpsProxyAgent(proxyUrl) } as any);
    return response;
  } catch (error) {
    // Fall back to direct connection
    console.warn(`[stephen] Proxy connection failed (${proxyUrl}), falling back to direct connection: ${error instanceof Error ? error.message : String(error)}`);
    return await runtime.fetch(url);
  }
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
  }): Promise<VideoDownloadResult> {
    let response: Awaited<ReturnType<DirectVideoDownloadDriver['runtime']['fetch']>>;

    try {
      response = await fetchWithProxy(options.sourceUrl, this.runtime, {
        noProxy: options.noProxy,
        proxyUrl: options.proxyUrl
      });
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

    const downloadedBytes = buffer.byteLength;
    if (downloadedBytes > 0) {
      console.error(`Downloaded ${formatBytes(downloadedBytes)} to ${outputPath}`);
    }

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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
