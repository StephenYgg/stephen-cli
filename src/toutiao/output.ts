import type { ToutiaoArticle, ToutiaoAuthorResult, ToutiaoListResult } from './types.js';

export function renderToutiaoListAsJson(result: ToutiaoListResult): string {
  return JSON.stringify(
    {
      ok: true,
      data: result
    },
    null,
    2
  );
}

export function renderToutiaoArticleAsJson(article: ToutiaoArticle): string {
  return JSON.stringify(
    {
      ok: true,
      data: article
    },
    null,
    2
  );
}

export function renderToutiaoAuthorAsJson(result: ToutiaoAuthorResult): string {
  return JSON.stringify(
    {
      ok: true,
      data: result
    },
    null,
    2
  );
}

export function renderToutiaoCommandErrorAsJson(
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
