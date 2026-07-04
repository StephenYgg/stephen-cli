import { describe, expect, it, vi } from 'vitest';

import { Kr36ArticleService } from '../../src/36kr/service.js';

const articleHtml = `
<html>
  <body>
    <script>
      window.initialState={"articleDetail":{"articleDetailData":{"data":{"itemId":3853011900142848,"widgetTitle":"硬氪首发 | 海洋具身智能公司「世航智能」拿下创纪录10亿融资，朱啸虎押注","summary":"上半年订单超10亿元。","author":"邱晓芬","authorId":1199336245,"authorFace":"https://img.example.com/author.jpg","authorRoute":"detail_author?userId=1199336245","publishTime":1781488200127,"widgetContent":"<p>作者&nbsp;|&nbsp;邱晓芬</p><p>编辑&nbsp;|&nbsp;袁斯来</p><p>正文第一段<strong>重点</strong></p><p class=\\"image-wrapper\\"><img data-img-size-val=\\"1080,975\\" src=\\"https://img.example.com/body.jpg\\"></p><p class=\\"img-desc\\">（图源/企业）</p>","sourceType":"original","imgSources":[{"name":"采访供图","url":""}],"popinImage":"https://img.example.com/cover.jpg","companyCertifyNick":"邱晓芬官方企业号"}},"articleRecommendData":{"statPraise":42,"statComment":0,"statCollect":5,"statArticle":858,"authorName":"邱晓芬","authorTitle":"作者","authorSummary":"关注科技","authorFace":"https://img.example.com/author.jpg","newestItemList":[{"itemId":1,"itemTitle":"最新文章","itemContent":"摘要","publishTime":1781488200000,"itemRoute":"detail_article?itemId=1"}],"nextItem":{"itemId":2,"itemTitle":"下一篇","itemContent":"下一篇摘要","publishTime":1781488100000,"authorId":1,"itemRoute":"detail_article?itemId=2"},"relateArticleList":[{"itemId":3,"widgetTitle":"相关文章","author":"欧雪","authorName":"欧雪","route":"detail_article?itemId=3","widgetImage":"https://img.example.com/related.jpg"}]},"favoriteCount":5,"likeCount":42,"organArticleData":{"data":{"organizationList":[{"id":168,"identityName":"meridiancapital","name":"华映资本","logo":"https://img.example.com/logo.png","briefIntro":"简介"}]}},"latestArticle":{"articleLatestList":[{"id":4,"title":"快讯标题"}]}}};
    </script>
  </body>
</html>`;

describe('Kr36ArticleService', () => {
  it('fetches a 36kr article by id with browser-like curl headers and parses the article payload', async () => {
    const fetchArticleHtml = vi.fn(async () => articleHtml);
    const service = new Kr36ArticleService({ fetchArticleHtml });

    const article = await service.getArticle('3853011900142848');

    expect(fetchArticleHtml).toHaveBeenCalledWith({
      headers: expect.objectContaining({
        Accept: expect.stringContaining('text/html'),
        'Accept-Language': expect.stringContaining('zh-CN'),
        Referer: 'https://36kr.com/',
        'User-Agent': expect.stringContaining('Mozilla/5.0')
      }),
      url: 'https://36kr.com/p/3853011900142848?f=rss'
    });
    expect(article.id).toBe('3853011900142848');
    expect(article.url).toBe('https://36kr.com/p/3853011900142848?f=rss');
    expect(article.title).toContain('世航智能');
    expect(article.summary).toBe('上半年订单超10亿元。');
    expect(article.author.name).toBe('邱晓芬');
    expect(article.publishTime.local).toBe('2026-06-15 09:50:00');
    expect(article.content.paragraphs).toEqual([
      '作者 | 邱晓芬',
      '编辑 | 袁斯来',
      '正文第一段',
      '重点',
      '（图源/企业）'
    ]);
    expect(article.images).toEqual([
      {
        index: 1,
        size: '1080,975',
        url: 'https://img.example.com/body.jpg'
      }
    ]);
    expect(article.stats).toEqual({
      authorArticleCount: 858,
      collect: 5,
      comment: 0,
      favoriteCount: 5,
      likeCount: 42,
      praise: 42
    });
    expect(article.organizations[0]?.name).toBe('华映资本');
    expect(article.relatedArticles[0]?.title).toBe('相关文章');
  });

  it('rejects article ids that are not numeric', async () => {
    const service = new Kr36ArticleService({ fetchArticleHtml: vi.fn() });

    await expect(service.getArticle('abc')).rejects.toMatchObject({
      code: 'KR36_INVALID_ARTICLE_ID',
      exitCode: 2
    });
  });

  it('returns a parse error when the page does not include initialState', async () => {
    const service = new Kr36ArticleService({
      fetchArticleHtml: vi.fn(async () => '<html></html>')
    });

    await expect(service.getArticle('3853011900142848')).rejects.toMatchObject({
      code: 'KR36_PARSE_ERROR',
      exitCode: 2
    });
  });
});
