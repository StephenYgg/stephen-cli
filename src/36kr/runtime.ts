import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';

import { Kr36CommandError, type Kr36Request } from './types.js';

export interface Kr36Runtime {
  fetchArticleHtml: (request: Kr36Request) => Promise<string>;
}

const execFileAsync = promisify(nodeExecFile);

export function createDefaultKr36Runtime(): Kr36Runtime {
  return {
    fetchArticleHtml: async (request) => {
      const args = [
        '--silent',
        '--show-error',
        '--location',
        '--compressed',
        ...Object.entries(request.headers).flatMap(([name, value]) => ['--header', `${name}: ${value}`]),
        request.url
      ];

      try {
        const result = await execFileAsync('curl', args, {
          encoding: 'utf8',
          maxBuffer: 20 * 1024 * 1024
        });
        return result.stdout;
      } catch (error) {
        const execError = error as Error & { code?: number | string; stderr?: string };
        throw new Kr36CommandError(
          'KR36_REQUEST_FAILED',
          `Failed to fetch 36kr article page: ${execError.stderr || execError.message}`,
          1,
          {
            curlExitCode: execError.code,
            url: request.url
          }
        );
      }
    }
  };
}
