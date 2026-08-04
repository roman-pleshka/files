// bot.js
// RSS → Telegram бот:
// - перевіряє RSS/Atom фіди
// - публікує нові статті в канал
// - підтримує кілька фідів і стійку роботу без повторного дублювання

const fs = require("fs");
const path = require("path");
const config = require("./config");

const STATE_FILE = path.join(__dirname, "last-seen.json");
const DEFAULT_RECENT_HOURS = 0;
const BOT_STARTED_AT = Date.now();

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeEntities(str = "") {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeEntities(match[1]) : null;
}

function parseRss(xml) {
  const items = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];

  for (const block of itemBlocks) {
    const title = extractTag(block, "title");

    let link = extractTag(block, "link");
    if (!link) {
      const hrefMatch = block.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (hrefMatch) link = hrefMatch[1];
    }

    const pubDate = extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated");

    if (title && link) {
      items.push({ title, link: link.trim(), pubDate });
    }
  }

  return items;
}

function formatPublishedDate(dateValue) {
  const date = parseDate(dateValue);
  if (!date) return "";

  return new Date(date).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFeedStyle(feedName = "News") {
  const normalized = String(feedName).toLowerCase();

  if (normalized.includes("bbc")) {
    return {
      prefix: "🔵",
      titlePrefix: "BBC News",
      accent: "<b>🔵 " + "</b>",
      sourceColor: "<b>BBC World</b>",
    };
  }

  if (normalized.includes("tagesschau")) {
    return {
      prefix: "🟡",
      titlePrefix: "Tagesschau",
      accent: "<b>🟡 " + "</b>",
      sourceColor: "<b>Tagesschau</b>",
    };
  }

  return {
    prefix: "📰",
    titlePrefix: "News",
    accent: "<b>📰 " + "</b>",
    sourceColor: "<b>News</b>",
  };
}

function buildTelegramText(item, feedName = "News") {
  const style = getFeedStyle(feedName);
  const title = escapeHtml(item.title || "Без назви");
  const link = escapeHtml(item.link || "");
  const source = escapeHtml(feedName || "News");
  const when = formatPublishedDate(item.pubDate);

  const headline = style.prefix + " " + title;
  const meta = when ? "🕒 " + when + " • " + style.titlePrefix : style.titlePrefix;

  const parts = [
    "<b>" + headline + "</b>",
    "<i>" + meta + "</i>",
    "<i>📌 Джерело: " + source + "</i>",
    '<a href="' + link + '">Читати повністю →</a>',
  ].filter(Boolean);

  return parts.join("\n");
}

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    return parsed && typeof parsed === "object" ? parsed : { feeds: {} };
  } catch {
    return { feeds: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function clearState() {
  saveState({ feeds: {} });
}

function parseDate(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isNewSinceStartup(item, startupTimestamp = BOT_STARTED_AT) {
  const timestamp = parseDate(item && item.pubDate);
  if (timestamp === null) return true;
  return timestamp >= startupTimestamp;
}

function normalizeFeeds(rawFeeds) {
  if (!rawFeeds) {
    return [{ id: "default", url: config.RSS_URL }];
  }

  if (Array.isArray(rawFeeds)) {
    return rawFeeds.map((entry, index) => {
      if (typeof entry === "string") {
        return { id: `feed-${index + 1}`, url: entry };
      }

      return {
        id: entry.id || `feed-${index + 1}`,
        url: entry.url || entry.RSS_URL,
      };
    });
  }

  if (typeof rawFeeds === "object") {
    return Object.entries(rawFeeds).map(([id, url]) => ({ id, url }));
  }

  return [{ id: "default", url: String(rawFeeds) }];
}

function getFeeds() {
  return normalizeFeeds(config.RSS_FEEDS || config.RSS_URL);
}

async function fetchWithRetry(url, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        console.warn(`Не вдалося завантажити RSS (${attempt}/${retries}). Повторна спроба...`);
      }
    }
  }

  throw lastError || new Error(`Не вдалося завантажити ${url}`);
}

async function sendToTelegram(text, telegramConfig = config) {
  const url = `https://api.telegram.org/bot${telegramConfig.TELEGRAM_BOT_TOKEN}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: telegramConfig.TELEGRAM_CHANNEL_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error("Помилка Telegram API:", data);
    return false;
  }

  console.log("Повідомлення надіслано в канал.");
  return true;
}

async function checkFeed(feed, state, seenLinks = new Set()) {
  console.log(`[${new Date().toLocaleString()}] Перевірка RSS: ${feed.url}`);

  let xml;
  try {
    const res = await fetchWithRetry(feed.url, config.RETRY_COUNT || 3);
    xml = await res.text();
  } catch (error) {
    console.error(`Не вдалося завантажити RSS для фіда ${feed.id}:`, error.message);
    return;
  }

  const items = parseRss(xml)
    .filter((item) => isNewSinceStartup(item, BOT_STARTED_AT))
    .filter((item) => item.link && !seenLinks.has(item.link));

  if (items.length === 0) {
    console.log(`З моменту запуску у ${feed.id} нових статей немає.`);
    return;
  }

  for (const item of [...items].reverse()) {
    seenLinks.add(item.link);
    await sendToTelegram(buildTelegramText(item, feed.id));
  }

  state.feeds = state.feeds || {};
  state.feeds[feed.id] = items[0].link;
  saveState(state);
}

async function checkRssAndPublish() {
  const state = { feeds: {} };
  const feeds = getFeeds();
  const seenLinks = new Set();

  for (const feed of feeds) {
    await checkFeed(feed, state, seenLinks);
  }
}

function startBot() {
  const intervalMs = Number(config.CHECK_INTERVAL_MS || 60 * 1000);

  if (config.CLEAR_STATE_ON_START !== false) {
    clearState();
  }

  console.log("RSS → Telegram бот запущено.");
  console.log(`Перевірка кожні ${intervalMs / 1000} сек.`);
  console.log("Публікуються тільки новини, що з’явились після запуску бота.");

  checkRssAndPublish();
  return setInterval(checkRssAndPublish, intervalMs);
}

if (require.main === module) {
  startBot();
}

module.exports = {
  parseRss,
  buildTelegramText,
  getFeedStyle,
  loadState,
  saveState,
  clearState,
  isNewSinceStartup,
  checkRssAndPublish,
  startBot,
  getFeeds,
  sendToTelegram,
};

