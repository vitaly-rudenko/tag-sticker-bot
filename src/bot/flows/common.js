import * as env from '../../env.js'

/** @typedef {import('telegraf').Context} Context */

export function useCommonFlow() {
  /** @param {Context} context */
  async function start(context) {
    await context.reply('👋 Hi, just send a sticker to continue.')
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