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
    expect(
      createCandidateFromBrowserResponse(
        'https://cdn.example.com/key=abc,end=1/media=hls4A/2026-08/_TPL_.mp4',
        'application/vnd.apple.mpegurl'
      )
    ).toMatchObject({
      confidence: 0.95,
      type: 'm3u8',
      url: 'https://cdn.example.com/key=abc,end=1/media=hls4A/2026-08/_TPL_.mp4'
    });
    expect(
      createCandidateFromBrowserResponse(
        'https://cdn.example.com/key=abc,end=1/media=hls4A/2026-08/_TPL_.mp4'
      )
    ).toMatchObject({
      type: 'm3u8'
    });
    expect(
      createCandidateFromBrowserResponse(
        'https://cdn.example.com/thumbs/full/hash.mp4',
        'video/mp4'
      )
    ).toBeNull();
    expect(
      createCandidateFromBrowserResponse('https://cdn.example.com/live', 'application/x-mpegURL')
    ).toMatchObject({
      type: 'm3u8',
      url: 'https://cdn.example.com/live'
    });
    expect(
      createCandidateFromBrowserResponse('https://cdn.example.com/chunk.m4s', 'video/iso.segment')
    ).toBeNull();
    expect(
      createCandidateFromBrowserResponse('https://cdn.example.com/mp4a/128000/audio.m3u8')
    ).toBeNull();
    expect(
      createCandidateFromBrowserResponse('https://cdn.example.com/mp4a/audio.mp4', 'video/mp4')
    ).toBeNull();
    expect(
      createCandidateFromBrowserResponse(
        'https://cdn.example.com/avc1/1920x1080/video.mp4',
        'video/mp4'
      )
    ).toMatchObject({
      type: 'mp4',
      confidence: 0.05
    });
    expect(
      createCandidateFromBrowserResponse('https://cdn.example.com/pv/preview.mp4', 'video/mp4')
    ).toBeNull();
    expect(
      createCandidateFromBrowserResponse('https://cdn.example.com/media', 'video/mp4')
    ).toMatchObject({
      type: 'mp4',
      url: 'https://cdn.example.com/media'
    });


    await expect(
      sniffWithBrowserRuntime('https://example.com/watch', async () => ({}))
    ).rejects.toMatchObject({
      code: 'VIDEO_BROWSER_UNAVAILABLE',
      recoverable: true
    });
  });
});
