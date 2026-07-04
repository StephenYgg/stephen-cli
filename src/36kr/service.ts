import type { Kr36Runtime } from './runtime.js';
import {
  Kr36CommandError,
  type Kr36Article,
  type Kr36ArticleAuthor,
  type Kr36ArticleImage,
  type Kr36ArticleListItem,
  type Kr36ArticleOrganization,
  type Kr36ArticleStats,
  type Kr36Request
} from './types.js';

export const KR36_BROWSER_HEADERS: Record<string, string> = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  Referer: 'https://36kr.com/',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
};

interface Kr36InitialState {
  articleDetail?: {
    articleDetailData?: {
      data?: Kr36RawArticle;
    };
    articleRecommendData?: Kr36RawRecommendData;
    favoriteCount?: number;
    likeCount?: number;
    organArticleData?: {
      data?: {
        organizationList?: Kr36ArticleOrganization[];
      };
    };
    latestArticle?: {
      articleLatestList?: Array<{ id: number; title: string }>;
    };
  };
}

interface Kr36RawArticle {
  author?: string;
  authorFace?: string;
  authorId?: number;
  authorRoute?: string;
  companyCertifyNick?: string;
  imgSources?: Array<{ name: string; url: string }>;
  itemId?: number;
  popinImage?: string;
  publishTime?: number;
  sourceType?: string;
  summary?: string;
  widgetContent?: string;
  widgetTitle?: string;
}

interface Kr36RawRecommendData {
  authorFace?: string;
  authorName?: string;
  authorSummary?: string;
  authorTitle?: string;
  newestItemList?: Array<{
    itemContent?: string;
    itemId: number;
    itemRoute?: string;
    itemTitle: string;
    publishTime?: number;
  }>;
  nextItem?: {
    authorId?: number;
    itemContent?: string;
    itemId: number;
    itemRoute?: string;
    itemTitle: string;
    publishTime?: number;
  };
  relateArticleList?: Array<{
    author?: string;
    authorName?: string;
    itemId: number;
    route?: string;
    widgetImage?: string;
    widgetTitle: string;
  }>;
  statArticle?: number;
  statCollect?: number;
  statComment?: number;
  statPraise?: number;
}

export class Kr36ArticleService {
  constructor(private readonly runtime: Pick<Kr36Runtime, 'fetchArticleHtml'>) {}

  async getArticle(articleId: string): Promise<Kr36Article> {
    assertArticleId(articleId);
    const request = buildKr36ArticleRequest(articleId);
    const html = await this.runtime.fetchArticleHtml(request);
    const initialState = parseInitialState(html);
    const articleDetail = initialState.articleDetail;
    const rawArticle = articleDetail?.articleDetailData?.data;

    if (!rawArticle) {
      throw new Kr36CommandError(
        'KR36_PARSE_ERROR',
        '36kr article data was not found in window.initialState.',
        2
      );
    }

    const contentHtml = rawArticle.widgetContent ?? '';
    const recommend = articleDetail?.articleRecommendData ?? {};
    const publishTime = rawArticle.publishTime ?? 0;
    const article: Kr36Article = {
      author: buildAuthor(rawArticle, recommend),
      content: {
        html: contentHtml,
        paragraphs: extractParagraphs(contentHtml)
      },
      id: String(rawArticle.itemId ?? articleId),
      imageSources: rawArticle.imgSources ?? [],
      images: extractImages(contentHtml),
      latestArticles: (articleDetail?.latestArticle?.articleLatestList ?? []).map((item) => ({
        id: item.id,
        title: item.title
      })),
      newestArticles: (recommend.newestItemList ?? []).map((item) => {
        const listItem: Kr36ArticleListItem = {
          id: item.itemId,
          title: item.itemTitle
        };

        if (item.itemContent !== undefined) {
          listItem.content = item.itemContent;
        }
        if (item.publishTime !== undefined) {
          listItem.publishTime = item.publishTime;
        }
        if (item.itemRoute !== undefined) {
          listItem.route = item.itemRoute;
        }

        return listItem;
      }),
      organizations: articleDetail?.organArticleData?.data?.organizationList ?? [],
      publishTime: {
        iso: publishTime ? new Date(publishTime).toISOString() : '',
        local: publishTime ? formatChinaTime(publishTime) : '',
        ms: publishTime
      },
      relatedArticles: (recommend.relateArticleList ?? []).map((item) => {
        const listItem: Kr36ArticleListItem = {
          id: item.itemId,
          title: item.widgetTitle
        };
        const author = item.author ?? item.authorName;

        if (author !== undefined) {
          listItem.author = author;
        }
        if (item.widgetImage !== undefined) {
          listItem.image = item.widgetImage;
        }
        if (item.route !== undefined) {
          listItem.route = item.route;
        }

        return listItem;
      }),
      request,
      stats: buildStats(articleDetail?.likeCount, articleDetail?.favoriteCount, recommend),
      summary: rawArticle.summary ?? '',
      title: rawArticle.widgetTitle ?? '',
      url: request.url
    };

    if (rawArticle.companyCertifyNick !== undefined) {
      article.companyCertifyNick = rawArticle.companyCertifyNick;
    }

    if (rawArticle.popinImage !== undefined) {
      article.coverImage = rawArticle.popinImage;
    }

    if (recommend.nextItem) {
      article.nextArticle = {
        id: recommend.nextItem.itemId,
        title: recommend.nextItem.itemTitle
      };

      if (recommend.nextItem.itemContent !== undefined) {
        article.nextArticle.content = recommend.nextItem.itemContent;
      }
      if (recommend.nextItem.publishTime !== undefined) {
        article.nextArticle.publishTime = recommend.nextItem.publishTime;
      }
      if (recommend.nextItem.itemRoute !== undefined) {
        article.nextArticle.route = recommend.nextItem.itemRoute;
      }
    }

    if (rawArticle.sourceType !== undefined) {
      article.sourceType = rawArticle.sourceType;
    }

    return article;
  }
}

