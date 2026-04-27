import type { VideoCandidate, VideoCandidateOrigin, VideoCandidateType } from '../types.js';

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
  const matches = text.matchAll(/https?:\/\/[^\s"'<>]+?\.(m3u8|mp4)(?:\?[^\s"'<>]*)?/gi);

  return rankVideoCandidates(
    [...matches].map((match) =>
      createVideoCandidate(match[1]?.toLowerCase() === 'm3u8' ? 'm3u8' : 'mp4', match[0], origin, origin === 'html' ? 0.75 : 0.65)
    )
  );
}
