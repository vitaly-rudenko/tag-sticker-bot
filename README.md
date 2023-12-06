# Tag Sticker Bot

![Screenshot](docs/screenshot.png)

## Description

This bot enables users to tag stickers, perform quick searches, and mark favorites directly within Telegram.

Features:
- 📝 Tag stickers (up to 10 tags per sticker)
- 🔍 Search stickers by your tags or all tags (inline query)
- 🖇 Quickly tag all stickers in a sticker set
- ❤️ Mark stickers as favorites for quick access

## Stack & tools
- Node.JS, AWS DynamoDB
- AWS CDK, Telegraf
- Rollup, Jest
- Telegram Bot API

## Commands
- `npm run setup-local` – set up local DynamoDB tables
- `npm run dev` – run bot locally
- `npm run deploy:prod` – deploy to AWS

## Documentation
Find detailed information about the project's architecture in [docs/architecture.md](docs/architecture.md).
