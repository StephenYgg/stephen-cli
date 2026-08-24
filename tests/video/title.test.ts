import { describe, expect, it } from 'vitest';

import { extractVideoTitleFromHtml } from '../../src/video/sniff/title.js';

describe('extractVideoTitleFromHtml', () => {
  it('prefers and normalizes the Open Graph title', () => {
    expect(
      extractVideoTitleFromHtml(
        '<meta property="og:title" content="  Example   Video  "><title>Fallback</title>'
      )
    ).toBe('Example Video');
  });

  it('falls back to the document title', () => {
    expect(extractVideoTitleFromHtml('<title>  Document\n Title  </title>')).toBe('Document Title');
  });

  it('falls back to the document title when the Open Graph title is blank', () => {
    expect(
      extractVideoTitleFromHtml(
        '<meta property="og:title" content="   "><title>Document Title</title>'
      )
    ).toBe('Document Title');
  });

  it('returns undefined when the document has no usable title', () => {
    expect(extractVideoTitleFromHtml('<html><head><title>   </title></head></html>')).toBeUndefined();
  });
});
