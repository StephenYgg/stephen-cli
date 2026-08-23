import { execFile as nodeExecFile } from 'node:child_process';
import { writeFile as writeFileOnDisk } from 'node:fs/promises';
import { promisify } from 'node:util';

import { isHlsMediaUrl, isNoiseMediaUrl, isTemplateHlsUrl } from './media-url.js';
import { createVideoCandidate, rankVideoCandidates } from './sniff/candidate.js';
import { VideoCommandError, type VideoCandidate } from './types.js';

export interface VideoExecResult {
  code: number;
  stderr: string;
  stdout: string;
}

export interface VideoFetchResponse {
  arrayBuffer: () => Promise<ArrayBuffer | Uint8Array>;
  body?: ReadableStream<Uint8Array> | null;
  headers: Headers;
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

export interface VideoRuntime {
  execFile: (file: string, args: string[]) => Promise<VideoExecResult>;
  fetch: (input: string, init?: RequestInit) => Promise<VideoFetchResponse>;
  launchBrowserSniffer: (url: string, options?: { noProxy?: boolean; proxyUrl?: string }) => Promise<VideoCandidate[]>;
  writeFile: (path: string, data: Uint8Array) => Promise<void>;
}

const execFileAsync = promisify(nodeExecFile);

export function createDefaultVideoRuntime(): VideoRuntime {
  return {
    execFile: async (file, args) => {
      try {
        const result = await execFileAsync(file, args, { encoding: 'utf8' });
        return {
          code: 0,
          stderr: result.stderr,
          stdout: result.stdout
        };
      } catch (error) {
        const execError = error as Error & { code?: number; stderr?: string; stdout?: string };
        /* c8 ignore start */
        return {
          code: typeof execError.code === 'number' ? execError.code : 1,
          stderr: execError.stderr ?? execError.message,
          stdout: execError.stdout ?? ''
        };
        /* c8 ignore end */
      }
    },
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      return response;
    },
    launchBrowserSniffer: async (url) => sniffWithBrowserRuntime(url),
    writeFile: async (path, data) => {
      await writeFileOnDisk(path, data);
    }
  };
}

export async function sniffWithBrowserRuntime(
  url: string,
  loadModule: (specifier: string) => Promise<unknown> = loadOptionalModule
): Promise<VideoCandidate[]> {
  let playwright: unknown;

  try {
    playwright = await loadModule('playwright');
  } catch {
    throw new VideoCommandError(
      'VIDEO_BROWSER_UNAVAILABLE',
      'Browser sniff mode requires Playwright to be installed.',
      2,
      undefined,
      true
    );
  }

  const chromium = (playwright as { chromium?: { launch: (options: { headless: boolean }) => Promise<unknown> } }).chromium;

  if (!chromium) {
    throw new VideoCommandError(
      'VIDEO_BROWSER_UNAVAILABLE',
      'Browser sniff mode requires Playwright Chromium support.',
      2,
      undefined,
      true
    );
  }

  const browser = await chromium.launch({ headless: true });
  const candidates: VideoCandidate[] = [];

  try {
    const context = await (browser as {
      newContext: () => Promise<{
        close: () => Promise<void>;
        newPage: () => Promise<{
          goto: (target: string, options: { waitUntil: 'load' | 'networkidle' }) => Promise<void>;
          on: (event: 'response', handler: (response: {
            headers: () => Record<string, string>;
            url: () => string;
          }) => void) => void;
          waitForTimeout: (value: number) => Promise<void>;
        }>;
      }>;
    }).newContext();
    const page = await context.newPage();

    page.on('response', (response) => {
      const candidate = createCandidateFromBrowserResponse(response.url(), response.headers()['content-type']);

      if (candidate) {
        candidates.push(candidate);
      }
    });

    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(60000);
    await context.close();
  } finally {
    await (browser as { close: () => Promise<void> }).close();
  }

  return rankVideoCandidates(candidates);
}

const loadOptionalModule = new Function(
  'specifier',
  'return import(specifier);'
) as (specifier: string) => Promise<unknown>;

// Matches video resolution: /avc1/WxH/ or /vid/.../WxH/
const VIDEO_RES_RE = /(?:^|\/)(?:avc1\/|vid\/)(?:\d+\/){0,2}(\d+)x(\d+)/i;
// Matches audio bitrate: /mp4a/BITRATE/
const AUDIO_BITRATE_RE = /\/mp4a\/(\d+)/i;
const AUDIO_RE = /\/mp4a\//i;

export function createCandidateFromBrowserResponse(
  url: string,
  contentType?: string
): VideoCandidate | null {
  const isAudio = AUDIO_RE.test(url);

  let qualityBonus = 0;

  if (isAudio) {
    const bitrateMatch = AUDIO_BITRATE_RE.exec(url);
    if (bitrateMatch && bitrateMatch[1]) {
      const bitrate = parseInt(bitrateMatch[1], 10);
      // Normalize to 192kbps max
      qualityBonus = Math.min(bitrate / 192_000, 1) * 0.05;
    }
  } else {
    const resMatch = VIDEO_RES_RE.exec(url);
    if (resMatch && resMatch[1] && resMatch[2]) {
      const width = parseInt(resMatch[1], 10);
      const height = parseInt(resMatch[2], 10);
      const pixels = width * height;
      // Normalize to 1920x1080
      qualityBonus = Math.min(pixels / (1920 * 1080), 1) * 0.05;
    }
  }

  if (/\.m4s(?:\?|$)/i.test(url) || isNoiseMediaUrl(url)) {
    return null;
  }

  const mime = contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
  const isHls = isHlsMediaUrl(url) || mime.includes('mpegurl');

  if (isHls) {
    if (isAudio) {
      return null;
    }
    const confidence = isTemplateHlsUrl(url) ? 0.95 : qualityBonus;
    return createVideoCandidate('m3u8', url, 'network', confidence);
  }

  if (/\.mp4(?:\?|$)/i.test(url) || mime.includes('video/mp4')) {
    if (isAudio) {
      return null;
    }
    return createVideoCandidate('mp4', url, 'network', qualityBonus);
  }

  return null;
}
