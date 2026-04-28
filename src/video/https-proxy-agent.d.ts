/**
 * Type declarations for https-proxy-agent
 * The package uses exports map that TypeScript can't resolve for NodeNext module resolution.
 * This declaration allows proper type checking when using dynamic import.
 */
declare module 'https-proxy-agent' {
  import type { Agent } from 'node:http';

  export class HttpsProxyAgent extends Agent {
    constructor(proxyUrl: string | URL);
  }
}