export interface Kr36Request {
  headers: Record<string, string>;
  url: string;
}

export interface Kr36ArticleAuthor {
  face?: string;
  id?: number;
  name: string;
  route?: string;
  summary?: string;
  title?: string;
}

export interface Kr36ArticleImage {
  index: number;
  size: string | null;
  url: string;
}

export interface Kr36ArticleStats {
  authorArticleCount: number;
  collect: number;
  comment: number;
  favoriteCount: number;
  likeCount: number;
  praise: number;
}

export interface Kr36ArticleOrganization {
  briefIntro?: string;
  id: number;
  identityName?: string;
  logo?: string;
  name: string;
}

export interface Kr36ArticleListItem {
  author?: string;
  content?: string;
  id: number;
  image?: string;
  publishTime?: number;
  route?: string;
  title: string;
}

export interface Kr36Article {
  author: Kr36ArticleAuthor;
  companyCertifyNick?: string;
  content: {
    html: string;
    paragraphs: string[];
  };
  coverImage?: string;
  id: string;
  imageSources: Array<{ name: string; url: string }>;
  images: Kr36ArticleImage[];
  latestArticles: Kr36ArticleListItem[];
  newestArticles: Kr36ArticleListItem[];
  nextArticle?: Kr36ArticleListItem;
  organizations: Kr36ArticleOrganization[];
  publishTime: {
    iso: string;
    local: string;
    ms: number;
  };
  relatedArticles: Kr36ArticleListItem[];
  request: Kr36Request;
  sourceType?: string;
  stats: Kr36ArticleStats;
  summary: string;
  title: string;
  url: string;
}

export class Kr36CommandError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly exitCode: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'Kr36CommandError';
  }
}
