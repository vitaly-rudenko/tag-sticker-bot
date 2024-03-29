const {
  TELEGRAM_BOT_TOKEN,
  WEBHOOK_SECRET_TOKEN,
  INLINE_QUERY_CACHE_TIME_S,
  ENVIRONMENT,
  DEBUG_CHAT_ID,
} = process.env

export const telegramBotToken = requireEnv(TELEGRAM_BOT_TOKEN)
export const webhookSecretToken = requireEnv(WEBHOOK_SECRET_TOKEN)
export const inlineQueryCacheTimeS = requireEnv(INLINE_QUERY_CACHE_TIME_S)
export const debugChatId = requireEnv(DEBUG_CHAT_ID)
export const environment = requireEnv(ENVIRONMENT)

if (!['dev', 'prod'].includes(environment)) {
  throw new Error(`Invalid environment value: ${environment}`)
}

/**
 * @param {string | undefined} value
 * @returns {string}
 */
export function requireEnv(value) {
  if (!value) {
    throw Error('Missing environment variable')
  }

  return value
}
