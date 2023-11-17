import { config } from 'dotenv'
import z from 'zod'

config()

const {
  TELEGRAM_BOT_TOKEN,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  LOCALSTACK_ENDPOINT,
  DYNAMODB_QUEUED_STICKERS_TABLE,
  DYNAMODB_TAGS_TABLE,
  DYNAMODB_USER_SESSIONS_TABLE,
  IS_LOCAL_TESTING,
} = z.object({
  TELEGRAM_BOT_TOKEN: z.string(),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  LOCALSTACK_ENDPOINT: z.string(),
  DYNAMODB_QUEUED_STICKERS_TABLE: z.string(),
  DYNAMODB_TAGS_TABLE: z.string(),
  DYNAMODB_USER_SESSIONS_TABLE: z.string(),
  IS_LOCAL_TESTING: z.enum(['true', 'false']),
}).parse(process.env)

export const telegramBotToken = TELEGRAM_BOT_TOKEN
export const awsAccessKeyId = AWS_ACCESS_KEY_ID
export const awsSecretAccessKey = AWS_SECRET_ACCESS_KEY
export const localstackEndpoint = LOCALSTACK_ENDPOINT
export const dynamodbQueuedStickersTable = DYNAMODB_QUEUED_STICKERS_TABLE
export const dynamodbTagsTable = DYNAMODB_TAGS_TABLE
export const dynamodbUserSessionsTable = DYNAMODB_USER_SESSIONS_TABLE
export const isLocalTesting = IS_LOCAL_TESTING === 'true'
