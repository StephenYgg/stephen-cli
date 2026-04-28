import { describe, expect, it } from 'vitest';
import { optional } from '../../src/video/utils.js';

describe('optional', () => {
  it('returns partial record when value is a non-empty string', () => {
    expect(optional('outputDir', '/output')).toEqual({ outputDir: '/output' });
  });

  it('returns empty object when value is undefined', () => {
    expect(optional('outputDir', undefined)).toEqual({});
  });

  it('returns empty object when value is null', () => {
    expect(optional('outputDir', null)).toEqual({});
  });

  it('returns partial record when value is false boolean', () => {
    expect(optional('noProxy', false)).toEqual({ noProxy: false });
  });

  it('returns partial record when value is zero', () => {
    expect(optional('count', 0)).toEqual({ count: 0 });
  });

  it('returns empty object when value is empty string', () => {
    expect(optional('key', '')).toEqual({});
  });
});
