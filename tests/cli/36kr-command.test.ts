import { describe, expect, it, vi } from 'vitest';

import { createAkDatabase } from '../../src/ak/database.js';
import { AkRepository } from '../../src/ak/repository.js';
import { createCli } from '../../src/index.js';
import type { Kr36Runtime } from '../../src/36kr/runtime.js';

const articleHtml = `
<script>
window.initialState={"articleDetail":{"articleDetailData":{"data":{"itemId":3853011900142848,"widgetTitle":"硬氪首发 | 海洋具身智能公司「世航智能」拿下创纪录10亿融资，朱啸虎押注","summary":"上半年订单超10亿元。","author":"邱晓芬","authorId":1199336245,"authorFace":"https://img.example.com/author.jpg","authorRoute":"detail_author?userId=1199336245","publishTime":1781488200127,"widgetContent":"<p>作者&nbsp;|&nbsp;邱晓芬</p><p>正文</p>","sourceType":"original","imgSources":[],"popinImage":"https://img.example.com/cover.jpg","companyCertifyNick":"邱晓芬官方企业号"}},"articleRecommendData":{"statPraise":42,"statComment":0,"statCollect":5,"statArticle":858,"authorName":"邱晓芬","authorTitle":"作者","authorSummary":"关注科技","authorFace":"https://img.example.com/author.jpg","newestItemList":[],"relateArticleList":[]},"favoriteCount":5,"likeCount":42,"organArticleData":{"data":{"organizationList":[]}},"latestArticle":{"articleLatestList":[]}}};
</script>`;

describe('stephen 36kr command', () => {
  it('fetches an article by id and renders JSON by default', async () => {
    let stdout = '';
    let stderr = '';
    const runtime: Kr36Runtime = {
      fetchArticleHtml: vi.fn(async () => articleHtml)
    };
    const cli = createCli({
      kr36Runtime: runtime,
      repository: new AkRepository(createAkDatabase(':memory:')),
      stderr: (value) => {
        stderr += value;
      },
      stdout: (value) => {
        stdout += value;
      }
    });

    const exitCode = await cli.run(['36kr', 'article', '3853011900142848']);
    const parsed = JSON.parse(stdout) as {
      data: {
        author: { name: string };
        id: string;
        request: { headers: Record<string, string> };
        title: string;
        url: string;
      };
      ok: boolean;
    };

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(parsed.ok).toBe(true);
    expect(parsed.data.id).toBe('3853011900142848');
    expect(parsed.data.url).toBe('https://36kr.com/p/3853011900142848?f=rss');
    expect(parsed.data.title).toContain('世航智能');
    expect(parsed.data.author.name).toBe('邱晓芬');
    expect(parsed.data.request.headers['User-Agent']).toContain('Mozilla/5.0');
  });

  it('renders 36kr errors as JSON', async () => {
    let stderr = '';
    const cli = createCli({
      kr36Runtime: {
        fetchArticleHtml: vi.fn()
      },
      repository: new AkRepository(createAkDatabase(':memory:')),
      stderr: (value) => {
        stderr += value;
      },
      stdout: () => undefined
    });

    const exitCode = await cli.run(['36kr', 'article', 'not-an-id']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('"code": "KR36_INVALID_ARTICLE_ID"');
  });
});
