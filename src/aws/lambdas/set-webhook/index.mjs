import { Telegraf } from 'telegraf'
import { requireEnv, telegramBotToken } from '../../env.js'

export async function handler() {
  try {
    const webhookUrl = requireEnv(process.env.WEBHOOK_URL)
  
    const bot = new Telegraf(telegramBotToken)
    await bot.telegram.setWebhook(webhookUrl, {
      secret_token: process.env.WEBHOOK_SECRET_TOKEN
    })

    return { statusCode: 200 }
  } catch (error) {
    console.error(error)
    return { statusCode: 500 }
  }
}
