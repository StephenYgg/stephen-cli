import { describe, expect, it, vi } from 'vitest';

import { createCli } from '../../src/index.js';
import { createAkDatabase } from '../../src/ak/database.js';
import { AkRepository } from '../../src/ak/repository.js';
import type { VideoRuntime } from '../../src/video/runtime.js';

function createVideoRuntime(): VideoRuntime {
  return {
    execFile: vi.fn(async () => ({
      code: 0,
      stderr: '',
      stdout: 'ffmpeg version 7.1'
    })),
    fetch: vi.fn(async (input) => {
      const url = String(input);

      if (url.includes('watch')) {
        return {
          ok: true,
          status: 200,
          text: async () => '<html><body>https://cdn.example.com/master.m3u8</body></html>',
          arrayBuffer: async () => new ArrayBuffer(0),
          headers: new Headers({
            'content-type': 'text/html'
          })
        };
      }

      if (url.endsWith('.m3u8')) {
        return {
          ok: true,
          status: 200,
          text: async () => '#EXTM3U\n#EXTINF:5,\nsegment-1.ts\n',
          arrayBuffer: async () => new ArrayBuffer(0),
          headers: new Headers()
        };
      }

      return {
        ok: true,
        status: 200,
        text: async () => '',
        arrayBuffer: async () => Buffer.from('segment-data'),
        headers: new Headers({
          'content-type': 'video/mp2t'
        })
      };
    }),
    launchBrowserSniffer: vi.fn(async () => [
      {
        type: 'mp4' as const,
        url: 'https://cdn.example.com/browser.mp4',
        origin: 'network' as const,
        mimeType: 'video/mp4',
        confidence: 0.95
      }
    ]),
    writeFile: vi.fn(async () => undefined)
  };
}

describe('stephen video command', () => {
  it('supports sniff, download, and compress with JSON output by default', async () => {
    let stdout = '';
    let stderr = '';

    const cli = createCli({
      repository: new AkRepository(createAkDatabase(':memory:')),
      stderr: (value) => {
        stderr += value;
      },
      stdout: (value) => {
        stdout += value;
      },
      videoRuntime: createVideoRuntime()
    });

    const sniffExitCode = await cli.run(['video', 'sniff', 'https://example.com/watch/1']);
    const downloadExitCode = await cli.run(['video', 'download', 'https://cdn.example.com/master.m3u8']);
    const compressExitCode = await cli.run(['video', 'compress', 'D:/videos/input.mov']);
    const compressTableExitCode = await cli.run(['video', 'compress', 'D:/videos/input.mov', '-t']);

    expect(sniffExitCode).toBe(0);
    expect(downloadExitCode).toBe(0);
    expect(compressExitCode).toBe(0);
    expect(compressTableExitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('"mode": "browser"');
    expect(stdout).toContain('"mediaType": "m3u8"');
    expect(stdout).toContain('"codec": "libx265"');
    expect(stdout).toContain('outputPath');
  });

  it('shows video sniff results as a table with -t', async () => {
    let stdout = '';

    const cli = createCli({
      repository: new AkRepository(createAkDatabase(':memory:')),
      stderr: () => undefined,
      stdout: (value) => {
        stdout += value;
      },
      videoRuntime: createVideoRuntime()
    });

    const exitCode = await cli.run(['video', 'sniff', 'https://example.com/watch/1', '-t']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('type');
    expect(stdout).toContain('browser.mp4');
  });

  it('supports http sniff mode and explicit compression options', async () => {
    let stdout = '';

    const runtime = createVideoRuntime();
    const cli = createCli({
      repository: new AkRepository(createAkDatabase(':memory:')),
      stderr: () => undefined,
      stdout: (value) => {
        stdout += value;
      },
      videoRuntime: runtime
    });

    const sniffExitCode = await cli.run([
      'video',
      'sniff',
      'https://example.com/watch/1',
      '--mode',
      'http'
    ]);
    const compressExitCode = await cli.run([
      'video',
      'compress',
      'D:/videos/input',
      '--output-path',
      'D:/videos/output.mp4',
      '--audio-bitrate',
      '96k',
      '--video-bitrate',
      '1500k',
      '--resolution',
      '1280x720'
    ]);

    expect(sniffExitCode).toBe(0);
    expect(compressExitCode).toBe(0);
    expect(stdout).toContain('"mode": "http"');
    expect(stdout).toContain('"outputPath": "D:/videos/output.mp4"');
  });

  it('renders video command errors as JSON and supports table output for download and compress', async () => {
    let stdout = '';
    let stderr = '';

    const cli = createCli({
      repository: new AkRepository(createAkDatabase(':memory:')),
      stderr: (value) => {
        stderr += value;
      },
      stdout: (value) => {
        stdout += value;
      },
      videoRuntime: {
        execFile: vi.fn(async () => ({
          code: 1,
          stderr: 'ffmpeg not found',
          stdout: ''
        })),
        fetch: vi.fn(async (input) => ({
          ok: true,
          status: 200,
          text: async () => {
            const url = String(input);
            return url.endsWith('.m3u8') ? '#EXTM3U\n#EXTINF:1,\na.ts\n' : '';
          },
          arrayBuffer: async () => Buffer.from('a'),
          headers: new Headers()
        })),
        launchBrowserSniffer: vi.fn(async () => []),
        writeFile: vi.fn(async () => undefined)
      }
    });

    const downloadExitCode = await cli.run([
      'video',
      'download',
      'https://cdn.example.com/master.m3u8',
      '--output-dir',
      'D:/videos',
      '-t'
    ]);
    const compressTableExitCode = await cli.run(['video', 'compress', 'D:/videos/input.mov', '-t']);
    const compressExitCode = await cli.run(['video', 'compress', 'D:/videos/input.mov']);

    expect(downloadExitCode).toBe(0);
    expect(compressTableExitCode).toBe(2);
    expect(compressExitCode).toBe(2);
    expect(stdout).toContain('mediaType');
    expect(stderr).toContain('"code": "VIDEO_FFMPEG_MISSING"');
  });
});
