/**
 * 
 * @param {import('telegraf').Telegram} telegram 
 * @param {number | string} chatId 
 * @param {(number | undefined | (number | undefined)[])[]} messageIds 
 */
export async function deleteMessages(telegram, chatId, messageIds) {
  /** @type {number[]} */
  // @ts-ignore
  const filteredMessageIds = messageIds.flat().filter(Boolean)
  if (filteredMessageIds.length === 0) return

  await Promise.allSettled(
    filteredMessageIds.map(messageId => telegram.deleteMessage(chatId, messageId))
  )
}
