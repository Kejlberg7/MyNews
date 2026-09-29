export const TOPICS = [
  {
    id: 'local',
    label: 'Lokalt',
    query: '(Frederikssund OR "Frederikssund Kommune" OR "Vinge Frederikssund" OR Slangerup OR Jægerspris) -vejr -site:.no -norsk -nyheter',
    language: 'da',
    country: 'DK',
  },
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

export function decodeXml(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) : '';
}

function attribute(xml, name) {
  const match = xml.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'));
  return match ? decodeXml(match[1].trim()) : '';
}

function isNorwegianLocalStory(item) {
  try {
    const hostname = new URL(item.sourceUrl || item.link).hostname.toLowerCase();
    if (hostname === 'no' || hostname.endsWith('.no')) return true;
  } catch {
    // Invalid source URLs are handled by the regular link validation.
  }
  const text = `${item.title} ${item.description}`.toLocaleLowerCase('nb-NO');
  if (/\b(?:nyheter|norsk|norge|norges|fylke|fylkeskommune)\b/u.test(text)) return true;
  const signals = text.match(/\b(?:av|ble|blir|etter|fortsatt|gjennom|mener|ordfører|sier|ønsker)\b/gu) || [];
  return new Set(signals).size >= 2;
}

export function validImageUrl(value, pageUrl) {
  try {
    const image = new URL(value);
    const page = new URL(pageUrl);
    if (image.protocol !== 'https:') return '';
    if (image.origin === page.origin && image.pathname === page.pathname) return '';
    if (image.hostname === 'news.google.com' && image.pathname.startsWith('/rss/articles/')) return '';
    if (page.hostname === 'news.google.com' && image.hostname === 'lh3.googleusercontent.com') return '';
    return image.toString();
  } catch {
    return '';
  }
}

function safeImageUrl(item, articleUrl) {
  const candidates = [
    item.match(/<media:thumbnail\b[^>]*>/i)?.[0],
    item.match(/<media:content\b[^>]*>/i)?.[0],
    item.match(/<enclosure\b[^>]*>/i)?.[0],
  ].filter(Boolean);
  for (const candidate of candidates) {
    const url = validImageUrl(attribute(candidate, 'url'), articleUrl);
    if (url) return url;
  }
  return '';
}

export function parseFeed(xml, topic) {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(([, item], feedRank) => {
    const sourceMatch = item.match(/<source(?:\s+url="([^"]*)")?[^>]*>([\s\S]*?)<\/source>/i);
    const link = tag(item, 'link');
    const published = Date.parse(tag(item, 'pubDate'));
    const description = tag(item, 'description').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      title: tag(item, 'title'),
      link,
      source: sourceMatch ? decodeXml(sourceMatch[2].replace(/<[^>]+>/g, '').trim()) : 'Google News',
      sourceUrl: sourceMatch?.[1] ? decodeXml(sourceMatch[1]) : '',
      description,
      imageUrl: safeImageUrl(item, link),
      publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : null,
      topicId: topic.id,
      topicLabel: topic.label,
      topicIds: [topic.id],
      feedRank,
    };
  }).filter((item) => item.title && /^https:\/\//i.test(item.link) && item.publishedAt && Date.parse(item.publishedAt) >= cutoff);
  return topic.id === 'local' ? items.filter((item) => !isNorwegianLocalStory(item)).slice(0, 50) : items.slice(0, 50);
}

export async function fetchTopic(topic, {limit = 50} = {}) {
  const url = new URL('https://news.google.com/rss/search');
  const language = topic.language || 'en';
  const country = topic.country || 'US';
  const locale = `${language}-${country}`;
  url.search = new URLSearchParams({ q: topic.query, hl: locale, gl: country, ceid: `${country}:${language}` }).toString();
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MyNews/1.0 (personal news reader)',
      Accept: 'application/rss+xml, application/xml, text/xml',
      'Accept-Language': `${locale},${language};q=0.9`,
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Nyhedskilden svarede ${response.status}.`);
  return parseFeed(await response.text(), topic).slice(0, limit);
}

export function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$)/i.test(key)) url.searchParams.delete(key);
    }
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/$/, '');
    return url.toString();
  } catch {
    return value;
  }
}

export function titleSimilarity(left, right) {
  const normalize = (value) => value.toLocaleLowerCase('da')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !['the', 'and', 'for', 'med', 'der', 'fra', 'til', 'den', 'det', 'this', 'that', 'after', 'over'].includes(word));
  const a = new Set(normalize(left));
  const b = new Set(normalize(right));
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const word of a) if (b.has(word)) overlap++;
  return (2 * overlap) / (a.size + b.size);
}

function stripHtml(value = '') {
  return decodeXml(value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function metaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeXml(match[1]);
  }
  return '';
}

export async function fetchArticle(item) {
  const fallback = [item.title, item.description].filter(Boolean).join('\n\n').slice(0, 3200);
  const articleUrl = item.articleUrl || item.link;
  try {
    const response = await fetch(articleUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyNews/1.0; +https://my-news-two-liard.vercel.app)', Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return { ...item, articleText: fallback };
    const reader = response.body?.getReader();
    if (!reader) return { ...item, articleText: fallback };
    const chunks = [];
    let total = 0;
    while (total < 800_000) {
      const {done, value} = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, 800_000 - total);
      chunks.push(chunk);
      total += chunk.byteLength;
      if (total >= 800_000) break;
    }
    try { await reader.cancel(); } catch { /* Response already closed. */ }
    const html = new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
    const main = html.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i)?.[1] || '';
    const paragraphs = [...(main.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))].map(([, text]) => stripHtml(text)).filter((text) => text.length > 45);
    const articleText = (paragraphs.length ? paragraphs.join('\n\n') : stripHtml(main)).slice(0, 3600);
    const imageCandidate = metaContent(html, 'og:image') || metaContent(html, 'twitter:image');
    let imageUrl = validImageUrl(item.imageUrl, item.link);
    try {
      const candidate = validImageUrl(new URL(imageCandidate, response.url).toString(), response.url);
      if (candidate) imageUrl = candidate;
    } catch { /* Keep a valid RSS image or no image. */ }
    return {
      ...item,
      sourceUrl: item.sourceUrl || new URL(response.url).origin,
      imageUrl,
      articleText: articleText.length >= 120 ? articleText : fallback,
    };
  } catch {
    return { ...item, articleText: fallback };
  }
}
