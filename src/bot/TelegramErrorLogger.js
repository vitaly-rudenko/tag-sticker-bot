export class TelegramErrorLogger {
  /**
   * @param {{
   *   telegram: import('telegraf').Telegram,
   *   debugChatId: string,
   * }} param0 
   */
  constructor({ telegram, debugChatId }) {
    this._debugChatId = debugChatId
    this._telegram = telegram
  }

  /**
   * @param {Error} error 
   * @param {string} message 
   * @param {any} context 
   */
  log(error, message = 'Unexpected error', context = {}) {
    this._telegram.sendMessage(
      this._debugChatId,
      [
        `❗️ ${new Date().toISOString().replace('T', ' ').replace('Z', '')} ${message}:`,
        String(error.stack) || `${error.name}: ${error.message}`,
        `Context:`,
        `${JSON.stringify(context)}`
      ].join('\n')
    ).catch(error => console.error({ error }, 'Could not log to the debug chat'))
  }
}
