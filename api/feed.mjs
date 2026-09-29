import { neon } from '@neondatabase/serverless';
import { fetchTopic, TOPICS, validImageUrl } from '../lib/news.mjs';

const CACHE_MS = 5 * 60 * 1000;
const memoryCache = new Map();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function resultResponse(results) {
  const items = results.flatMap((result) => result.items);
  items.sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
  const errors = results.filter((result) => result.error).length;
  return json({ items, updatedAt: new Date().toISOString(), errors }, items.length ? 200 : 502);
}

async function fetchLive(selected) {
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
  return resultResponse(results);
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') return json({ error: 'Kun GET er tilladt.' }, 405);
    const url = new URL(request.url);
    const requested = url.searchParams.get('topic');
    const customQuery = url.searchParams.get('query')?.trim().slice(0, 100);
    const customLabel = url.searchParams.get('label')?.trim().slice(0, 60);
    const customTopic = requested?.startsWith('custom-') && customQuery && customLabel
      ? { id: requested.slice(0, 80), label: customLabel, query: customQuery }
      : null;
    const selected = customTopic ? [customTopic] : requested ? TOPICS.filter((topic) => topic.id === requested) : TOPICS;
    if (!selected.length) return json({ error: 'Ukendt emne.' }, 400);

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || customTopic) return fetchLive(selected);

    try {
      const sql = neon(databaseUrl);
      const rows = await sql`SELECT story_id, canonical_url, title, summary, source, source_url, image_url, published_at, topic_id, topic_label, topic_ids, processed_at FROM news_stories WHERE published_at > now() - interval '45 days' ORDER BY published_at DESC NULLS LAST LIMIT 250`;
      if (!rows.length) return fetchLive(selected);
      const selectedIds = new Set(selected.map((topic) => topic.id));
      const items = rows.map((row) => ({
        id: row.story_id,
        title: row.title,
        summary: row.summary,
        description: row.summary,
        link: row.canonical_url,
        source: row.source,
        sourceUrl: row.source_url,
        imageUrl: validImageUrl(row.image_url, row.canonical_url),
        publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
        topicId: row.topic_id,
        topicLabel: row.topic_label,
        topicIds: row.topic_ids || [row.topic_id],
        processedAt: row.processed_at ? new Date(row.processed_at).toISOString() : null,
      })).filter((item) => !requested || item.topicIds.includes(requested) || item.topicId === requested);
      if (!items.length) return fetchLive(selected);
      return resultResponse([{ items, error: false }]);
    } catch (error) {
      console.error('Database-read fejl:', error);
      return fetchLive(selected);
    }
  },
};
