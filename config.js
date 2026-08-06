// config.js
// Налаштування можна передати через env-перемінні або задати тут.

const defaultFeeds = [
  { id: "tsn-ua", url: "https://tsn.ua/rss" },
];

const baseConfig = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "8718791035:AAH2RykxS6PPJXXKbkw3kjNQVXXWxL1F-hw",
  TELEGRAM_CHANNEL_ID: process.env.TELEGRAM_CHANNEL_ID || "@test_roman_just_try",
  RSS_FEEDS: process.env.RSS_FEEDS ? JSON.parse(process.env.RSS_FEEDS) : defaultFeeds,
  CHECK_INTERVAL_MS: Number(process.env.CHECK_INTERVAL_MS || 60 * 1000),
  RETRY_COUNT: Number(process.env.RETRY_COUNT || 3),
  CLEAR_STATE_ON_START: true,
};

module.exports = baseConfig;
