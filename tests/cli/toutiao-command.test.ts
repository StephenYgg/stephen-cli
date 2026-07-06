import { describe, expect, it, vi } from 'vitest';

import { createAkDatabase } from '../../src/ak/database.js';
import { AkRepository } from '../../src/ak/repository.js';
import { createCli } from '../../src/index.js';
import type { ToutiaoRuntime } from '../../src/toutiao/runtime.js';

function createRuntime(): ToutiaoRuntime {
  return {
    fetchArticle: vi.fn(async ({ input, url }) => ({
      authorName: '宇宙边界',
      content: {
        paragraphs: ['你敢相信吗？如果人类在未来成功登上月球。'],
        text: '你敢相信吗？如果人类在未来成功登上月球。'
      },
      id: input,
      publishTimeText: '2026-07-03 20:08',
      request: {
        input,
        url
      },
      title: '人类登月的最大难题，不是真空，也不是辐射，而是脚下的月尘！',
      url
    })),
    fetchAuthorArticles: vi.fn(async () => ({
      authorToken: 'MS4wLjABAAAAulU9CSwHtRjcF9bakxqiK8uYN7UQi2m8KFaNukylH80',
      hasMore: true,
      items: [
        {
          id: '7658940228585734665',
          title: '刚刚，谷歌发布了一台 AI 硬件',
          url: 'https://www.toutiao.com/article/7658940228585734665/'
        }
      ]
    })),
    fetchKeywordInformation: vi.fn(async () => ({
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
    })),
    fetchTechnologyChannel: vi.fn(async () => ({
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
    }))
  };
}

