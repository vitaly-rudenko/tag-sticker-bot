const {
  TELEGRAM_BOT_TOKEN,
  LOCALSTACK_ENDPOINT,
  DYNAMODB_QUEUED_STICKERS_TABLE,
  DYNAMODB_TAGS_TABLE,
  DYNAMODB_USER_SESSIONS_TABLE,
  IS_LOCAL_TESTING,
} = process.env

export const localstackEndpoint = LOCALSTACK_ENDPOINT
export const telegramBotToken = requireEnv(TELEGRAM_BOT_TOKEN)
export const dynamodbQueuedStickersTable = requireEnv(DYNAMODB_QUEUED_STICKERS_TABLE)
export const dynamodbTagsTable = requireEnv(DYNAMODB_TAGS_TABLE)
export const dynamodbUserSessionsTable = requireEnv(DYNAMODB_USER_SESSIONS_TABLE)
export const isLocalTesting = IS_LOCAL_TESTING === 'true'

/**
 * @param {string | undefined} value
 * @returns {string}
 */
function requireEnv(value) {
  if (value === undefined) {
    throw Error('Missing environment variable')
  }

  return value
}