export function buildKr36ArticleUrl(articleId: string): string {
  assertArticleId(articleId);
  return `https://36kr.com/p/${articleId}?f=rss`;
}

export function buildKr36ArticleRequest(articleId: string): Kr36Request {
  return {
    headers: KR36_BROWSER_HEADERS,
    url: buildKr36ArticleUrl(articleId)
  };
}

function assertArticleId(articleId: string): void {
  if (!/^\d+$/.test(articleId)) {
    throw new Kr36CommandError(
      'KR36_INVALID_ARTICLE_ID',
      '36kr article id must contain digits only.',
      2,
      {
        articleId
      }
    );
  }
}

function parseInitialState(html: string): Kr36InitialState {
  const match = /window\.initialState=(\{[\s\S]*?\})\s*;?\s*<\/script>/.exec(html);

  if (!match?.[1]) {
    throw new Kr36CommandError(
      'KR36_PARSE_ERROR',
      'window.initialState was not found in the 36kr article page.',
      2
    );
  }

  try {
    return JSON.parse(match[1]) as Kr36InitialState;
  } catch (error) {
    throw new Kr36CommandError(
      'KR36_PARSE_ERROR',
      'Failed to parse window.initialState from the 36kr article page.',
      2,
      {
        cause: error instanceof Error ? error.message : String(error)
      }
    );
  }
}

function extractImages(html: string): Kr36ArticleImage[] {
  return [...html.matchAll(/<img\b[^>]*>/gi)].map((match, index) => {
    const tag = match[0];
    return {
      index: index + 1,
      size: getAttribute(tag, 'data-img-size-val'),
      url: getAttribute(tag, 'src') ?? ''
    };
  }).filter((image) => image.url);
}

function extractParagraphs(html: string): string[] {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .split(/\n+/)
    .map((value) => decodeHtmlEntities(value).trim())
    .filter(Boolean);
}

function getAttribute(tag: string, name: string): string | null {
  const match = new RegExp(`${name}=["']([^"']+)["']`, 'i').exec(tag);
  return match?.[1] ?? null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function buildStats(
  likeCount: number | undefined,
  favoriteCount: number | undefined,
  recommend: Kr36RawRecommendData
): Kr36ArticleStats {
  return {
    authorArticleCount: recommend.statArticle ?? 0,
    collect: recommend.statCollect ?? 0,
    comment: recommend.statComment ?? 0,
    favoriteCount: favoriteCount ?? 0,
    likeCount: likeCount ?? 0,
    praise: recommend.statPraise ?? 0
  };
}

function buildAuthor(
  rawArticle: Kr36RawArticle,
  recommend: Kr36RawRecommendData
): Kr36ArticleAuthor {
  const author: Kr36ArticleAuthor = {
    name: rawArticle.author ?? recommend.authorName ?? ''
  };
  const face = rawArticle.authorFace ?? recommend.authorFace;

  if (face !== undefined) {
    author.face = face;
  }
  if (rawArticle.authorId !== undefined) {
    author.id = rawArticle.authorId;
  }
  if (rawArticle.authorRoute !== undefined) {
    author.route = rawArticle.authorRoute;
  }
  if (recommend.authorSummary !== undefined) {
    author.summary = recommend.authorSummary;
  }
  if (recommend.authorTitle !== undefined) {
    author.title = recommend.authorTitle;
  }

  return author;
}

function formatChinaTime(timestampMs: number): string {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric'
  });

  return formatter.format(new Date(timestampMs));
}
