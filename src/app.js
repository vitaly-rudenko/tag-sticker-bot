import { createBot } from './bot/createBot.js'
import { DynamodbTagRepository } from './tags/DynamodbTagRepository.js'
import { dynamodbFavoritesTable, dynamodbTagsTable, dynamodbUserSessionsTable, telegramBotToken } from './env.js'
import { createDynamodbClient } from './utils/createDynamodbClient.js'
import { DynamodbUserSessionRepository } from './users/DynamodbUserSessionRepository.js'
import { DynamodbFavoriteRepository } from './favorites/DynamodbFavoriteRepository.js'
import { logger } from './logger.js'

async function start() {
  const dynamodbClient = createDynamodbClient()

  const userSessionRepository = new DynamodbUserSessionRepository({
    dynamodbClient,
    tableName: dynamodbUserSessionsTable,
  })

  const tagRepository = new DynamodbTagRepository({
    dynamodbClient,
    tableName: dynamodbTagsTable,
  })

  const favoriteRepository = new DynamodbFavoriteRepository({
    dynamodbClient,
    tableName: dynamodbFavoritesTable,
  })

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
  .then(() => logger.info('Started!'))
  .catch((error) => {
    logger.error({ error })
    process.exit(1)
  })
