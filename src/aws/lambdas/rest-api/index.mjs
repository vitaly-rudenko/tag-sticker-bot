import { Telegraf } from 'telegraf'
import safeCompare from 'safe-compare'
import { createBot } from '../../../bot/createBot.js'
import { dynamodbUserSessionsTable, dynamodbTagsTable, telegramBotToken, debugChatId, webhookSecretToken, dynamodbFavoritesTable } from '../../../env.js'
import { DynamodbTagRepository } from '../../../tags/DynamodbTagRepository.js'
import { DynamodbUserSessionRepository } from '../../../users/DynamodbUserSessionRepository.js'
import { createDynamodbClient } from '../../../utils/createDynamodbClient.js'
import { TelegramErrorLogger } from '../../../bot/TelegramErrorLogger.js'
import { DynamodbFavoriteRepository } from '../../../favorites/DynamodbFavoriteRepository.js'
import { logger } from '../../../logger.js'

const WEBHOOK_SECRET_TOKEN_HEADER = 'X-Telegram-Bot-Api-Secret-Token'

// https://docs.aws.amazon.com/lambda/latest/dg/services-apigateway.html#apigateway-example-event
/** @param {{ path: string, httpMethod: string, headers: Record<string, string>, body: string }} event */
export async function handler(event) {
  try {
    if (event.path === '/health' && event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'ok' }),
      }
    }

    if (event.path === '/debug' && event.httpMethod === 'GET') {
      const bot = new Telegraf(telegramBotToken)

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          me: await bot.telegram.getMe(),
          webhookInfo: await bot.telegram.getWebhookInfo(),
        }),
      }
    }

    if (event.path === '/webhook' && event.httpMethod === 'POST') {
      if (!webhookSecretToken) {
        throw new Error('Webhook secret token is not provided')
      }

      const secretToken = event.headers?.[WEBHOOK_SECRET_TOKEN_HEADER]
      if (!safeCompare(secretToken, webhookSecretToken)) {
        return {
          statusCode: 401,
        }
      }

      const update = JSON.parse(event.body)

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

      try {
        await bot.handleUpdate(update)
      } catch (error) {
        if (debugChatId) {
          new TelegramErrorLogger({ telegram: bot.telegram, debugChatId })
            .log(
              error instanceof Error ? error : new Error(`Unexpected error: ${error}`),
              'Could not handle bot update',
              update
            )
        }

        throw error
      }

      return {
        statusCode: 200,
      }
    }

    return {
      statusCode: 404,
    }
  } catch (error) {
    logger.error({ error })
    return {
      statusCode: 500,
    }
  }
}
