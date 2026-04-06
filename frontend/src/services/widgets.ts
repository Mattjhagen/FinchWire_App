// Weather: wttr.in  |  Market: CoinGecko  |  Verse: labs.bible.org  |  RSS: any feed URL
import { Platform } from 'react-native';

export interface WeatherData {
  temp_c: number;
  temp_f: number;
  condition: string;
  location: string;
}

export interface MarketTicker {
  symbol: string;
  price: number;
  change24h: number; // percent
}

export interface VerseOfDay {
  text: string;
  reference: string; // e.g. "John 3:16"
}

export interface RssItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
}

// ── Weather via wttr.in (no key needed) ────────────────────────────────────

export async function fetchWeather(): Promise<WeatherData> {
  const res = await fetch('https://wttr.in/?format=j1', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Weather ${res.status}`);
  const json = await res.json();

  const current = json.current_condition?.[0];
  const area = json.nearest_area?.[0];
  const areaName = area?.areaName?.[0]?.value || area?.region?.[0]?.value || '';

  return {
    temp_c: Number(current?.temp_C ?? 0),
    temp_f: Number(current?.temp_F ?? 0),
    condition: current?.weatherDesc?.[0]?.value ?? 'Unknown',
    location: areaName,
  };
}

// ── Market prices via CoinGecko (no key needed) ────────────────────────────

const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
};

export async function fetchMarketPrices(symbols: string[]): Promise<MarketTicker[]> {
  const cryptoSymbols = symbols.filter((s) => COINGECKO_IDS[s.toUpperCase()]);
  if (cryptoSymbols.length === 0) return [];

  const ids = cryptoSymbols.map((s) => COINGECKO_IDS[s.toUpperCase()]).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Market ${res.status}`);
  const json = await res.json();

  return cryptoSymbols.map((sym) => {
    const id = COINGECKO_IDS[sym.toUpperCase()];
    const entry = json[id] || {};
    return {
      symbol: sym.toUpperCase(),
      price: entry.usd ?? 0,
      change24h: entry.usd_24h_change ?? 0,
    };
  });
}

// ── Verse of the Day via labs.bible.org (no key needed) ───────────────────

export async function fetchVerseOfDay(): Promise<VerseOfDay> {
  const res = await fetch('https://labs.bible.org/api/?passage=votd&type=json', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Verse ${res.status}`);
  const json = await res.json();
  const verse = Array.isArray(json) ? json[0] : json;

  const text = verse?.text ?? '';
  const bookname = verse?.bookname ?? '';
  const chapter = verse?.chapter ?? '';
  const verseNum = verse?.verse ?? '';

  return {
    text: text.replace(/<[^>]+>/g, '').trim(),
    reference: `${bookname} ${chapter}:${verseNum}`.trim(),
  };
}

// ── Generic RSS feed parser ─────────────────────────────────────────────────

const decodeXml = (value: string): string =>
  value
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const tagValue = (input: string, tag: string): string => {
  const match = input.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]).trim() : '';
};

export async function fetchRssFeed(feedUrl: string, label: string, limit = 8): Promise<RssItem[]> {
  const isWeb = Platform.OS === 'web';
  const finalUrl = isWeb
    ? `https://finchwire-app.onrender.com/api/cors-proxy?url=${encodeURIComponent(feedUrl)}`
    : feedUrl;

  const res = await fetch(finalUrl, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
  if (!res.ok) throw new Error(`RSS ${res.status}`);
  const xml = await res.text();

  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  return items.slice(0, limit).map((item, index) => {
    const title = tagValue(item, 'title');
    const link = tagValue(item, 'link');
    const source = tagValue(item, 'source') || label;
    const publishedAt = tagValue(item, 'pubDate');
    return {
      id: `${feedUrl}-${index}`,
      title: title || 'Untitled',
      link,
      source,
      publishedAt,
    };
  });
}

// Pre-configured RSS feeds — add more URLs here anytime
export const PRESET_RSS_FEEDS: { url: string; label: string }[] = [
  { url: 'https://www.theverge.com/rss/index.xml', label: 'The Verge' },
  { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', label: 'BBC Tech' },
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', label: 'CoinDesk' },
  { url: 'https://www.wired.com/feed/rss', label: 'Wired' },
];
