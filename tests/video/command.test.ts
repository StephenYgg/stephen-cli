import { describe, expect, it } from 'vitest';

import {
  applyVideoTableShortcut,
  handleVideoCommandError
} from '../../src/video/command.js';
import { VideoCommandError } from '../../src/video/types.js';

describe('video command helpers', () => {
  it('maps video command errors to stderr JSON and leaves unknown errors alone', () => {
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
    let fallbackStderr = '';
    expect(
      handleVideoCommandError(new VideoCommandError('VIDEO_DOWNLOAD_FAILED', 'boom'), {
        stderr: (value) => {
          fallbackStderr += value;
        }
      })
    ).toBe(2);
    expect(fallbackStderr).toContain('"code": "VIDEO_DOWNLOAD_FAILED"');
    expect(handleVideoCommandError(new Error('boom'), { stderr: () => undefined })).toBeUndefined();
  });

  it('applies table shortcuts and throws when no format is present', () => {
    expect(applyVideoTableShortcut({ format: 'json' })).toEqual({
      format: 'json'
    });
    expect(applyVideoTableShortcut({ table: true })).toEqual({
      format: 'table',
      table: true
    });
    expect(() => applyVideoTableShortcut({})).toThrow('Output format is required for this command.');
  });
});
