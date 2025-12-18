# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tag Sticker Bot is a Telegram bot that enables users to tag stickers, GIFs, photos, videos, and video messages, perform quick searches, and mark favorites directly within Telegram. Features include:
- Tag stickers & GIFs (up to 10 tags per file)
- Create private tags (only you can search) or public tags
- Search files by tags using inline queries
- Quickly tag all stickers in a sticker set
- Mark files as favorites for quick access
- Export tags and favorites as CSV
- Export tags and favorites as ZIP (including media) - work in progress

## Development Commands

### Running the Application
- `npm start` - Start the bot with pino-pretty logging
- `npm run dev` - Start in development mode with nodemon auto-reload

### Testing & Linting
- `npm test` - Run tests using Node's built-in test runner
- `npm run lint` - Type-check using TypeScript compiler (tsc)

### Database Migrations
- `npm run umzug` - Run migrations CLI (production)
- `npm run umzug:test` - Run migrations CLI (test environment)

### Scripts
- `npm run script:populate` - Run the populate script

### Database Setup
Use docker compose to start PostgreSQL:
```bash
docker compose up -d tsb_postgres
```

Then run migrations:
```bash
npm run umzug up
```

## Architecture

### Technology Stack
- **Runtime**: Node.js with `--experimental-strip-types` (native TypeScript support)
- **Bot Framework**: Telegraf for Telegram Bot API
- **Database**: PostgreSQL with `pg` driver
- **Validation**: Zod schemas
- **Logging**: Pino
- **Migrations**: Umzug with custom PostgreSQL storage
- **API**: Express with JWT authentication

### Project Structure
```
src/
├── app.ts                  # Main entry point: bot and Express server
├── bot/                    # (no files yet - handlers are in app.ts)
├── api/                    # (no files yet - routes are in app.ts)
├── common/
│   └── taggable-file.ts   # Core type for all taggable files
├── tags/
│   ├── tags-repository.ts # Tag database operations
│   ├── tag.ts             # Tag type and schema
│   └── visibility.ts      # Tag visibility (public/private)
├── favorites/
│   └── favorites-repository.ts
├── files/
│   ├── files-repository.ts
│   └── file-type.ts
├── sticker-sets/
│   └── sticker-sets-repository.ts
├── user-sessions/
│   ├── user-session.ts
│   └── user-sessions-repository.ts
├── umzug/
│   ├── umzug.ts           # Umzug configuration
│   ├── cli.ts             # Migrations CLI
│   └── postgres-storage.ts # Custom storage adapter
└── utils/
    ├── escape-md.ts
    ├── exhaust.ts
    ├── is-defined.ts
    ├── require-non-nullable.ts
    └── logging/
        └── logger.ts

migrations/                 # Database migrations (*.cjs files)
web/
└── index.html             # Export UI (work in progress)
```

### Core Application Flow (app.ts)

**Bot Initialization**:
1. PostgreSQL client connects
2. Repositories instantiated (tags, favorites, files, sticker-sets, user-sessions)
3. Telegraf bot initialized with token from env
4. Command handlers and message handlers registered

**Tagging Flow**:
1. User sends a file (sticker/GIF/photo/video)
2. Bot stores file metadata in `files` table
3. Bot sends prompt with inline keyboard: "Tag file", "Favorite", "Cancel"
4. If user clicks "Tag file":
   - Bot asks for tag text with visibility buttons (public/private)
   - User sends text message
   - Tag stored in `tags` table with visibility setting
5. User session stored in `user_sessions` table (as JSONB) to track state

**Search Flow** (Inline Queries):
1. User types `@bot_username query` in any chat
2. Bot searches `tags` table using ILIKE pattern matching
3. For owned-only search: user prefixes query with `!` (e.g., `!cat`)
4. Empty query returns favorites
5. Results returned as inline query results (stickers/GIFs/photos/videos)

**Export Flow**:
1. CSV export: `/export_csv` command generates CSV with all tags and favorites
2. ZIP export (work in progress): `/export_zip` generates JWT token, user opens web UI to download

### Database Schema (key tables)

**tags**: Stores user-created tags for files
- Columns: author_user_id, file_unique_id, visibility (public/private), value, file_id, file_type, set_name, emoji, mime_type, file_name, created_at
- Unique constraint: (author_user_id, file_unique_id)
- Uses pg_trgm extension for fuzzy search

**favorites**: User's favorite files
- Columns: user_id, file_unique_id, file_id, file_type, set_name, emoji, mime_type, file_name
- Unique constraint: (user_id, file_unique_id)

**files**: Metadata cache for all files that have been tagged
- Columns: file_unique_id (PK), file_id, file_type, set_name, emoji, mime_type, data (JSONB), file_name

**user_sessions**: Stores user state during tagging flow
- Columns: user_id (PK), data (JSONB)

**sticker_sets**: Metadata for sticker sets
- Columns: set_name (PK), title, data (JSONB)

### Repository Pattern

All repositories follow the same pattern:
- Accept `Client` from `pg` in constructor
- Use `#client` private field to store client
- Methods return domain types (Tag, TaggableFile, etc.) not raw DB rows
- Use Zod schemas to validate and parse data

### Type System

**TaggableFile**: Discriminated union type for all supported file types
- `fileType: 'sticker' | 'animation' | 'photo' | 'video' | 'video_note'`
- Each type has type-specific fields (e.g., sticker has `setName`, animation has `mimeType`)

**Visibility**: `'public' | 'private'`

**FileType**: `'sticker' | 'animation' | 'photo' | 'video' | 'video_note'`

### Environment Variables

Required (see .env.example):
- `TELEGRAM_BOT_TOKEN`: Telegram Bot API token
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret for JWT token generation (export feature)
- `APP_URL`: Public URL for export web UI
- `STAGE`: `"local"` or `"production"`
- `PORT`: Express server port (default 3000)
- `LOG_LEVEL`: Pino log level (default "info")
- `DEBUG_CHAT_ID`: Optional chat ID for debug messages

### Express API (work in progress)

Endpoints require JWT authentication via `token` header:
- `GET /tags` - List user's tags
- `GET /favorites` - List user's favorites
- `GET /files/:fileId/download` - Download file (proxies through Telegram API)
- `GET /` - Serve export UI (web/index.html)

### Special Considerations

1. **Node.js TypeScript**: Uses `--experimental-strip-types` for native TS support
   - No build step required
   - Import paths must include `.ts` extension
   - `package.json` has `"type": "module"`

2. **Database Migrations**:
   - Located in `migrations/` directory (not `src/umzug/migrations/`)
   - Written as CommonJS (*.cjs) files
   - Use `npm run umzug up` to run migrations
   - Use `npm run umzug down` to rollback

3. **User Sessions**: Stored as JSONB in PostgreSQL, not in-memory
   - Allows bot to scale horizontally
   - Session structure is type-safe via `user-session.ts`

4. **File Validation**: Invalid files are detected and cleaned up
   - When inline query fails with `DOCUMENT_INVALID`, bot runs background cleanup
   - Checks each file with `bot.telegram.getFile()`
   - Deletes invalid files from all tables

5. **Search Algorithm**: Uses two-phase matching
   - Fuzzy match: query with spaces replaced by `%` wildcards
   - Exact match: query with original spaces
   - Results sorted by: owner files first, exact matches second, then by date

6. **Logging**: Pino structured logging
   - Logs include context (err, message, requesterUserId, etc.)
   - Pretty-printed in development with pino-pretty
