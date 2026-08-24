import { parse } from 'node-html-parser';

export function normalizeVideoTitle(value: string): string | undefined {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

export function extractVideoTitleFromHtml(html: string): string | undefined {
  const document = parse(html);
  const openGraphTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');

  return (
    normalizeVideoTitle(openGraphTitle ?? '') ??
    normalizeVideoTitle(document.querySelector('title')?.textContent ?? '')
  );
}
