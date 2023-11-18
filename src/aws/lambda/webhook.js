import { TagRepositoryStickerFinder } from '../../TagRepositoryStickerFinder.js'
import { createBot } from '../../bot/createBot.js'
import { dynamodbUserSessionsTable, dynamodbQueuedStickersTable, dynamodbTagsTable, telegramBotToken } from '../../env.js'
import { DynamodbQueuedStickerRepository } from '../../queue/DynamodbQueuedStickerRepository.js'
import { DynamodbTagRepository } from '../../tags/DynamodbTagRepository.js'
import { DynamodbUserSessionRepository } from '../../users/DynamodbUserSessionRepository.js'
import { createDynamodbClient } from '../../utils/createDynamodbClient.js'

/**
 * @param {import('lambda-api').Request} req 
 * @param {import('lambda-api').Response} res 
 * @param {import('lambda-api').NextFunction | undefined} next 
 */
export async function webhook(req, res, next) {
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

  res.status(200).json(bot.botInfo)
}
