import * as env from '../../env.js'

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
      '👋 Hi, just send a sticker to continue\\.',
      '',
      `🔍 After tagging a sticker, type \`@${bot.botInfo.username} <tag>\` to quickly find it\\.`
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