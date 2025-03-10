const {
  VERSION,
  TELEGRAM_BOT_TOKEN,
  INLINE_QUERY_CACHE_TIME_S,
  DEBUG_CHAT_ID,
  DATABASE_URL,
} = process.env

export const version = VERSION
export const telegramBotToken = requireEnv(TELEGRAM_BOT_TOKEN)
export const inlineQueryCacheTimeS = Number(requireEnv(INLINE_QUERY_CACHE_TIME_S))
export const debugChatId = DEBUG_CHAT_ID

export const env = {
  DATABASE_URL: requireEnv(DATABASE_URL),
}

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
