import { TagRepositoryStickerFinder } from '../../TagRepositoryStickerFinder.js'
import { createBot } from '../../bot/createBot.js'
import { dynamodbUserSessionsTable, dynamodbQueuedStickersTable, dynamodbTagsTable, telegramBotToken } from '../../env.js'
import { DynamodbQueuedStickerRepository } from '../../queue/DynamodbQueuedStickerRepository.js'
import { DynamodbTagRepository } from '../../tags/DynamodbTagRepository.js'
import { DynamodbUserSessionRepository } from '../../users/DynamodbUserSessionRepository.js'
import { createDynamodbClient } from '../../utils/createDynamodbClient.js'

// https://docs.aws.amazon.com/lambda/latest/dg/services-apigateway.html#apigateway-example-event
export async function handler(event, context) {
  if (event.path === '/health' && event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      isBase64Encoded: false,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status: 'ok' }),
    }
  }

  if (event.path === '/webhook' && event.httpMethod === 'POST') {
    const dynamodbClient = createDynamodbClient()

    const userSessionRepository = new DynamodbUserSessionRepository({
      dynamodbClient,
      tableName: dynamodbUserSessionsTable,
    })
  
    const queuedStickerRepository = new DynamodbQueuedStickerRepository({
      dynamodbClient,
      tableName: dynamodbQueuedStickersTable,
    })
  
    const tagRepository = new DynamodbTagRepository({
      dynamodbClient,
      tableName: dynamodbTagsTable,
    })
  
    const stickerFinder = new TagRepositoryStickerFinder({ tagRepository })
  
    const bot = await createBot({
      telegramBotToken,
      queuedStickerRepository,
      userSessionRepository,
      tagRepository,
      stickerFinder,
    })

    return {
      statusCode: 200,
      isBase64Encoded: false,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(await bot.telegram.getMe()),
    }
  }

  return {
    statusCode: 404,
    isBase64Encoded: false,
  }
}
