export type VideoSniffMode = 'auto' | 'browser' | 'http';
export type VideoCandidateType = 'm3u8' | 'mp4';
export type VideoCandidateOrigin = 'network' | 'html' | 'script' | 'direct-input';

export interface VideoCandidate {
  confidence?: number;
  mimeType?: string;
  origin: VideoCandidateOrigin;
  type: VideoCandidateType;
  url: string;
}

export interface VideoSniffProviderResult {
  candidates: VideoCandidate[];
  title?: string | undefined;
}

export interface VideoSniffResult extends VideoSniffProviderResult {
  mode: Exclude<VideoSniffMode, 'auto'>;
  sourceUrl: string;
}

export interface VideoTransferResult {
  bytesWritten?: number;
  mediaType: VideoCandidateType;
  outputPath: string;
  sourceUrl: string;
}

export interface VideoDownloadResult extends VideoTransferResult {
  md5: string;
  status: 'downloaded' | 'already_downloaded';
}

export interface VideoCompressionOptions {
  audioBitrate?: string;
  inputPath: string;
  outputPath?: string;
  resolution?: string;
  videoBitrate?: string;
}

export interface VideoCompressionResult {
  audioBitrate: string;
  audioCodec: 'aac';
  codec: 'libx265';
  inputPath: string;
  outputPath: string;
  resolution?: string;
  videoBitrate?: string;
}

export class VideoCommandError extends Error {
  code: string;
  details?: unknown;
  exitCode: number;
  recoverable: boolean;

  constructor(
    code: string,
    message: string,
    exitCode = 2,
    details?: unknown,
    recoverable = false
  ) {
    super(message);
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
    this.exitCode = exitCode;
    this.recoverable = recoverable;
  }
}
