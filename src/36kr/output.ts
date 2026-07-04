import type { Kr36Article } from './types.js';

export function renderKr36ArticleAsJson(article: Kr36Article): string {
  return JSON.stringify(
    {
      ok: true,
      data: article
    },
    null,
    2
  );
}

export function renderKr36CommandErrorAsJson(
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
