import { neon } from '@neondatabase/serverless';
import { TOPICS, validImageUrl } from '../lib/news.mjs';

const DAILY_DISCOVERY_LIMITS = { world: 2, denmark: 4, surprise: 2 };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function resultResponse(results) {
  const items = results.flatMap((result) => result.items)
    .filter((item) => typeof item.summary === 'string' && item.summary.trim());
  items.sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
  const errors = results.filter((result) => result.error).length;
  return json({ items, updatedAt: new Date().toISOString(), errors });
}

function limitDailyDiscoveryStories(items, requested) {
  const topicCounts = new Map();
  const totals = new Map();
  const localDay = (value) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(value));
    const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
    return `${values.year}-${values.month}-${values.day}`;
  };
  return items.filter((item) => {
    const isDiscoveryFilter = Object.prototype.hasOwnProperty.call(DAILY_DISCOVERY_LIMITS, requested);
    const discoveryTopic = requested
      ? isDiscoveryFilter && item.topicIds?.includes(requested) ? requested : null
      : item.topicId;
    if (!Object.prototype.hasOwnProperty.call(DAILY_DISCOVERY_LIMITS, discoveryTopic)) return true;
    const day = localDay(item.publishedAt || Date.now());
    const key = `${day}:${discoveryTopic}`;
    const topicCount = topicCounts.get(key) || 0;
    const total = totals.get(day) || 0;
    if (topicCount >= DAILY_DISCOVERY_LIMITS[discoveryTopic] || total >= 8) return false;
    topicCounts.set(key, topicCount + 1);
    totals.set(day, total + 1);
    return true;
  });
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') return json({ error: 'Kun GET er tilladt.' }, 405);
    const url = new URL(request.url);
    const requested = url.searchParams.get('topic');
    const customQuery = url.searchParams.get('query')?.trim().slice(0, 100);
    const customLabel = url.searchParams.get('label')?.trim().slice(0, 60);
    const customTopic = requested?.startsWith('custom-') && customQuery && customLabel;
    if (customTopic) {
      return json({ items: [], updatedAt: new Date().toISOString(), errors: 0, notice: 'Egne emner er endnu ikke AI-behandlet.' });
    }
    const selected = requested ? TOPICS.filter((topic) => topic.id === requested) : TOPICS;
    if (!selected.length) return json({ error: 'Ukendt emne.' }, 400);
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return json({ error: 'Nyhederne kunne ikke hentes fra databasen.' }, 503);

    try {
      const sql = neon(databaseUrl);
      const rows = await sql`SELECT story_id, canonical_url, title, translated_title, summary, source, source_url, image_url, published_at, topic_id, topic_label, topic_ids, processed_at FROM news_stories WHERE published_at > now() - interval '45 days' ORDER BY published_at DESC NULLS LAST LIMIT 250`;
      if (!rows.length) return resultResponse([{ items: [], error: false }]);
      const items = rows.map((row) => ({
        id: row.story_id,
        title: row.title,
        translatedTitle: row.translated_title || row.title,
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
      })).filter((item) => typeof item.summary === 'string' && item.summary.trim())
        .filter((item) => !requested || item.topicIds.includes(requested) || item.topicId === requested);
      return resultResponse([{ items: limitDailyDiscoveryStories(items, requested), error: false }]);
    } catch (error) {
      console.error('Database-read fejl:', error);
      return json({ error: 'Nyhederne kunne ikke hentes fra databasen.' }, 503);
    }
  },
};
