import { describe, expect, it } from 'vitest';

import { renderVideoCommandErrorAsJson } from '../../src/video/output.js';

describe('VideoCommandError JSON rendering', () => {
  it('renders VideoCommandError with details as JSON', () => {
    const json = renderVideoCommandErrorAsJson(
      'VIDEO_NO_CANDIDATE',
      'No media found.',
      { sourceUrl: 'https://example.com/watch' }
    );
    
    const parsed = JSON.parse(json);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe('VIDEO_NO_CANDIDATE');
    expect(parsed.error.message).toBe('No media found.');
    expect(parsed.error.details).toEqual({ sourceUrl: 'https://example.com/watch' });
  });

  it('renders VideoCommandError without details', () => {
    const json = renderVideoCommandErrorAsJson('VIDEO_DOWNLOAD_FAILED', 'failed');
    
    const parsed = JSON.parse(json);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe('VIDEO_DOWNLOAD_FAILED');
    expect(parsed.error.message).toBe('failed');
    expect(parsed.error.details).toBeUndefined();
  });
});
