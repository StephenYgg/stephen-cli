import { ProxyAgent } from 'undici';

export type VideoProxyOptions = {
  noProxy?: boolean;
  proxyUrl?: string;
};

export function resolveProxyUrl(options?: VideoProxyOptions): string | undefined {
  if (options?.noProxy) {
    return undefined;
  }

  const value = options?.proxyUrl ?? process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function applyProxyInit(
  init: RequestInit | undefined,
  options?: VideoProxyOptions
): RequestInit {
  const proxyUrl = resolveProxyUrl(options);
  if (!proxyUrl) {
    return init ?? {};
  }

  return {
    ...(init ?? {}),
    dispatcher: new ProxyAgent(proxyUrl)
  } as RequestInit;
}
