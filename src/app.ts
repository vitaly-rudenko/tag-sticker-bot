import pg from 'pg'
import { createBot } from './bot/createBot.js'
import { logger } from './logger.js'
import { PostgresUserSessionRepository } from './users/PostgresUserSessionRepository.js'
import { PostgresTagRepository } from './tags/PostgresTagRepository.js'
import { PostgresFavoriteRepository } from './favorites/PostgresFavoriteRepository.js'
import { env, telegramBotToken } from './env.js'

async function start() {
  const postgresClient = new pg.Client(env.DATABASE_URL)
  await postgresClient.connect()

  const userSessionRepository = new PostgresUserSessionRepository({ postgresClient })
  const tagRepository = new PostgresTagRepository({ postgresClient })
  const favoriteRepository = new PostgresFavoriteRepository({ postgresClient })

  const bot = await createBot({
    telegramBotToken,
    userSessionRepository,
    favoriteRepository,
    tagRepository,
  })

  bot.launch().catch((error) => {
    logger.error({ error })
    process.exit(1)
  })
}

start()
  .then(() => logger.info({}, 'Started!'))
  .catch((error) => {
    logger.error({ error })
    process.exit(1)
  })
