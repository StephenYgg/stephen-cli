import { execFile as nodeExecFile } from 'node:child_process';
import { writeFile as writeFileOnDisk } from 'node:fs/promises';
import { promisify } from 'node:util';

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
          goto: (target: string, options: { waitUntil: 'load' }) => Promise<void>;
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
    await page.waitForTimeout(500);
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

export function createCandidateFromBrowserResponse(
  url: string,
  contentType?: string
): VideoCandidate | null {
  if (/\.m3u8(?:\?|$)/i.test(url)) {
    return createVideoCandidate('m3u8', url, 'network', 0.95);
  }

  if (/\.mp4(?:\?|$)/i.test(url) || contentType?.includes('video/mp4')) {
    return createVideoCandidate('mp4', url, 'network', 0.9);
  }

  return null;
}
