import * as fs from 'fs'
import * as path from 'path'
import { escapeMd } from '../../utils/escapeMd.js'

/** @typedef {import('telegraf').Context} Context */

/** @returns {string} */
function getAppVersion() {
  const packageJsonPath = path.join(process.cwd(), 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: 'utf-8' }))
  return packageJson.version
}

const appVersion = getAppVersion()

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
      '👋 Hi, just send a sticker or GIF to tag or mark as favorite\\.',
      '',
      '*Tagging*',
      '📝 Tags may contain whitespace and numbers, for example: *__funny cat__*\\.',
      `🔍 After tagging a file, type "\`@${escapeMd(bot.botInfo.username)} cat\`" to quickly find it\\.`,
      `💡 To search by your own tags, add *\\!* to the query: "\`@${escapeMd(bot.botInfo.username)} !cat\`"`,
      '',
      '*Favorites*',
      '❤️ You can also mark a file as your favorite\\.',
      `🔍 Quickly get your favorite files by typing "\`@${escapeMd(bot.botInfo.username)}\` "\\.`,
      '',
      '*Builder*',
      '🖼 You can also create a new sticker by sending a photo or a file\\.',
    ].join('\n'), { parse_mode: 'MarkdownV2' })
  }

  /** @param {Context} context */
  async function version(context) {
    await context.reply(`Version: ${appVersion ?? 'unknown'}`)
  }

  return {
    start,
    version,
  }
}