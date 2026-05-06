import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  createCandidateFromBrowserResponse,
  createDefaultVideoRuntime,
  sniffWithBrowserRuntime
} from '../../src/video/runtime.js';

describe('createDefaultVideoRuntime', () => {
  it('wraps execFile, fetch, writeFile, and reports missing browser support', async () => {
    const runtime = createDefaultVideoRuntime();
    const tempDir = mkdtempSync(join(tmpdir(), 'stephen-video-'));
    const outputPath = join(tempDir, 'sample.txt');

    await expect(runtime.execFile('node', ['-e', "process.stdout.write('ok')"])).resolves.toEqual({
      code: 0,
      stderr: '',
      stdout: 'ok'
    });
    await expect(runtime.fetch('data:text/plain,hello')).resolves.toMatchObject({
      ok: true,
      status: 200
    });
    await runtime.writeFile(outputPath, Buffer.from('hello'));
    expect(readFileSync(outputPath, 'utf8')).toBe('hello');
    await expect(runtime.launchBrowserSniffer('https://example.com/watch')).rejects.toMatchObject({
      code: 'VIDEO_BROWSER_UNAVAILABLE',
      recoverable: true
    });
    await expect(runtime.execFile('definitely-missing-command', [])).resolves.toMatchObject({
      code: 1
    });
    await expect(
      runtime.execFile('node', ['-e', "process.stderr.write('bad'); process.exit(5)"])
    ).resolves.toMatchObject({
      code: 5,
      stderr: 'bad',
      stdout: ''
    });
    await expect(
      runtime.execFile('node', ['-e', "process.stdout.write('ok'); process.stderr.write('bad'); process.exit(5)"])
    ).resolves.toMatchObject({
      code: 5,
      stderr: 'bad',
      stdout: 'ok'
    });
  });

  it('sniffs browser candidates through an injected browser module and validates chromium availability', async () => {
    const recordedHandlers: Array<(response: { headers: () => Record<string, string>; url: () => string }) => void> = [];
    const closeBrowserCalls: string[] = [];

    const candidates = await sniffWithBrowserRuntime(
      'https://example.com/watch',
      async () => ({
        chromium: {
          launch: async () => ({
            close: async () => {
              closeBrowserCalls.push('browser');
            },
            newContext: async () => ({
              close: async () => {
                closeBrowserCalls.push('context');
              },
              newPage: async () => ({
                goto: async () => {
                  for (const handler of recordedHandlers) {
                    handler({
                      headers: () => ({
                        'content-type': 'application/octet-stream'
                      }),
                      url: () => 'https://cdn.example.com/other.bin'
                    });
                    handler({
                      headers: () => ({
                        'content-type': 'video/mp4'
                      }),
                      url: () => 'https://cdn.example.com/video.mp4'
                    });
                    handler({
                      headers: () => ({
                        'content-type': 'application/vnd.apple.mpegurl'
                      }),
                      url: () => 'https://cdn.example.com/master.m3u8'
                    });
                  }
                },
                on: (_event: 'response', handler: (response: { headers: () => Record<string, string>; url: () => string }) => void) => {
                  recordedHandlers.push(handler);
                },
                waitForTimeout: async () => undefined
              })
            })
          })
        }
      })
    );

    expect(candidates).toEqual([
      {
        confidence: 0,
        mimeType: 'application/vnd.apple.mpegurl',
        origin: 'network',
        type: 'm3u8',
        url: 'https://cdn.example.com/master.m3u8'
      },
      {
        confidence: 0,
        mimeType: 'video/mp4',
        origin: 'network',
        type: 'mp4',
        url: 'https://cdn.example.com/video.mp4'
      }
    ]);
    expect(closeBrowserCalls).toEqual(['context', 'browser']);
    expect(createCandidateFromBrowserResponse('https://cdn.example.com/other.bin', 'application/octet-stream')).toBeNull();
    await expect(
      sniffWithBrowserRuntime('https://example.com/watch', async () => ({}))
    ).rejects.toMatchObject({
      code: 'VIDEO_BROWSER_UNAVAILABLE',
      recoverable: true
    });
  });
});
