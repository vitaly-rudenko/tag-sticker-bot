const {
  VERSION,
  TELEGRAM_BOT_TOKEN,
  WEBHOOK_SECRET_TOKEN,
  INLINE_QUERY_CACHE_TIME_S,
  LOCALSTACK_ENDPOINT,
  DYNAMODB_TAGS_TABLE,
  DYNAMODB_USER_SESSIONS_TABLE,
  DEBUG_CHAT_ID,
} = process.env

export const version = VERSION
export const localstackEndpoint = LOCALSTACK_ENDPOINT
export const telegramBotToken = requireEnv(TELEGRAM_BOT_TOKEN)
export const webhookSecretToken = WEBHOOK_SECRET_TOKEN
export const inlineQueryCacheTimeS = Number(requireEnv(INLINE_QUERY_CACHE_TIME_S))
export const dynamodbTagsTable = requireEnv(DYNAMODB_TAGS_TABLE)
export const dynamodbUserSessionsTable = requireEnv(DYNAMODB_USER_SESSIONS_TABLE)
export const debugChatId = DEBUG_CHAT_ID

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
