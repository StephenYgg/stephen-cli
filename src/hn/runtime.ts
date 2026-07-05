import {
  HackerNewsCommandError,
  type HackerNewsItem,
  type HackerNewsSearchRuntimeResult,
  type HackerNewsSearchSort,
  type HackerNewsStoriesRuntimeResult,
  type HackerNewsStorySource
} from './types.js';
import { optional } from '../video/utils.js';

export interface HackerNewsRuntime {
  fetchSearch: (options: {
    limit: number;
    query: string;
    sort: HackerNewsSearchSort;
  }) => Promise<HackerNewsSearchRuntimeResult>;
  fetchStories: (options: {
    limit: number;
    source: HackerNewsStorySource;
  }) => Promise<HackerNewsStoriesRuntimeResult>;
}

const FIREBASE_BASE_URL = 'https://hacker-news.firebaseio.com/v0';
const ALGOLIA_BASE_URL = 'https://hn.algolia.com/api/v1';
const SOURCE_TO_ENDPOINT: Record<HackerNewsStorySource, string> = {
  best: 'beststories',
  new: 'newstories',
  top: 'topstories'
};

export function createDefaultHackerNewsRuntime(): HackerNewsRuntime {
  return {
    fetchSearch: async (options) => fetchSearch(options),
    fetchStories: async (options) => fetchStories(options)
  };
}

async function fetchStories(options: {
  limit: number;
  source: HackerNewsStorySource;
}): Promise<HackerNewsStoriesRuntimeResult> {
  const endpoint = SOURCE_TO_ENDPOINT[options.source];
  const ids = await fetchJson<number[]>(`${FIREBASE_BASE_URL}/${endpoint}.json`);
  const selectedIds = ids.slice(0, Math.max(options.limit * 2, options.limit));
  const rawItems = await Promise.all(
    selectedIds.map((id) => fetchJson<HackerNewsFirebaseItem | null>(`${FIREBASE_BASE_URL}/item/${id}.json`))
  );
  const items = rawItems.flatMap((item) => mapFirebaseItem(item)).slice(0, options.limit);

  return {
    items,
    source: options.source
  };
}

async function fetchSearch(options: {
  limit: number;
  query: string;
  sort: HackerNewsSearchSort;
}): Promise<HackerNewsSearchRuntimeResult> {
  const params = new URLSearchParams({
    hitsPerPage: String(options.limit),
    query: options.query,
    tags: 'story'
  });
  const endpoint = options.sort === 'date' ? 'search_by_date' : 'search';
  const response = await fetchJson<HackerNewsAlgoliaResponse>(`${ALGOLIA_BASE_URL}/${endpoint}?${params.toString()}`);

  return {
    items: response.hits.flatMap(mapAlgoliaHit).slice(0, options.limit),
    query: options.query
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'stephen-cli/0.1 HackerNews collector'
      }
    });
  } catch (error) {
    throw new HackerNewsCommandError(
      'HN_FETCH_FAILED',
      'Failed to fetch Hacker News data.',
      2,
      {
        cause: error instanceof Error ? error.message : String(error),
        url
      }
    );
  }

  if (!response.ok) {
    throw new HackerNewsCommandError(
      'HN_FETCH_FAILED',
      `Failed to fetch Hacker News data. HTTP ${response.status}.`,
      2,
      {
        url
      }
    );
  }

  return await response.json() as T;
}

interface HackerNewsFirebaseItem {
  by?: string;
  dead?: boolean;
  deleted?: boolean;
  descendants?: number;
  id?: number;
  score?: number;
  text?: string;
  time?: number;
  title?: string;
  type?: string;
  url?: string;
}

interface HackerNewsAlgoliaResponse {
  hits: HackerNewsAlgoliaHit[];
}

interface HackerNewsAlgoliaHit {
  author?: string;
  created_at_i?: number;
  num_comments?: number;
  objectID?: string;
  points?: number;
  story_id?: number;
  title?: string;
  url?: string;
}

function mapFirebaseItem(item: HackerNewsFirebaseItem | null): HackerNewsItem[] {
  if (!item || item.deleted || item.dead || item.type !== 'story' || !item.id || !item.title) {
    return [];
  }

  return [
    createItem({
      id: item.id,
      title: item.title,
      url: item.url ?? `https://news.ycombinator.com/item?id=${item.id}`,
      ...optional('author', item.by),
      ...optional('commentCount', item.descendants),
      ...optional('score', item.score),
      ...optional('text', item.text),
      ...optional('timeSeconds', item.time)
    })
  ];
}

function mapAlgoliaHit(hit: HackerNewsAlgoliaHit): HackerNewsItem[] {
  const id = hit.story_id ?? parseNumericId(hit.objectID);

  if (!id || !hit.title) {
    return [];
  }

  return [
    createItem({
      id,
      title: hit.title,
      url: hit.url ?? `https://news.ycombinator.com/item?id=${id}`,
      ...optional('author', hit.author),
      ...optional('commentCount', hit.num_comments),
      ...optional('score', hit.points),
      ...optional('timeSeconds', hit.created_at_i)
    })
  ];
}

function createItem(input: {
  author?: string;
  commentCount?: number;
  id: number;
  score?: number;
  text?: string;
  timeSeconds?: number;
  title: string;
  url: string;
}): HackerNewsItem {
  const item: HackerNewsItem = {
    id: input.id,
    title: input.title,
    type: 'story',
    url: input.url
  };

  if (input.author !== undefined) {
    item.author = input.author;
  }
  if (input.commentCount !== undefined) {
    item.commentCount = input.commentCount;
  }
  if (input.score !== undefined) {
    item.score = input.score;
  }
  if (input.text !== undefined) {
    item.text = input.text;
  }
  if (input.timeSeconds !== undefined) {
    item.time = {
      iso: new Date(input.timeSeconds * 1000).toISOString(),
      seconds: input.timeSeconds
    };
  }

  return item;
}

function parseNumericId(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) {
    return undefined;
  }

  return Number(value);
}
