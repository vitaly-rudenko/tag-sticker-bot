const {
  TELEGRAM_BOT_TOKEN,
  WEBHOOK_URL,
  WEBHOOK_SECRET_TOKEN,
} = process.env

export const telegramBotToken = requireEnv(TELEGRAM_BOT_TOKEN)
export const webhookUrl = requireEnv(WEBHOOK_URL)
export const webhookSecretToken = requireEnv(WEBHOOK_SECRET_TOKEN)

/**
 * @param {string | undefined} value
 * @returns {string}
 */
function requireEnv(value) {
  if (!value) {
    throw Error('Missing environment variable')
  }

  return value
}
