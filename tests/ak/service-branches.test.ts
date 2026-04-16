import { describe, expect, it, vi } from 'vitest';

describe('AkService defensive branches', () => {
  it('maps non-Error field parsing failures to invalid argument errors', async () => {
    vi.resetModules();
    vi.doMock('../../src/ak/schema.js', async () => {
      const actual = await vi.importActual<typeof import('../../src/ak/schema.js')>(
        '../../src/ak/schema.js'
      );

      return {
        ...actual,
        parseAkQueryFields: () => {
          throw 'boom';
        }
      };
    });

    const { createAkDatabase } = await import('../../src/ak/database.js');
    const { AkRepository } = await import('../../src/ak/repository.js');
    const { AkService } = await import('../../src/ak/service.js');

    const service = new AkService({
      masterKey: Buffer.from('0123456789abcdef0123456789abcdef', 'utf8'),
      now: () => '2026-04-16T00:00:00.000Z',
      repository: new AkRepository(createAkDatabase(':memory:'))
    });

    expect(() =>
      service.list({
        field: 'userName',
        query: 'ste'
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'INVALID_ARGUMENT',
        message: 'Invalid query fields.'
      })
    );

    vi.doUnmock('../../src/ak/schema.js');
    vi.resetModules();
  });
});
