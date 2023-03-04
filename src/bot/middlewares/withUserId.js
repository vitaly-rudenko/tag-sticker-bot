export function withUserId(context, next) {
  if (!context.from || context.from.is_bot) return
  context.state.userId = context.from.id
  return next()
}