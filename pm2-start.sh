#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p logs
npm install
npx pm2 start ecosystem.config.js
npx pm2 save

echo "\n✅ Bot launched in background with PM2."
echo "Check status: npx pm2 status"
echo "Logs: npx pm2 logs rss-telegram-bot"
