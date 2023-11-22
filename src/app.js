import { createBot } from './bot/createBot.js'
import { DynamodbTagRepository } from './tags/DynamodbTagRepository.js'
import { dynamodbTagsTable, dynamodbUserSessionsTable, telegramBotToken } from './env.js'
import { createDynamodbClient } from './utils/createDynamodbClient.js'
import { DynamodbUserSessionRepository } from './users/DynamodbUserSessionRepository.js'
import { TagRepositoryStickerFinder } from './TagRepositoryStickerFinder.js'

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

  const stickerFinder = new TagRepositoryStickerFinder({ tagRepository })

  const bot = await createBot({
    telegramBotToken,
    userSessionRepository,
    tagRepository,
    stickerFinder,
  })

  bot.launch().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

start()
  .then(() => console.log('Started!'))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
