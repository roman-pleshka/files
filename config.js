// config.js
// Налаштування можна передати через env-перемінні або задати тут.

const defaultFeeds = [
  { id: "tsn-ua", url: "https://tsn.ua/rss" },
  { id: "tsn-news", url: "https://tsn.ua/rss" },
];

const baseConfig = {
  // Токен бота від @BotFather. Можна передати як TELEGRAM_BOT_TOKEN=...
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "8718791035:AAH2RykxS6PPJXXKbkw3kjNQVXXWxL1F-hw",

  // ID або @username каналу. Бот має бути адміністратором каналу.
  // Приклади: "@my_channel" або "-1001234567890"
  TELEGRAM_CHANNEL_ID: process.env.TELEGRAM_CHANNEL_ID || "@test_roman_just_try",

  // Один RSS-фід (як запасний варіант):
  RSS_URL: process.env.RSS_URL || defaultFeeds[0].url,

  // Кілька RSS-фідів. Якщо не вказано — використовуються дефолтні новинні джерела.
  // Наприклад:
  // RSS_FEEDS: [{ id: "news", url: "https://example.com/rss.xml" }, { id: "blog", url: "https://example.com/blog.xml" }]
  RSS_FEEDS: process.env.RSS_FEEDS ? JSON.parse(process.env.RSS_FEEDS) : defaultFeeds,

  // Інтервал перевірки у мілісекундах
  CHECK_INTERVAL_MS: Number(process.env.CHECK_INTERVAL_MS || 60 * 1000),

  // Кількість повторних спроб при помилці мережі або HTTP 5xx
  RETRY_COUNT: Number(process.env.RETRY_COUNT || 3),

  // Очищати стан при кожному запуску, щоб почати з чистого старту
  CLEAR_STATE_ON_START: process.env.CLEAR_STATE_ON_START !== "false",

  // Часовий фільтр від старту бота. 0 = вимкнений, працює тільки "з моменту запуску".
  RECENT_HOURS: Number(process.env.RECENT_HOURS || 0),
};

module.exports = baseConfig;
