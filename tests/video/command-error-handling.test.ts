import { describe, expect, it } from 'vitest';

import { AkServiceError } from '../../src/ak/service.js';
import { VideoCommandError } from '../../src/video/types.js';
import { handleVideoCommandError } from '../../src/video/command.js';

describe('VideoCommandError type union handling', () => {
  it('handles VideoCommandError with full metadata', () => {
    let stderr = '';
    const exitCode = handleVideoCommandError(
      new VideoCommandError('VIDEO_NO_CANDIDATE', 'No media found.', 2, {
        sourceUrl: 'https://example.com/watch'
      }),
      {
        stderr: (value) => {
          stderr += value;
        }
      }
    );

    expect(exitCode).toBe(2);
    expect(stderr).toContain('"code": "VIDEO_NO_CANDIDATE"');
    expect(stderr).toContain('"sourceUrl": "https://example.com/watch"');
  });

  it('does not handle unrelated errors', () => {
    const exitCode = handleVideoCommandError(new Error('some other error'), {
      stderr: () => undefined
    });
    expect(exitCode).toBeUndefined();
  });

  it('only handles VideoCommandError, not other Error types with similar shape', () => {
    let stderr = '';
    const exitCode = handleVideoCommandError(
      new AkServiceError('RECORD_NOT_FOUND', 'No record found.', 3),
      {
        stderr: (value) => {
          stderr += value;
        }
      }
    );

    // AkServiceError has 'code' and 'exitCode' but should NOT be handled
    // by handleVideoCommandError - only VideoCommandError should be handled
    expect(exitCode).toBeUndefined();
    expect(stderr).toBe('');
  });
});
