import { config } from 'dotenv'
import { createBot } from './bot/createBot.js'
import { InMemoryUserSessionRepository } from './users/InMemoryUserSessionRepository.js'
import { DynamodbQueuedStickerRepository } from './queue/DynamodbQueuedStickerRepository.js'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamodbTagRepository } from './tags/DynamodbTagRepository.js'

config()

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN ?? ''

async function start() {
  const dynamodbClient = new DynamoDBClient({
    endpoint: process.env.LOCALSTACK_ENDPOINT
  })

  const userSessionRepository = new InMemoryUserSessionRepository()
  const queuedStickerRepository = new DynamodbQueuedStickerRepository({
    dynamodbClient,
    tableName: 'queued-stickers',
  })
  const tagRepository = new DynamodbTagRepository({
    dynamodbClient,
    tableName: 'tags',
  })

  const bot = await createBot({
    telegramBotToken,
    queuedStickerRepository,
    userSessionRepository,
    tagRepository,
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
