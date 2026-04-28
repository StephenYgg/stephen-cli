import { describe, expect, it, vi } from 'vitest';
import { DirectVideoDownloadDriver } from '../../src/video/download/direct-driver.js';

describe('Buffer conversion simplification', () => {
  // Issue 6: Buffer.from(payload) is called regardless of type - redundant conditional
  // Both branches do the same thing: Buffer.from(payload)
  // The payload from arrayBuffer() is always ArrayBuffer | Uint8Array, both work with Buffer.from()
  // This test verifies the simplification works
  
  it('handles Uint8Array arrayBuffer correctly', async () => {
    const writes: Array<{ path: string; data: Buffer }> = [];
    const driver = new DirectVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async () => ({
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
          headers: new Headers(),
          ok: true,
          status: 200,
          text: async () => ''
        })),
        writeFile: vi.fn(async (path, data) => {
          writes.push({ path, data: Buffer.from(data) });
        })
      }
    });

    await driver.download({ sourceUrl: 'https://cdn.example.com/video.mp4' });
    expect(writes[0].data[0]).toBe(1);
    expect(writes[0].data[1]).toBe(2);
    expect(writes[0].data[2]).toBe(3);
  });

  it('handles regular ArrayBuffer correctly', async () => {
    const writes: Array<{ path: string; data: Buffer }> = [];
    const driver = new DirectVideoDownloadDriver({
      runtime: {
        fetch: vi.fn(async () => ({
          arrayBuffer: async () => new ArrayBuffer(3),
          headers: new Headers(),
          ok: true,
          status: 200,
          text: async () => ''
        })),
        writeFile: vi.fn(async (path, data) => {
          writes.push({ path, data: Buffer.from(data) });
        })
      }
    });

    await driver.download({ sourceUrl: 'https://cdn.example.com/video.mp4' });
    expect(writes[0].data.byteLength).toBe(3);
  });
});