describe('stephen toutiao command', () => {
  it('fetches article detail and renders JSON', async () => {
    let stdout = '';
    const runtime = createRuntime();
    const cli = createCli({
      repository: new AkRepository(createAkDatabase(':memory:')),
      stdout: (value) => {
        stdout += value;
      },
      toutiaoRuntime: runtime
    });

    const exitCode = await cli.run(['toutiao', 'article', '7657359132571255323']);
    const parsed = JSON.parse(stdout) as {
      data: { content: { paragraphs: string[] }; id: string; title: string };
      ok: boolean;
    };

    expect(exitCode).toBe(0);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.id).toBe('7657359132571255323');
    expect(parsed.data.title).toContain('月尘');
    expect(parsed.data.content.paragraphs).toHaveLength(1);
    expect(runtime.fetchArticle).toHaveBeenCalledWith({
      input: '7657359132571255323',
      url: 'https://www.toutiao.com/article/7657359132571255323/'
    });
  });

  it('fetches the technology channel and renders JSON', async () => {
    let stdout = '';
    const runtime = createRuntime();
    const cli = createCli({
      repository: new AkRepository(createAkDatabase(':memory:')),
      stdout: (value) => {
        stdout += value;
      },
      toutiaoRuntime: runtime
    });

    const exitCode = await cli.run(['toutiao', 'list', 'tech', '--pages', '1']);
    const parsed = JSON.parse(stdout) as {
      data: { items: Array<{ id: string; title: string }>; source: string };
      ok: boolean;
    };

    expect(exitCode).toBe(0);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.source).toBe('tech');
    expect(parsed.data.items[0]?.title).toContain('月尘');
    expect(runtime.fetchTechnologyChannel).toHaveBeenCalledWith({ pages: 1 });
  });

  it('fetches a supported keyword and renders JSON', async () => {
    let stdout = '';
    const runtime = createRuntime();
    const cli = createCli({
      repository: new AkRepository(createAkDatabase(':memory:')),
      stdout: (value) => {
        stdout += value;
      },
      toutiaoRuntime: runtime
    });

    const exitCode = await cli.run(['toutiao', 'list', 'AI', '--pages', '1']);
    const parsed = JSON.parse(stdout) as {
      data: { items: Array<{ id: string; title: string }>; source: string };
      ok: boolean;
    };

    expect(exitCode).toBe(0);
    expect(parsed.data.source).toBe('AI');
    expect(parsed.data.items[0]?.title).toContain('AI相机');
    expect(runtime.fetchKeywordInformation).toHaveBeenCalledWith({
      keyword: 'AI',
      pages: 1,
      source: 'AI'
    });
  });

  it('renders channel results as a table with -t', async () => {
    let stdout = '';
    const runtime = createRuntime();
    const cli = createCli({
      repository: new AkRepository(createAkDatabase(':memory:')),
      stdout: (value) => {
        stdout += value;
      },
      toutiaoRuntime: runtime
    });

    const exitCode = await cli.run(['toutiao', 'list', 'AI', '--pages', '1', '-t']);

    expect(exitCode).toBe(0);
    expect(() => JSON.parse(stdout)).toThrow();
    expect(stdout).toContain('id');
    expect(stdout).toContain('title');
    expect(stdout).toContain('谷歌才是AI相机鼻祖');
  });

  it('renders unsupported source errors as JSON', async () => {
    let stderr = '';
    const cli = createCli({
      repository: new AkRepository(createAkDatabase(':memory:')),
      stderr: (value) => {
        stderr += value;
      },
      stdout: () => undefined,
      toutiaoRuntime: createRuntime()
    });

    const exitCode = await cli.run(['toutiao', 'list', 'sports']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('"code": "TOUTIAO_INVALID_SOURCE"');
  });

  it('fetches an author homepage feed and renders JSON', async () => {
    let stdout = '';
    const runtime = createRuntime();
    const cli = createCli({
      repository: new AkRepository(createAkDatabase(':memory:')),
      stdout: (value) => {
        stdout += value;
      },
      toutiaoRuntime: runtime
    });

    const exitCode = await cli.run([
      'toutiao',
      'author',
      'https://www.toutiao.com/c/user/token/MS4wLjABAAAAulU9CSwHtRjcF9bakxqiK8uYN7UQi2m8KFaNukylH80/',
      '--pages',
      '1'
    ]);
    const parsed = JSON.parse(stdout) as {
      data: { authorToken: string; items: Array<{ id: string; title: string }> };
      ok: boolean;
    };

    expect(exitCode).toBe(0);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.authorToken).toBe('MS4wLjABAAAAulU9CSwHtRjcF9bakxqiK8uYN7UQi2m8KFaNukylH80');
    expect(parsed.data.items[0]?.title).toContain('谷歌');
    expect(runtime.fetchAuthorArticles).toHaveBeenCalledWith({
      authorToken: 'MS4wLjABAAAAulU9CSwHtRjcF9bakxqiK8uYN7UQi2m8KFaNukylH80',
      pages: 1,
      url: 'https://www.toutiao.com/c/user/token/MS4wLjABAAAAulU9CSwHtRjcF9bakxqiK8uYN7UQi2m8KFaNukylH80/'
    });
  });

  it('renders an author feed as a table with -t', async () => {
    let stdout = '';
    const runtime = createRuntime();
    const cli = createCli({
      repository: new AkRepository(createAkDatabase(':memory:')),
      stdout: (value) => {
        stdout += value;
      },
      toutiaoRuntime: runtime
    });

    const exitCode = await cli.run([
      'toutiao',
      'author',
      'MS4wLjABAAAAulU9CSwHtRjcF9bakxqiK8uYN7UQi2m8KFaNukylH80',
      '--pages',
      '1',
      '-t'
    ]);

    expect(exitCode).toBe(0);
    expect(() => JSON.parse(stdout)).toThrow();
    expect(stdout).toContain('id');
    expect(stdout).toContain('title');
    expect(stdout).toContain('刚刚，谷歌发布了一台 AI 硬件');
  });

  it('fetches an author feed with article content when requested', async () => {
    let stdout = '';
    const runtime = createRuntime();
    const cli = createCli({
      repository: new AkRepository(createAkDatabase(':memory:')),
      stdout: (value) => {
        stdout += value;
      },
      toutiaoRuntime: runtime
    });

    const exitCode = await cli.run([
      'toutiao',
      'author',
      'MS4wLjABAAAAulU9CSwHtRjcF9bakxqiK8uYN7UQi2m8KFaNukylH80',
      '--with-content',
      '--pages',
      '1'
    ]);
    const parsed = JSON.parse(stdout) as {
      data: { articles?: Array<{ id: string; content: { text: string } }> };
      ok: boolean;
    };

    expect(exitCode).toBe(0);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.articles?.[0]?.id).toBe('7658940228585734665');
    expect(runtime.fetchArticle).toHaveBeenCalledWith({
      input: '7658940228585734665',
      url: 'https://www.toutiao.com/article/7658940228585734665/'
    });
  });
});
