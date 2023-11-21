import * as env from '../../env.js'
import { escapeMd } from '../../utils/escapeMd.js'

/** @typedef {import('telegraf').Context} Context */

/**
 * @param {{
 *   bot: import('telegraf').Telegraf
 * }} input
 */
export function useCommonFlow({ bot }) {

  /** @param {Context} context */
  async function start(context) {
    bot.botInfo ??= await bot.telegram.getMe()

    await context.reply([
      '👋 Hi, just send a sticker to tag\\.',
      '',
      '📝 Tags may contain whitespace and numbers, for example: *__cute distorted cat__*\\.',
      `🔍 After tagging a sticker, type "\`@${escapeMd(bot.botInfo.username)} cat\`" to quickly find it\\.`,
      '',
      `💡 To search by your own tags, add *\\!* to the query: "\`@${escapeMd(bot.botInfo.username)} !cat\`"`
    ].join('\n'), { parse_mode: 'MarkdownV2' })
  }

  /** @param {Context} context */
  async function version(context) {
    await context.reply(`Version: ${env.version ?? 'unknown'}`)
  }

  return {
    start,
    version,
  }
}