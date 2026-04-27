import { VideoCommandError } from '../types.js';

export type VideoInputClassification =
  | { kind: 'm3u8'; url: string }
  | { kind: 'mp4'; url: string }
  | { kind: 'page'; url: string };

export function classifyVideoInput(input: string): VideoInputClassification {
  const url = new URL(input);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new VideoCommandError('VIDEO_UNSUPPORTED_INPUT', `Unsupported video input: ${input}`);
  }

  if (/\.m3u8(?:\?|$)/i.test(url.href)) {
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
