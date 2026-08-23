import { afterEach, describe, expect, it } from 'vitest';

import { applyProxyInit, resolveProxyUrl } from '../../src/video/proxy.js';

const originalHttpProxy = process.env.HTTP_PROXY;
const originalHttpsProxy = process.env.HTTPS_PROXY;

afterEach(() => {
  if (originalHttpProxy === undefined) {
    delete process.env.HTTP_PROXY;
  } else {
    process.env.HTTP_PROXY = originalHttpProxy;
  }
  if (originalHttpsProxy === undefined) {
    delete process.env.HTTPS_PROXY;
  } else {
    process.env.HTTPS_PROXY = originalHttpsProxy;
  }
});

describe('resolveProxyUrl', () => {
  it('prefers an explicit proxy url over environment variables', () => {
    process.env.HTTP_PROXY = 'http://env-proxy:3128';
    process.env.HTTPS_PROXY = 'http://env-https-proxy:3128';

    expect(resolveProxyUrl({ proxyUrl: 'http://127.0.0.1:7890' })).toBe(
      'http://127.0.0.1:7890'
    );
  });

  it('uses HTTPS_PROXY then HTTP_PROXY when no explicit proxy is provided', () => {
    delete process.env.HTTPS_PROXY;
    process.env.HTTP_PROXY = 'http://env-proxy:3128';
    expect(resolveProxyUrl()).toBe('http://env-proxy:3128');

    process.env.HTTPS_PROXY = 'http://env-https-proxy:3128';
    expect(resolveProxyUrl()).toBe('http://env-https-proxy:3128');
  });

  it('ignores environment proxies when noProxy is set', () => {
    process.env.HTTP_PROXY = 'http://env-proxy:3128';
    expect(resolveProxyUrl({ noProxy: true, proxyUrl: 'http://127.0.0.1:7890' })).toBeUndefined();
  });

  it('ignores blank proxy values', () => {
    process.env.HTTP_PROXY = '   ';
    expect(resolveProxyUrl({ proxyUrl: '' })).toBeUndefined();
  });
});

describe('applyProxyInit', () => {
  it('adds an undici dispatcher when a proxy is configured', () => {
    const init = applyProxyInit(
      { headers: { referer: 'https://cdn.example.com/' } },
      { proxyUrl: 'http://127.0.0.1:7890' }
    );

    expect(init.headers).toEqual({ referer: 'https://cdn.example.com/' });
    expect((init as { dispatcher?: unknown }).dispatcher).toBeDefined();
  });

  it('leaves fetch init unchanged when proxy is disabled', () => {
    process.env.HTTP_PROXY = 'http://env-proxy:3128';
    const init = applyProxyInit({ headers: { a: '1' } }, { noProxy: true });
    expect(init).toEqual({ headers: { a: '1' } });
    expect((init as { dispatcher?: unknown }).dispatcher).toBeUndefined();
  });
});
