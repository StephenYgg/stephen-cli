import type { HackerNewsSearchResult, HackerNewsStoriesResult } from './types.js';

export function renderHackerNewsStoriesAsJson(result: HackerNewsStoriesResult): string {
  return JSON.stringify(
    {
      ok: true,
      data: result
    },
    null,
    2
  );
}

export function renderHackerNewsSearchAsJson(result: HackerNewsSearchResult): string {
  return JSON.stringify(
    {
      ok: true,
      data: result
    },
    null,
    2
  );
}

export function renderHackerNewsCommandErrorAsJson(
  code: string,
  message: string,
  details?: unknown
): string {
  return JSON.stringify(
    {
      ok: false,
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details })
      }
    },
    null,
    2
  );
}
