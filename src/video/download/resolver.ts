import { isHlsMediaUrl } from '../media-url.js';
import { VideoCommandError } from '../types.js';

export function encodeUrlPath(pathname: string): string {
  const segments = pathname.split('/');
  return segments
    .map((segment) => {
      if (segment.length > 0 && segment.charCodeAt(0) > 127) {
        return encodeURIComponent(segment);
      }
      return segment;
    })
    .join('/');
}

export type VideoInputClassification =
  | { kind: 'm3u8'; url: string }
  | { kind: 'mp4'; url: string }
  | { kind: 'page'; url: string };

export function classifyVideoInput(input: string): VideoInputClassification {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    // Input might contain unencoded Chinese characters - try URL encoding the path
    const urlObj = new URL(input.startsWith('http') ? input : `https://${input}`);
    urlObj.pathname = encodeUrlPath(urlObj.pathname);
    url = urlObj;
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new VideoCommandError('VIDEO_UNSUPPORTED_INPUT', `Unsupported video input: ${input}`);
  }

  if (isHlsMediaUrl(url.href)) {
    return {
      kind: 'm3u8',
      url: url.href
    };
  }

  if (/\.mp4(?:\?|$)/i.test(url.href)) {
    return {
      kind: 'mp4',
      url: url.href
    };
  }

  return {
    kind: 'page',
    url: url.href
  };
}
