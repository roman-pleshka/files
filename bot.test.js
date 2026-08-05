const test = require('node:test');
const assert = require('node:assert/strict');

global.fetch = async () => ({
  ok: true,
  status: 200,
  text: async () => `
    <rss version="2.0">
      <channel>
        <title>Test Feed</title>
        <item>
          <title>First &amp; Example</title>
          <link>https://example.com/first</link>
          <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
        </item>
        <item>
          <title>Second</title>
          <link>https://example.com/second</link>
        </item>
      </channel>
    </rss>
  `,
});

global.setInterval = () => 1;

global.clearInterval = () => {};

const bot = require('./bot.js');

test('parseRss returns items from RSS feed', () => {
  const items = bot.parseRss(`
    <rss><channel>
      <item><title>Alpha</title><link>https://example.com/a</link></item>
      <item><title>Beta</title><link>https://example.com/b</link></item>
    </channel></rss>
  `);

  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Alpha');
  assert.equal(items[0].link, 'https://example.com/a');
});

test('buildTelegramText escapes HTML and keeps link', () => {
  const text = bot.buildTelegramText({
    title: 'Test <b>bold</b> & more',
    link: 'https://example.com/test?x=1&y=2',
  });

  assert.match(text, /Test &lt;b&gt;bold&lt;\/b&gt; &amp; more/);
  assert.match(text, /https:\/\/example.com\/test\?x=1&amp;y=2/);
});

test('buildTelegramText supports the TSN styling', () => {
  const tsnText = bot.buildTelegramText({
    title: 'TSN headline',
    link: 'https://example.com/tsn',
  }, 'tsn-ua');

  const neutralText = bot.buildTelegramText({
    title: 'General news',
    link: 'https://example.com/news',
  }, 'news');

  assert.match(tsnText, /📢|TSN/);
  assert.match(neutralText, /📰|Новини/);
});

test('formatPublishedDate uses Kyiv timezone', () => {
  const text = bot.formatPublishedDate('Mon, 01 Jan 2024 12:00:00 GMT');
  assert.match(text, /14:00/);
});

test('normalizeState keeps feed timestamps for time-based deduplication', () => {
  const normalized = bot.normalizeState({
    feeds: {
      tsn: { lastSeenAt: 1704110400000 },
      legacy: 'https://example.com/old',
    },
  });

  assert.equal(normalized.feeds.tsn.lastSeenAt, 1704110400000);
  assert.equal(typeof normalized.feeds.legacy.lastSeenAt, 'number');
});
