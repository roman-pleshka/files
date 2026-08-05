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

  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(date));
}

function getFeedStyle(feedName = "News") {
  const normalized = String(feedName).toLowerCase();

  if (normalized.includes("tsn")) {
    return {
      prefix: "📢",
      titlePrefix: "TSN",
      sourceLabel: "TSN",
    };
  }

  return {
    prefix: "📰",
    titlePrefix: "Новини",
    sourceLabel: "Новини",
  };
}

function buildTelegramText(item, feedName = "News") {
  const style = getFeedStyle(feedName);
  const title = escapeHtml(item.title || "Без назви");
  const link = escapeHtml(item.link || "");
  const source = escapeHtml(style.sourceLabel || "Новини");
  const when = formatPublishedDate(item.pubDate);

  const headline = style.prefix + " " + title;
  const meta = when ? "🕒 " + when + " • " + source : source;

  const parts = [
    "<b>" + headline + "</b>",
    "<i>" + meta + "</i>",
    '<a href="' + link + '">Читати повністю →</a>',
    "<i>INSIDER UA | Прислати контент</i>",
  ].filter(Boolean);

  return parts.join("\n");
}

function normalizeState(rawState = {}) {
  const safeState = rawState && typeof rawState === "object" ? rawState : {};
  const state = { ...safeState, feeds: {} };

  const rawFeeds = safeState.feeds && typeof safeState.feeds === "object" ? safeState.feeds : {};

  for (const [feedId, value] of Object.entries(rawFeeds)) {
    if (value && typeof value === "object") {
      const lastSeenAt = Number(value.lastSeenAt || BOT_STARTED_AT);
      state.feeds[feedId] = {
        ...value,
        lastSeenAt: Number.isFinite(lastSeenAt) ? lastSeenAt : BOT_STARTED_AT,
      };
      continue;
    }

    const lastSeenAt = Number(value || BOT_STARTED_AT);
    state.feeds[feedId] = {
      lastSeenAt: Number.isFinite(lastSeenAt) ? lastSeenAt : BOT_STARTED_AT,
      lastLink: typeof value === "string" ? value : "",
    };
  }

  return state;
}

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    return normalizeState(parsed);
  } catch {
    return normalizeState({ feeds: {} });
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(normalizeState(state), null, 2));
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
  const normalizedState = normalizeState(state);
  const lastSeenAt = Number(normalizedState.feeds?.[feed.id]?.lastSeenAt || BOT_STARTED_AT);

  console.log(`[${new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv" }).format(new Date())}] Перевірка RSS: ${feed.url}`);

  let xml;
  try {
    const res = await fetchWithRetry(feed.url, config.RETRY_COUNT || 3);
    xml = await res.text();
  } catch (error) {
    console.error(`Не вдалося завантажити RSS для фіда ${feed.id}:`, error.message);
    return normalizedState;
  }

  const items = parseRss(xml)
    .map((item) => ({ ...item, publishedAt: parseDate(item.pubDate) }))
    .filter((item) => item.link && Number.isFinite(item.publishedAt))
    .filter((item) => !seenLinks.has(item.link))
    .filter((item) => item.publishedAt >= BOT_STARTED_AT)
    .filter((item) => item.publishedAt > lastSeenAt)
    .sort((a, b) => a.publishedAt - b.publishedAt);

  if (items.length === 0) {
    console.log(`З моменту запуску у ${feed.id} нових статей немає.`);
    state.feeds = normalizedState.feeds;
    return normalizedState;
  }

  for (const item of items) {
    seenLinks.add(item.link);
    await sendToTelegram(buildTelegramText(item, feed.id));
    normalizedState.feeds[feed.id] = {
      ...normalizedState.feeds[feed.id],
      lastSeenAt: Math.max(lastSeenAt, item.publishedAt),
      lastLink: item.link,
    };
  }

  state.feeds = normalizedState.feeds;
  saveState(state);
  return normalizedState;
}

async function checkRssAndPublish() {
  const state = loadState();
  const feeds = getFeeds();
  const seenLinks = new Set();

  for (const feed of feeds) {
    await checkFeed(feed, state, seenLinks);
  }

  saveState(state);
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
  formatPublishedDate,
  getFeedStyle,
  normalizeState,
  loadState,
  saveState,
  clearState,
  isNewSinceStartup,
  checkRssAndPublish,
  startBot,
  getFeeds,
  sendToTelegram,
};

