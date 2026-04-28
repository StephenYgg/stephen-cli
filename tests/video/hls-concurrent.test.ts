import { describe, expect, it, vi } from 'vitest';
import { HlsVideoDownloadDriver } from '../../src/video/download/hls-driver.js';

describe('HLS concurrent downloads', () => {
  it('downloads segments concurrently for faster download', async () => {
    const fetchStartTimes: number[] = [];
    const fetchEndTimes: number[] = [];
    const startTime = Date.now();
    const segmentCount = 6;
    const segmentUrls = Array.from({ length: segmentCount }, (_, i) => 
      `https://cdn.example.com/seg-${i}.ts`
    );
    
    // Create a valid m3u8 playlist with segment URLs
    const playlistContent = segmentUrls.join('\n');
    
    const driver = new HlsVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async (url) => {
          fetchStartTimes.push(Date.now() - startTime);
          // Simulate network delay
          await new Promise(r => setTimeout(r, 50));
          fetchEndTimes.push(Date.now() - startTime);
          const idx = segmentUrls.indexOf(String(url));
          if (idx >= 0) {
            return {
              ok: true,
              status: 200,
              text: async () => '',
              arrayBuffer: async () => new Uint8Array([idx]),
              headers: new Headers()
            };
          }
          // Master playlist request
          return {
            ok: true,
            status: 200,
            text: async () => playlistContent,
            arrayBuffer: async () => new Uint8Array(),
            headers: new Headers()
          };
        }),
        writeFile: vi.fn(async () => undefined)
      }
    });

    await driver.download({
      sourceUrl: 'https://cdn.example.com/master.m3u8'
    });

    // With concurrent downloads, all segment fetches should start at nearly the same time
    // Sequential: segments start at 0, 50, 100, 150, 200, 250ms
    // Concurrent: segments start at 0, 0, 0, 0, 0, 0ms (within a few ms)
    const firstStartTime = fetchStartTimes[0];
    const maxStartTime = Math.max(...fetchStartTimes);
    const startTimeSpread = maxStartTime - firstStartTime;

    // If sequential, the spread would be ~250ms (5 * 50ms). If concurrent, should be < 100ms
    // Allow some overhead for test infrastructure
    expect(startTimeSpread).toBeLessThan(100);
    
    // Total time should also be much less than sequential
    const lastSegmentEndTime = Math.max(...fetchEndTimes);
    expect(lastSegmentEndTime).toBeLessThan(150);
  });
});
