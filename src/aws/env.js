const {
  TELEGRAM_BOT_TOKEN,
  ENVIRONMENT,
} = process.env

export const telegramBotToken = requireEnv(TELEGRAM_BOT_TOKEN)
export const environment = requireEnv(ENVIRONMENT)

if (!['dev', 'prod'].includes(environment)) {
  throw new Error(`Invalid environment value: ${environment}`)
}

/**
 * @param {string | undefined} value
 * @returns {string}
 */
export function requireEnv(value) {
  if (value === undefined) {
    throw Error('Missing environment variable')
  }

  return value
}
