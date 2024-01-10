// TODO: introduce proper (compact!) logging solution
/** @type {{ [level: string]: (context: object, message?: string) => void }} */
export const logger = {
  debug: (context, message) => console.log('[DEBUG]', context, message),
  info: (context, message) => console.log('[INFO]', context, message),
  warn: (context, message) => console.log('[WARN]', context, message),
  error: (context, message) => console.log('[ERROR]', context, message),
}
