import { Telegraf } from 'telegraf'
import { requireEnv, telegramBotToken } from '../../env.js'

export async function handler() {
  try {
    const webhookUrl = requireEnv(process.env.WEBHOOK_URL)
  
    const bot = new Telegraf(telegramBotToken)
    await bot.telegram.setWebhook(webhookUrl)

    return { statusCode: 200 }
  } catch (error) {
    console.error(error)
    return { statusCode: 500 }
  }
}
