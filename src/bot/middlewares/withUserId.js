/**
 * @param {import('telegraf').Context} context 
 * @param {Function} next 
 * @returns 
 */
export function withUserId(context, next) {
  if (!context.from || context.from.is_bot) return
  context.state.userId = String(context.from.id)
  return next()
}