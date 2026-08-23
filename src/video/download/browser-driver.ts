import { join } from 'node:path';

import { resolveProxyUrl } from '../proxy.js';
import { VideoCommandError, type VideoDownloadResult } from '../types.js';

export class BrowserDownloadDriver {
  async download(options: {
    outputDir?: string;
    outputPath?: string;
    sourceUrl: string;
    noProxy?: boolean;
    proxyUrl?: string;
  }): Promise<VideoDownloadResult> {
    const outputPath = options.outputPath ?? join(options.outputDir ?? '.', this.inferFileName(options.sourceUrl));

    const { chromium } = await this.loadPlaywright();
    if (!chromium) {
      throw new VideoCommandError(
        'VIDEO_BROWSER_UNAVAILABLE',
        'Browser download requires Playwright Chromium support.',
        2,
        undefined,
        true
      );
    }

    const proxyUrl = resolveProxyUrl(options);
    const browser = await chromium.launch({
      headless: true,
      ...(proxyUrl ? { proxy: { server: proxyUrl } } : {})
    });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();

      const downloadPromise = page.waitForEvent('download');
      await page.goto(options.sourceUrl, { waitUntil: 'load' });
      await page.waitForTimeout(2000);

      const download = await downloadPromise;
      await download.saveAs(outputPath);

      return {
        mediaType: 'mp4',
        outputPath,
        sourceUrl: options.sourceUrl
      };
    } finally {
      await browser.close();
    }
  }

  private async loadPlaywright(): Promise<{ chromium?: import('playwright').BrowserType<import('playwright').Browser> }> {
    try {
      return await loadOptionalModule('playwright') as { chromium?: import('playwright').BrowserType<import('playwright').Browser> };
    } catch {
      throw new VideoCommandError(
        'VIDEO_BROWSER_UNAVAILABLE',
        'Browser download requires Playwright. Install it with: npm install playwright',
        2,
        undefined,
        true
      );
    }
  }

  private inferFileName(sourceUrl: string): string {
    try {
      const url = new URL(sourceUrl);
      const name = url.pathname.split('/').pop();
      return name && name.length > 0 ? name : 'video.mp4';
    } catch {
      return 'video.mp4';
    }
  }
}

const loadOptionalModule = new Function(
  'specifier',
  'return import(specifier);'
) as (specifier: string) => Promise<unknown>;
