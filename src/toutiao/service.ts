import type { ToutiaoRuntime } from './runtime.js';
import {
  ToutiaoCommandError,
  type ToutiaoArticle,
  type ToutiaoAuthorResult,
  type ToutiaoListResult,
  type ToutiaoSource
} from './types.js';

const SUPPORTED_SOURCES = new Set<ToutiaoSource>(['tech', 'AI', '光刻机', '芯片', '半导体']);

export class ToutiaoService {
  constructor(private readonly dependencies: { runtime: ToutiaoRuntime }) {}

  async article(input: string): Promise<ToutiaoArticle> {
    const url = buildToutiaoArticleUrl(input);

    return this.dependencies.runtime.fetchArticle({
      input,
      url
    });
  }

  async author(input: string, options: {
    pages?: number;
    withContent?: boolean;
  } = {}): Promise<ToutiaoAuthorResult> {
    const authorToken = buildToutiaoAuthorToken(input);
    const pages = normalizePages(options.pages);
    const url = buildToutiaoAuthorUrl(authorToken);
    const runtimeResult = await this.dependencies.runtime.fetchAuthorArticles({
      authorToken,
      pages,
      url
    });
    const withContent = options.withContent ?? false;
    const result: ToutiaoAuthorResult = {
      ...runtimeResult,
      meta: {
        fetchedPages: pages,
        totalItems: runtimeResult.items.length,
        withContent
      },
      request: {
        input,
        url
      }
    };

    if (withContent) {
      const articles: ToutiaoArticle[] = [];

      for (const item of runtimeResult.items) {
        articles.push(await this.dependencies.runtime.fetchArticle({
          input: item.id,
          url: buildToutiaoArticleUrl(item.url || item.id)
        }));
      }

      result.articles = articles;
      result.meta.totalArticles = articles.length;
    }

    return result;
  }

  async list(options: {
    pages?: number;
    source: string;
  }): Promise<ToutiaoListResult> {
    const source = parseSource(options.source);
    const pages = normalizePages(options.pages);
    const runtimeResult = source === 'tech'
      ? await this.dependencies.runtime.fetchTechnologyChannel({ pages })
      : await this.dependencies.runtime.fetchKeywordInformation({
        keyword: source,
        pages,
        source
      });

    return {
      ...runtimeResult,
      meta: {
        fetchedPages: pages,
        totalItems: runtimeResult.items.length
      }
    };
  }
}

export function buildToutiaoAuthorToken(input: string): string {
  const trimmed = input.trim();

  if (/^[A-Za-z0-9._-]+$/.test(trimmed) && trimmed.length >= 12) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const token = /\/c\/user\/token\/([^/?#]+)/.exec(url.pathname)?.[1];

    if (token && isToutiaoHost(url.hostname)) {
      return decodeURIComponent(token);
    }
  } catch {
    // Fall through to the explicit command error below.
  }

  throw new ToutiaoCommandError(
    'TOUTIAO_INVALID_AUTHOR',
    'Toutiao author must be a user token or a /c/user/token/<token>/ homepage URL.',
    2,
    {
      input
    }
  );
}

export function buildToutiaoAuthorUrl(authorToken: string): string {
  return `https://www.toutiao.com/c/user/token/${encodeURIComponent(authorToken)}/`;
}

export function buildToutiaoArticleUrl(input: string): string {
  const trimmed = input.trim();

  if (/^\d+$/.test(trimmed)) {
    return `https://www.toutiao.com/article/${trimmed}/`;
  }

  try {
    const url = new URL(trimmed);
    const id = /(?:article|group)\/(\d+)/.exec(url.pathname)?.[1]
      ?? /^\/a(\d+)/.exec(url.pathname)?.[1];

    if (id && isToutiaoHost(url.hostname)) {
      return `https://www.toutiao.com/article/${id}/`;
    }

    const nextUrl = url.searchParams.get('url');

    if (nextUrl) {
      return buildToutiaoArticleUrl(nextUrl);
    }
  } catch {
    // Fall through to the explicit command error below.
  }

  throw new ToutiaoCommandError(
    'TOUTIAO_INVALID_ARTICLE',
    'Toutiao article must be a numeric id or a toutiao article/group URL.',
    2,
    {
      input
    }
  );
}

function isToutiaoHost(hostname: string): boolean {
  return hostname === 'www.toutiao.com' || hostname === 'toutiao.com';
}

function parseSource(source: string): ToutiaoSource {
  if (SUPPORTED_SOURCES.has(source as ToutiaoSource)) {
    return source as ToutiaoSource;
  }

  throw new ToutiaoCommandError(
    'TOUTIAO_INVALID_SOURCE',
    'Toutiao list only supports tech, AI, 光刻机, 芯片, and 半导体.',
    2,
    {
      source,
      supportedSources: [...SUPPORTED_SOURCES]
    }
  );
}

function normalizePages(pages: number | undefined): number {
  const value = pages ?? 1;

  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new ToutiaoCommandError(
      'TOUTIAO_INVALID_PAGES',
      'Toutiao list pages must be an integer between 1 and 5.',
      2,
      {
        pages: value
      }
    );
  }

  return value;
}
