const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
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
const cache = new Map();
const CACHE_MS = 5 * 60 * 1000;

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
    const published = Date.parse(tag(item, 'pubDate'));
    return { title: tag(item, 'title'), link: tag(item, 'link'), source: sourceMatch ? decodeXml(sourceMatch[2].replace(/<[^>]+>/g, '').trim()) : 'Google News', sourceUrl: sourceMatch?.[1] ? decodeXml(sourceMatch[1]) : '', description: tag(item, 'description').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim(), publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : null, topicId: topic.id, topicLabel: topic.label };
  }).filter((item) => item.title && /^https:\/\//i.test(item.link) && item.publishedAt && Date.parse(item.publishedAt) >= cutoff).slice(0, 50);
}
function fetchText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'MyNews/1.0 (personal news reader)', Accept: 'application/rss+xml, application/xml, text/xml', 'Accept-Language': 'en-US,en;q=0.9' } }, (response) => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.resume();
        if (redirects >= 5) return reject(new Error('For mange viderestillinger fra nyhedskilden.'));
        return resolve(fetchText(new URL(response.headers.location, url), redirects + 1));
      }
      if (status < 200 || status >= 300) { response.resume(); return reject(new Error(`Nyhedskilden svarede ${status}.`)); }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      response.on('error', reject);
    });
    request.setTimeout(12000, () => request.destroy(new Error('Nyhedskilden svarede ikke i tide.')));
    request.on('error', reject);
  });
}
async function getTopicFeed(topic) {
  const cached = cache.get(topic.id);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.items;
  const url = new URL('https://news.google.com/rss/search');
  url.search = new URLSearchParams({ q: topic.query, hl: 'en-US', gl: 'US', ceid: 'US:en' }).toString();
  const items = parseFeed(await fetchText(url), topic);
  cache.set(topic.id, { at: Date.now(), items });
  return items;
}
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/topics') return send(res, 200, JSON.stringify(TOPICS.map(({ id, label }) => ({ id, label }))));
  if (url.pathname === '/api/feed') {
    const requested = url.searchParams.get('topic');
    const customQuery = url.searchParams.get('query')?.trim().slice(0, 100);
    const customLabel = url.searchParams.get('label')?.trim().slice(0, 60);
    const customTopic = requested?.startsWith('custom-') && customQuery && customLabel ? { id: requested.slice(0, 80), label: customLabel, query: customQuery } : null;
    const selected = customTopic ? [customTopic] : requested ? TOPICS.filter((topic) => topic.id === requested) : TOPICS;
    if (!selected.length) return send(res, 400, JSON.stringify({ error: 'Ukendt emne.' }));
    const results = await Promise.allSettled(selected.map(getTopicFeed));
    const items = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    items.sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
    const errors = results.filter((result) => result.status === 'rejected').length;
    return send(res, items.length ? 200 : 502, JSON.stringify({ items, updatedAt: new Date().toISOString(), errors }));
  }
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.resolve(ROOT, `.${pathname}`);
  if (!filePath.startsWith(`${ROOT}${path.sep}`)) return send(res, 403, 'Ingen adgang', 'text/plain; charset=utf-8');
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
  fs.readFile(filePath, (error, data) => error ? send(res, 404, 'Ikke fundet', 'text/plain; charset=utf-8') : send(res, 200, data, types[path.extname(filePath)] || 'application/octet-stream'));
}).listen(PORT, () => console.log(`MyNews kører på http://localhost:${PORT}`));
