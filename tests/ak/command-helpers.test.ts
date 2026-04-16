import { describe, expect, it } from 'vitest';

import { applyTableShortcut } from '../../src/ak/command.js';

describe('applyTableShortcut', () => {
  it('prefers table mode when the shortcut flag is present', () => {
    expect(applyTableShortcut({ format: 'json', table: true })).toEqual({
      format: 'table',
      table: true
    });
  });

  it('keeps an explicit format when table mode is not set', () => {
    expect(applyTableShortcut({ format: 'table' })).toEqual({
      format: 'table'
    });
  });

  it('rejects options without a resolvable format', () => {
    expect(() => applyTableShortcut({})).toThrow('Output format is required for this command.');
  });
});
