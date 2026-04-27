import { table } from 'table';

import type {
  VideoCompressionResult,
  VideoDownloadResult,
  VideoSniffResult
} from './types.js';

export function renderVideoCandidatesAsJson(result: VideoSniffResult): string {
  return JSON.stringify(
    {
      ok: true,
      data: result,
      meta: {
        count: result.candidates.length
      }
    },
    null,
    2
  );
}

export function renderVideoDownloadResultAsJson(result: VideoDownloadResult): string {
  return JSON.stringify(
    {
      ok: true,
      data: result
    },
    null,
    2
  );
}

export function renderVideoCompressionResultAsJson(result: VideoCompressionResult): string {
  return JSON.stringify(
    {
      ok: true,
      data: result
    },
    null,
    2
  );
}

export function renderVideoCommandErrorAsJson(
  code: string,
  message: string,
  details?: unknown
): string {
  return JSON.stringify(
    {
      ok: false,
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details })
      }
    },
    null,
    2
  );
}

export function renderVideoCandidatesAsTable(result: VideoSniffResult): string {
  return renderVideoOperationAsTable([
    ['type', 'url', 'origin', 'mode'],
    ...result.candidates.map((candidate) => [
      candidate.type,
      candidate.url,
      candidate.origin,
      result.mode
    ])
  ]);
}

export function renderVideoOperationAsTable(rows: string[][]): string {
  return table(rows);
}
