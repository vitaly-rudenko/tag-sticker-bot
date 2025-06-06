import path from 'path'
import { pino } from 'pino'
import { fileURLToPath } from 'url'
import { requireNonNullable } from '../require-non-nullable.ts'

const telegramBotToken = requireNonNullable(process.env.TELEGRAM_BOT_TOKEN)
const debugChatId = requireNonNullable(process.env.DEBUG_CHAT_ID)
const logLevel = requireNonNullable(process.env.LOG_LEVEL)

console.log('Log level:', logLevel)

export const logger = pino({
  level: logLevel,
}, pino.multistream([
  { stream: process.stdout },
  {
    level: 'warn',
    stream: pino.transport({
      target: path.join(path.dirname(fileURLToPath(import.meta.url)), './pino-telegram-transport.mjs'),
      options: {
        telegramBotToken,
        debugChatId,
      }
    })
  }
]))
