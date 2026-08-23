const HLS_PLAYLIST_RE = /\.m3u8(?:\?|$)/i;
const HLS_TEMPLATE_RE = /_TPL_\.mp4(?:\?|$)/i;
const HLS_MEDIA_PARAM_RE = /\/media=hls/i;

export function isHlsMediaUrl(url: string): boolean {
  return HLS_PLAYLIST_RE.test(url) || isTemplateHlsUrl(url);
}

export function isTemplateHlsUrl(url: string): boolean {
  return HLS_TEMPLATE_RE.test(url) || HLS_MEDIA_PARAM_RE.test(url);
}

export function isNoiseMediaUrl(url: string): boolean {
  const path = url.toLowerCase();
  return path.includes('/thumbs/') || path.includes('/pv/');
}

export function unescapeMediaText(text: string): string {
  return text.replace(/\\\//g, '/');
}
