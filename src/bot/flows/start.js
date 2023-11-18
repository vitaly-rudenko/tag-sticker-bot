/** @typedef {import('telegraf').Context} Context */

export function useStartFlow() {
  /** @param {Context} context */
  async function start(context) {
    await context.reply('👋 Hi, just send a sticker to continue.')
  }

  return {
    start
  }
}