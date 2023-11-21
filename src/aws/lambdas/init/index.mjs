import { Telegraf } from 'telegraf'
import { requireEnv, telegramBotToken, webhookSecretToken } from '../../env.js'

export async function handler() {
  try {
    const webhookUrl = requireEnv(process.env.WEBHOOK_URL)
  
    const bot = new Telegraf(telegramBotToken)
    await bot.telegram.setWebhook(webhookUrl, {
      secret_token: webhookSecretToken
    })

    await bot.telegram.setMyCommands([
      { command: 'start',  description: 'Get help' },
    ])

    return { statusCode: 200 }
  } catch (error) {
    console.error(error)
    return { statusCode: 500 }
  }
}
