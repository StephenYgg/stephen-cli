import { describe, expect, it } from 'vitest';

// Issue 7: https-proxy-agent type declarations
// The package uses exports map that TypeScript can't resolve for NodeNext
// Fix: Create a local type declaration for the module
describe('https-proxy-agent type declarations', () => {
  it('should have proper type for HttpsProxyAgent', async () => {
    // https-proxy-agent should export HttpsProxyAgent
    const agent = await import('https-proxy-agent');
    expect(typeof agent.HttpsProxyAgent).toBe('function');
  });
});
