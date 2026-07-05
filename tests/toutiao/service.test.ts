import { describe, expect, it, vi } from 'vitest';

import {
  buildToutiaoArticleUrl,
  buildToutiaoAuthorToken,
  ToutiaoService
} from '../../src/toutiao/service.js';
import { ToutiaoCommandError } from '../../src/toutiao/types.js';

describe('ToutiaoService', () => {
  it('fetches the technology channel through the browser runtime', async () => {
    const fetchTechnologyChannel = vi.fn(async () => ({
      hasMore: true,
      items: [
        {
          id: '7657359132571255323',
          title: '人类登月的最大难题，不是真空，也不是辐射，而是脚下的月尘！',
          url: 'https://toutiao.com/group/7657359132571255323/'
        }
      ],
      next: {
        maxBehotTime: 1783244242,
        offset: 15
      },
      source: 'tech' as const
    }));
    const service = new ToutiaoService({
      runtime: {
        fetchArticle: vi.fn(),
        fetchAuthorArticles: vi.fn(),
        fetchKeywordInformation: vi.fn(),
        fetchTechnologyChannel
      }
    });

    const result = await service.list({ pages: 1, source: 'tech' });

    expect(fetchTechnologyChannel).toHaveBeenCalledWith({
      pages: 1
    });
    expect(result.source).toBe('tech');
    expect(result.items[0]?.title).toContain('月尘');
    expect(result.meta.totalItems).toBe(1);
  });

  it('fetches supported keyword sources through Toutiao search', async () => {
    const fetchKeywordInformation = vi.fn(async () => ({
      hasMore: false,
      items: [
        {
          id: '7658211264790839862',
          title: '谷歌才是AI相机鼻祖?Clip上手:拍照很粗糙，理念很超前',
          url: 'https://www.toutiao.com/article/7658211264790839862/'
        }
      ],
      keyword: 'AI',
      source: 'AI' as const
    }));
    const service = new ToutiaoService({
      runtime: {
        fetchArticle: vi.fn(),
        fetchAuthorArticles: vi.fn(),
        fetchKeywordInformation,
        fetchTechnologyChannel: vi.fn()
      }
    });

    const result = await service.list({ pages: 1, source: 'AI' });

    expect(fetchKeywordInformation).toHaveBeenCalledWith({
      keyword: 'AI',
      pages: 1,
      source: 'AI'
    });
    expect(result.source).toBe('AI');
    expect(result.items[0]?.title).toContain('AI相机');
  });

  it('rejects unsupported sources', async () => {
    const service = new ToutiaoService({
      runtime: {
        fetchArticle: vi.fn(),
        fetchAuthorArticles: vi.fn(),
        fetchKeywordInformation: vi.fn(),
        fetchTechnologyChannel: vi.fn()
      }
    });

    await expect(service.list({ pages: 1, source: '财经' })).rejects.toMatchObject({
      code: 'TOUTIAO_INVALID_SOURCE',
      exitCode: 2
    });
  });

  it('normalizes invalid pages into command errors', async () => {
    const service = new ToutiaoService({
      runtime: {
        fetchArticle: vi.fn(),
        fetchAuthorArticles: vi.fn(),
        fetchKeywordInformation: vi.fn(),
        fetchTechnologyChannel: vi.fn()
      }
    });

    await expect(service.list({ pages: 0, source: 'tech' })).rejects.toBeInstanceOf(ToutiaoCommandError);
    await expect(service.list({ pages: 0, source: 'tech' })).rejects.toMatchObject({
      code: 'TOUTIAO_INVALID_PAGES'
    });
  });

  it('fetches article detail by id', async () => {
    const fetchArticle = vi.fn(async () => ({
      authorName: '宇宙边界',
      content: {
        paragraphs: ['你敢相信吗？如果人类在未来成功登上月球。'],
        text: '你敢相信吗？如果人类在未来成功登上月球。'
      },
      id: '7657359132571255323',
      publishTimeText: '2026-07-03 20:08',
      request: {
        input: '7657359132571255323',
        url: 'https://www.toutiao.com/article/7657359132571255323/'
      },
      title: '人类登月的最大难题，不是真空，也不是辐射，而是脚下的月尘！',
      url: 'https://www.toutiao.com/article/7657359132571255323/?wid=1783253373011'
    }));
    const service = new ToutiaoService({
      runtime: {
        fetchArticle,
        fetchAuthorArticles: vi.fn(),
        fetchKeywordInformation: vi.fn(),
        fetchTechnologyChannel: vi.fn()
      }
    });

    const article = await service.article('7657359132571255323');

    expect(fetchArticle).toHaveBeenCalledWith({
      input: '7657359132571255323',
      url: 'https://www.toutiao.com/article/7657359132571255323/'
    });
    expect(article.title).toContain('月尘');
    expect(article.content.paragraphs).toHaveLength(1);
  });

  it('normalizes group URLs into article URLs', () => {
    expect(buildToutiaoArticleUrl('https://toutiao.com/group/7657359132571255323/')).toBe(
      'https://www.toutiao.com/article/7657359132571255323/'
    );
  });

  it('normalizes legacy /a article URLs into article URLs', () => {
    expect(buildToutiaoArticleUrl('http://www.toutiao.com/a7658559628753601033/')).toBe(
      'https://www.toutiao.com/article/7658559628753601033/'
    );
  });

  it('rejects invalid article inputs', async () => {
    const service = new ToutiaoService({
      runtime: {
        fetchArticle: vi.fn(),
        fetchAuthorArticles: vi.fn(),
        fetchKeywordInformation: vi.fn(),
        fetchTechnologyChannel: vi.fn()
      }
    });

    await expect(service.article('not-an-id')).rejects.toMatchObject({
      code: 'TOUTIAO_INVALID_ARTICLE',
      exitCode: 2
    });
  });

  it('normalizes author homepage URLs into author tokens', () => {
    expect(
      buildToutiaoAuthorToken(
        'https://www.toutiao.com/c/user/token/MS4wLjABAAAAulU9CSwHtRjcF9bakxqiK8uYN7UQi2m8KFaNukylH80/?source=tuwen_detail'
      )
    ).toBe('MS4wLjABAAAAulU9CSwHtRjcF9bakxqiK8uYN7UQi2m8KFaNukylH80');
  });

  it('fetches author articles by token', async () => {
    const fetchAuthorArticles = vi.fn(async () => ({
      authorToken: 'MS4wLjABAAAAulU9CSwHtRjcF9bakxqiK8uYN7UQi2m8KFaNukylH80',
      hasMore: true,
      items: [
        {
          id: '7658940228585734665',
          title: '刚刚，谷歌发布了一台 AI 硬件',
          url: 'https://www.toutiao.com/article/7658940228585734665/'
        }
      ]
    }));
    const service = new ToutiaoService({
      runtime: {
        fetchArticle: vi.fn(),
        fetchAuthorArticles,
        fetchKeywordInformation: vi.fn(),
        fetchTechnologyChannel: vi.fn()
      }
    });

    const result = await service.author('MS4wLjABAAAAulU9CSwHtRjcF9bakxqiK8uYN7UQi2m8KFaNukylH80', {
      pages: 1
    });

    expect(fetchAuthorArticles).toHaveBeenCalledWith({
      authorToken: 'MS4wLjABAAAAulU9CSwHtRjcF9bakxqiK8uYN7UQi2m8KFaNukylH80',
      pages: 1,
      url: 'https://www.toutiao.com/c/user/token/MS4wLjABAAAAulU9CSwHtRjcF9bakxqiK8uYN7UQi2m8KFaNukylH80/'
    });
    expect(result.authorToken).toBe('MS4wLjABAAAAulU9CSwHtRjcF9bakxqiK8uYN7UQi2m8KFaNukylH80');
    expect(result.items[0]?.title).toContain('谷歌');
    expect(result.meta.totalItems).toBe(1);
  });

  it('can enrich author articles with detail content', async () => {
    const fetchArticle = vi.fn(async ({ input, url }: { input: string; url: string }) => ({
      content: {
        paragraphs: ['这是一篇作者文章正文。'],
        text: '这是一篇作者文章正文。'
      },
      id: input,
      request: {
        input,
        url
      },
      title: '刚刚，谷歌发布了一台 AI 硬件',
      url
    }));
    const service = new ToutiaoService({
      runtime: {
        fetchArticle,
        fetchAuthorArticles: vi.fn(async () => ({
          authorToken: 'MS4wLjABAAAAulU9CSwHtRjcF9bakxqiK8uYN7UQi2m8KFaNukylH80',
          hasMore: false,
          items: [
            {
              id: '7658940228585734665',
              title: '刚刚，谷歌发布了一台 AI 硬件',
              url: 'https://www.toutiao.com/article/7658940228585734665/'
            }
          ]
        })),
        fetchKeywordInformation: vi.fn(),
        fetchTechnologyChannel: vi.fn()
      }
    });

    const result = await service.author('MS4wLjABAAAAulU9CSwHtRjcF9bakxqiK8uYN7UQi2m8KFaNukylH80', {
      pages: 1,
      withContent: true
    });

    expect(fetchArticle).toHaveBeenCalledWith({
      input: '7658940228585734665',
      url: 'https://www.toutiao.com/article/7658940228585734665/'
    });
    expect(result.articles?.[0]?.content.text).toBe('这是一篇作者文章正文。');
    expect(result.meta.totalArticles).toBe(1);
  });
});
