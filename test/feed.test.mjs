import assert from 'node:assert/strict';
import test from 'node:test';

import feed from '../api/feed.mjs';

function rss(items = [{ title: 'Lokal historie', link: 'https://example.com/story', sourceUrl: 'https://example.com', description: 'En beskrivelse' }]) {
  return `<?xml version="1.0"?><rss><channel>${items.map((item) => `<item>
    <title>${item.title}</title>
    <link>${item.link}</link>
    <pubDate>${new Date().toUTCString()}</pubDate>
    <source url="${item.sourceUrl}">Testavisen</source>
    <description>${item.description}</description>
  </item>`).join('')}</channel></rss>`;
}

test('the local feed uses Danish search terms and Danish Google News edition', async (t) => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  let requestedLanguage;
  globalThis.fetch = async (url, options) => {
    requestedUrl = new URL(url);
    requestedLanguage = options.headers['Accept-Language'];
    return new Response(rss([
      { title: 'Lokal dansk historie', link: 'https://example.dk/dansk', sourceUrl: 'https://example.dk', description: 'En beskrivelse fra kommunen' },
      { title: 'Local story in English', link: 'https://example.com/english', sourceUrl: 'https://example.com', description: 'News for international residents' },
      { title: 'Norske nyheter fra kommunen', link: 'https://example.no/norsk', sourceUrl: 'https://example.no', description: 'Dette blir omtalt videre' },
    ]), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await feed.fetch(new Request('https://mynews.test/api/feed?topic=local'));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.items.length, 2);
  assert.deepEqual(body.items.map((item) => item.title), ['Lokal dansk historie', 'Local story in English']);
  assert.ok(body.items.every((item) => item.topicId === 'local'));
  assert.equal(requestedUrl.searchParams.get('hl'), 'da-DK');
  assert.equal(requestedUrl.searchParams.get('gl'), 'DK');
  assert.equal(requestedUrl.searchParams.get('ceid'), 'DK:da');
  assert.match(requestedUrl.searchParams.get('q'), /Frederikssund/);
  assert.match(requestedUrl.searchParams.get('q'), /"Vinge Frederikssund"/);
  assert.doesNotMatch(requestedUrl.searchParams.get('q'), /\bOR Vinge OR\b/);
  assert.match(requestedUrl.searchParams.get('q'), /-site:\.no/);
  assert.match(requestedUrl.searchParams.get('q'), /-norsk -nyheter/);
  assert.equal(requestedLanguage, 'da-DK,da;q=0.9');
});
