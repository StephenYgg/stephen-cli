export function createMediaRequestInit(sourceUrl: string): RequestInit {
  const url = new URL(sourceUrl);

  return {
    headers: {
      referer: `${url.protocol}//${url.host}/`,
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
    }
  };
}
