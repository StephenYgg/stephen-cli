import {
  isHlsMediaUrl,
  isNoiseMediaUrl,
  isTemplateHlsUrl,
  unescapeMediaText
} from '../media-url.js';
import type { VideoCandidate, VideoCandidateOrigin, VideoCandidateType } from '../types.js';

const MEDIA_URL_RE =
  /https?:\/\/[^\s"'<>]+?\.(m3u8|mp4)(?:\?[^\s"'<>]*)?(?=["'\s<>\\#]|$)/gi;

export function createVideoCandidate(
  type: VideoCandidateType,
  url: string,
  origin: VideoCandidateOrigin,
  confidence = 0.5
): VideoCandidate {
  return {
    confidence,
    mimeType: type === 'm3u8' ? 'application/vnd.apple.mpegurl' : 'video/mp4',
    origin,
    type,
    url
  };
}

export function rankVideoCandidates(candidates: VideoCandidate[]): VideoCandidate[] {
  const deduped = new Map<string, VideoCandidate>();

  /* c8 ignore start */
  for (const candidate of candidates) {
    const existing = deduped.get(candidate.url);

    if (!existing || (candidate.confidence ?? 0) > (existing.confidence ?? 0)) {
      deduped.set(candidate.url, candidate);
    }
  }

  return [...deduped.values()].sort((left, right) => {
    const confidenceDelta = (right.confidence ?? 0) - (left.confidence ?? 0);

    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }

    if (left.type === right.type) {
      return 0;
    }

    return left.type === 'm3u8' ? -1 : 1;
  });
  /* c8 ignore end */
}

export function extractVideoCandidatesFromText(
  text: string,
  origin: Exclude<VideoCandidateOrigin, 'network' | 'direct-input'>
): VideoCandidate[] {
  const matches = unescapeMediaText(text).matchAll(MEDIA_URL_RE);
  const candidates: VideoCandidate[] = [];

  for (const match of matches) {
    const url = match[0];
    if (isNoiseMediaUrl(url)) {
      continue;
    }

    const type: VideoCandidateType = isHlsMediaUrl(url) ? 'm3u8' : 'mp4';
    const confidence = isTemplateHlsUrl(url) ? 0.95 : origin === 'html' ? 0.75 : 0.65;
    candidates.push(createVideoCandidate(type, url, origin, confidence));
  }

  return rankVideoCandidates(candidates);
}
