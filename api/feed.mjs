import { neon } from '@neondatabase/serverless';

const TOPICS = [
  { id: 'local', label: 'Lokalt', query: 'Frederikssund Denmark news -weather' },
  { id: 'sport', label: 'Sport', query: 'sports news Denmark' },
  { id: 'football', label: 'Fodbold', query: 'football news Europe Denmark' },
  { id: 'premier-league', label: 'Premier League', query: 'Premier League football news' },
  { id: 'superliga', label: 'Superligaen', query: 'Danish Superliga football news' },
  { id: 'liverpool', label: 'Liverpool', query: 'Liverpool FC news' },
  { id: 'fck', label: 'FCK', query: '(FC Copenhagen OR FCK) football news' },
  { id: 'padel', label: 'Padel', query: 'padel news Denmark' },
  { id: 'tech', label: 'Tech & AI', query: '(artificial intelligence OR AI OR technology) news' },
  { id: 'ev', label: 'Biler & elbiler', query: '(electric vehicles OR electric cars) news Denmark' },
  { id: 'gaming', label: 'Spil', query: '(video games OR gaming industry) news' },
  { id: 'culture', label: 'Film & serier', query: '(movies OR television series OR streaming) news' },
];
const CACHE_MS = 5 * 60 * 1000;
const memoryCache = new Map();

function decodeXml(value = '') {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) : '';
}
function parseFeed(xml, topic) {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(([, item]) => {
    const sourceMatch = item.match(/<source(?:\s+url="([^"]*)")?[^>]*>([\s\S]*?)<\/source>/i);
    const link = tag(item, 'link');
    const published = Date.parse(tag(item, 'pubDate'));
    const description = tag(item, 'description').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
    return { title: tag(item, 'title'), link, source: sourceMatch ? decodeXml(sourceMatch[2].replace(/<[^>]+>/g, '').trim()) : 'Google News', sourceUrl: sourceMatch?.[1] ? decodeXml(sourceMatch[1]) : '', description, publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : null, topicId: topic.id, topicLabel: topic.label };
  }).filter((item) => item.title && /^https:\/\//i.test(item.link) && item.publishedAt && Date.parse(item.publishedAt) >= cutoff).slice(0, 50);
}
async function fetchTopic(topic) {
  const url = new URL('https://news.google.com/rss/search');
  url.search = new URLSearchParams({ q: topic.query, hl: 'en-US', gl: 'US', ceid: 'US:en' }).toString();
  const response = await fetch(url, { headers: { 'User-Agent': 'MyNews/1.0 (personal news reader)', Accept: 'application/rss+xml, application/xml, text/xml', 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Nyhedskilden svarede ${response.status}.`);
  return parseFeed(await response.text(), topic);
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export default {
  async fetch(request) {
    if (request.method !== 'GET') return json({ error: 'Kun GET er tilladt.' }, 405);
    const url = new URL(request.url);
    const requested = url.searchParams.get('topic');
    const selected = requested ? TOPICS.filter((topic) => topic.id === requested) : TOPICS;
    if (!selected.length) return json({ error: 'Ukendt emne.' }, 400);
    if (!process.env.DATABASE_URL) {
      const results = await Promise.all(selected.map(async (topic) => {
        const cached = memoryCache.get(topic.id);
        if (cached && Date.now() - cached.at < CACHE_MS) return { items: cached.items, error: false };
        try {
          const items = await fetchTopic(topic);
          memoryCache.set(topic.id, { at: Date.now(), items });
          return { items, error: false };
        } catch {
          return { items: cached?.items || [], error: true };
        }
      }));
      const items = results.flatMap((result) => result.items);
      items.sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
      const errors = results.filter((result) => result.error).length;
      return json({ items, updatedAt: new Date().toISOString(), errors }, items.length ? 200 : 502);
    }

    try {
      const sql = neon(process.env.DATABASE_URL);
      await sql`CREATE TABLE IF NOT EXISTS news_feed_cache (topic_id text PRIMARY KEY, items jsonb NOT NULL, cached_at timestamptz NOT NULL DEFAULT now())`;
      const cachedRows = await sql`SELECT topic_id, items, cached_at FROM news_feed_cache`;
      const cache = new Map(cachedRows.map((row) => [row.topic_id, row]));
      const results = await Promise.all(selected.map(async (topic) => {
        const cached = cache.get(topic.id);
        if (cached && Date.now() - new Date(cached.cached_at).getTime() < CACHE_MS) return { items: cached.items, error: false };
        try {
          const items = await fetchTopic(topic);
          await sql`INSERT INTO news_feed_cache (topic_id, items, cached_at) VALUES (${topic.id}, ${JSON.stringify(items)}::jsonb, now()) ON CONFLICT (topic_id) DO UPDATE SET items = EXCLUDED.items, cached_at = EXCLUDED.cached_at`;
          return { items, error: false };
        } catch {
          return { items: cached?.items || [], error: true };
        }
      }));
      const items = results.flatMap((result) => result.items);
      items.sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
      const errors = results.filter((result) => result.error).length;
      return json({ items, updatedAt: new Date().toISOString(), errors }, items.length ? 200 : 502);
    } catch (error) {
      console.error('Feed-fejl:', error);
      return json({ error: 'Kunne ikke hente nyheder lige nu.' }, 503);
    }
  },
};
