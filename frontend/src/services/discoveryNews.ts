import { personalizationService } from './personalization';

export interface DiscoverArticle {
  id: string;
  title: string;
  summary: string;
  link: string;
  imageUrl?: string;
  videoUrl?: string;
  source: string;
  publishedAt: string;
  score: number;
  matchedInterests: string[];
}

const DEFAULT_TOPICS = [
  'artificial intelligence',
  'fintech',
  'ethereum',
  'crypto regulation',
  'machine learning',
];

const BASE_FEEDS = [
  'https://www.theverge.com/rss/index.xml',
  'https://www.engadget.com/rss.xml',
  'https://feeds.bbci.co.uk/news/technology/rss.xml',
  'https://www.wired.com/feed/rss',
  'https://www.coindesk.com/arc/outboundfeeds/rss/',
];

const normalizeText = (value: string): string => {
  return String(value || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const decodeEntities = (value: string): string => {
  return String(value || '')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/');
};

const stripHtml = (value: string): string => {
  return decodeEntities(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

const tagValue = (input: string, tag: string): string => {
  const match = input.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeEntities(match[1]).trim() : '';
};

const getFirstMatch = (input: string, patterns: RegExp[]): string => {
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match?.[1]) {
      return decodeEntities(match[1]).trim();
    }
  }
  return '';
};

const extractLink = (itemXml: string): string => {
  const rssLink = tagValue(itemXml, 'link');
  if (rssLink && /^https?:\/\//i.test(rssLink)) return rssLink;

  const atomAlternateLink = getFirstMatch(itemXml, [
    /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i,
  ]);
  if (atomAlternateLink) return atomAlternateLink;

  const atomAnyLink = getFirstMatch(itemXml, [
    /<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i,
  ]);
  return atomAnyLink;
};

const extractImageUrl = (itemXml: string): string => {
  const directImage = getFirstMatch(itemXml, [
    /<media:thumbnail[^>]*url=["']([^"']+)["'][^>]*\/?>/i,
    /<media:content[^>]*type=["']image\/[^"']+["'][^>]*url=["']([^"']+)["'][^>]*\/?>/i,
    /<media:content[^>]*url=["']([^"']+)["'][^>]*type=["']image\/[^"']+["'][^>]*\/?>/i,
    /<enclosure[^>]*type=["']image\/[^"']+["'][^>]*url=["']([^"']+)["'][^>]*\/?>/i,
    /<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image\/[^"']+["'][^>]*\/?>/i,
    /<img[^>]*src=["']([^"']+)["'][^>]*>/i,
  ]);

  if (directImage) return directImage;

  const contentEncoded = tagValue(itemXml, 'content:encoded') || tagValue(itemXml, 'description');
  if (!contentEncoded) return '';

  const fromHtml = getFirstMatch(contentEncoded, [/<img[^>]*src=["']([^"']+)["'][^>]*>/i]);
  return fromHtml;
};

const extractVideoUrl = (itemXml: string): string => {
  const direct = getFirstMatch(itemXml, [
    /<media:content[^>]*type=["']video\/[^"']+["'][^>]*url=["']([^"']+)["'][^>]*\/?>/i,
    /<media:content[^>]*url=["']([^"']+)["'][^>]*type=["']video\/[^"']+["'][^>]*\/?>/i,
    /<enclosure[^>]*type=["']video\/[^"']+["'][^>]*url=["']([^"']+)["'][^>]*\/?>/i,
    /<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']video\/[^"']+["'][^>]*\/?>/i,
    /<iframe[^>]*src=["']([^"']+)["'][^>]*>/i,
  ]);

  return direct;
};

const extractSource = (itemXml: string, link: string): string => {
  const explicitSource = tagValue(itemXml, 'source') || tagValue(itemXml, 'dc:creator');
  if (explicitSource) return explicitSource;

  try {
    if (!link) return 'News';
    return new URL(link).hostname.replace(/^www\./i, '');
  } catch {
    return 'News';
  }
};

const extractPublishedAt = (itemXml: string): string => {
  const raw = tagValue(itemXml, 'pubDate') || tagValue(itemXml, 'published') || tagValue(itemXml, 'updated');
  if (!raw) return new Date().toISOString();

  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
};

const parseFeed = (xml: string): DiscoverArticle[] => {
  const rssItems = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const atomEntries = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  const blocks = [...rssItems, ...atomEntries];

  return blocks
    .map((itemXml, index) => {
      const title = stripHtml(tagValue(itemXml, 'title')) || 'Untitled';
      const link = extractLink(itemXml);
      const description =
        stripHtml(tagValue(itemXml, 'description')) ||
        stripHtml(tagValue(itemXml, 'summary')) ||
        stripHtml(tagValue(itemXml, 'content:encoded'));
      const source = extractSource(itemXml, link);
      const publishedAt = extractPublishedAt(itemXml);
      const imageUrl = extractImageUrl(itemXml);
      const videoUrl = extractVideoUrl(itemXml);

      if (!link) return null;

      return {
        id: `${link}-${index}`,
        title,
        summary: description || title,
        link,
        source,
        publishedAt,
        imageUrl: imageUrl || undefined,
        videoUrl: videoUrl || undefined,
        score: 0,
        matchedInterests: [],
      } as DiscoverArticle;
    })
    .filter((item): item is DiscoverArticle => Boolean(item));
};

const toGoogleNewsRssUrl = (topic: string): string => {
  const query = encodeURIComponent(topic.trim());
  return `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
};

const buildFeedUrls = (interests: string[]): string[] => {
  const topicCandidates = [...DEFAULT_TOPICS, ...interests.slice(0, 6)];
  const uniqueTopics = Array.from(new Set(topicCandidates.map((topic) => normalizeText(topic)).filter(Boolean)));

  const googleTopicFeeds = uniqueTopics.slice(0, 6).map(toGoogleNewsRssUrl);
  return Array.from(new Set([...BASE_FEEDS, ...googleTopicFeeds]));
};

const tokenize = (value: string): string[] => {
  return normalizeText(value).split(' ').filter((token) => token.length >= 3);
};

const scoreArticle = (article: DiscoverArticle, interests: string[], recentPrompts: string[]): DiscoverArticle => {
  const haystack = normalizeText(`${article.title} ${article.summary} ${article.source}`);
  let score = 0;
  const matchedInterests: string[] = [];

  interests.forEach((interest) => {
    const normalizedInterest = normalizeText(interest);
    if (!normalizedInterest) return;
    if (haystack.includes(normalizedInterest)) {
      score += 8;
      matchedInterests.push(normalizedInterest);
      return;
    }

    const tokens = tokenize(normalizedInterest);
    const tokenHits = tokens.filter((token) => haystack.includes(token)).length;
    if (tokenHits > 0) {
      score += tokenHits * 2;
      if (tokenHits >= Math.max(1, Math.floor(tokens.length / 2))) {
        matchedInterests.push(normalizedInterest);
      }
    }
  });

  recentPrompts.forEach((prompt) => {
    tokenize(prompt)
      .slice(0, 8)
      .forEach((token) => {
        if (haystack.includes(token)) {
          score += 0.6;
        }
      });
  });

  // Lightweight recency bonus.
  const ageHours = Math.max(
    0,
    (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60)
  );
  const recencyBonus = Math.max(0, 5 - ageHours / 12);
  score += recencyBonus;

  return {
    ...article,
    score,
    matchedInterests: Array.from(new Set(matchedInterests)).slice(0, 3),
  };
};

const dedupeArticles = (items: DiscoverArticle[]): DiscoverArticle[] => {
  const map = new Map<string, DiscoverArticle>();
  for (const item of items) {
    const key = item.link;
    const previous = map.get(key);
    if (!previous || item.score > previous.score) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
};

export const discoveryNewsService = {
  async getPersonalizedFeed(limit: number = 30): Promise<DiscoverArticle[]> {
    const [interests, recentPrompts] = await Promise.all([
      personalizationService.getTopInterests(14),
      personalizationService.getRecentPrompts(10),
    ]);

    const feedUrls = buildFeedUrls(interests);

    const feedResults = await Promise.allSettled(
      feedUrls.map(async (url) => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Feed request failed (${response.status})`);
        }
        const xml = await response.text();
        return parseFeed(xml);
      })
    );

    const merged = feedResults.flatMap((result) => {
      if (result.status !== 'fulfilled') return [];
      return result.value;
    });

    const scored = merged.map((article) => scoreArticle(article, interests, recentPrompts));
    const deduped = dedupeArticles(scored);

    return deduped
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      })
      .slice(0, Math.max(1, limit));
  },
};
