import assert from 'node:assert/strict';
import test from 'node:test';

import feed from '../api/feed.mjs';

function rss(title = 'Lokal historie') {
  return `<?xml version="1.0"?><rss><channel><item>
    <title>${title}</title>
    <link>https://example.com/story</link>
    <pubDate>${new Date().toUTCString()}</pubDate>
    <source url="https://example.com">Testavisen</source>
    <description>En beskrivelse</description>
  </item></channel></rss>`;
}

test('the local feed uses Danish search terms and Danish Google News edition', async (t) => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  let requestedLanguage;
  globalThis.fetch = async (url, options) => {
    requestedUrl = new URL(url);
    requestedLanguage = options.headers['Accept-Language'];
    return new Response(rss(), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await feed.fetch(new Request('https://mynews.test/api/feed?topic=local'));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].topicId, 'local');
  assert.equal(requestedUrl.searchParams.get('hl'), 'da-DK');
  assert.equal(requestedUrl.searchParams.get('gl'), 'DK');
  assert.equal(requestedUrl.searchParams.get('ceid'), 'DK:da');
  assert.match(requestedUrl.searchParams.get('q'), /Frederikssund/);
  assert.match(requestedUrl.searchParams.get('q'), /Vinge/);
  assert.equal(requestedLanguage, 'da-DK,da;q=0.9');
});
