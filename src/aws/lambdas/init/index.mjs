import { Telegraf } from 'telegraf'
import { telegramBotToken, webhookSecretToken, webhookUrl } from './init-env.mjs'
import { logger } from '../../../logger.js'

export async function handler() {
  try {
    if (!webhookUrl)
      throw new Error('Webhook URL is not provided')
    if (!webhookSecretToken)
      throw new Error('Webhook secret token is not provided')

    const bot = new Telegraf(telegramBotToken)
    await bot.telegram.setWebhook(webhookUrl, {
      secret_token: webhookSecretToken
    })

    await bot.telegram.setMyCommands([
      { command: 'start',  description: 'Get help' },
    ])

    return { statusCode: 200 }
  } catch (error) {
    logger.error({ error })
    return { statusCode: 500 }
  }
}
