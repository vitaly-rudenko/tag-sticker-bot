import pino from 'pino'
import build from 'pino-abstract-transport'
import { Telegraf } from 'telegraf'
import { escapeMd } from '../escape-md.ts'

export default async function (input: { telegramBotToken: string, debugChatId: number }) {
  const { telegramBotToken, debugChatId } = input

  const bot = new Telegraf(telegramBotToken)
  const botInfo = await bot.telegram.getMe()

  return build(async function (stream) {
    for await (let log of stream) {
      const { level, msg, time, pid, hostname, ...context } = log

      try {
        const levelLabel = pino.levels.labels[level] ?? 'info'

        const message = [
          `⚠️ *${escapeMd(levelLabel.toUpperCase())}*: ${escapeMd(msg.slice(0, 500))}`,
          `🤖 ${escapeMd(`@${botInfo.username}`)}`,
          `📆 ${escapeMd(new Date(time).toISOString())}`,
          Object.keys(context).length > 0 && `\`\`\`json
          ${escapeMd(JSON.stringify(context, null, 2).slice(0, 3000))}
          \`\`\``,
        ].filter(Boolean).join('\n')

        await bot.telegram.sendMessage(debugChatId, message, { parse_mode: 'MarkdownV2' })
      } catch (err) {
        if (err?.code !== 429) {
          console.warn('Could not send log to Telegram:', err)
        }
      }
    }
  })
}
