import type { Telegram, Context } from 'telegraf'

export type Sticker = Pick<Awaited<ReturnType<Telegram['getStickerSet']>>['stickers'][number], 'set_name' | 'file_id' | 'file_unique_id'>

export type Tag = {
  sticker: Sticker
  authorUserId: string
  value: string
}

export type UserSessionContext = {
  sticker?: Sticker
  stickerMessageId?: number
  relevantMessageIds?: number[]
  queue?: Queue
}

export type Queue = {
  stickerSetName: string
  stickerSetBitmap: string
  index: number
  size: number
}

export interface UserSessionRepository {
  set(userId: string, newContext: UserSessionContext): Promise<void>
  get(userId: string): Promise<UserSessionContext>
  clear(userId: string): Promise<void>
}

export interface TagRepository {
  store(input: {
    authorUserId: string
    sticker: Sticker
    values: string[]
  }): Promise<void>
  search(input: {
    query: string
    limit: number
    authorUserId?: string
  }): Promise<Tag[]>
  queryStatus(input: {
    stickerSetName: string
    authorUserId?: string
  }): Promise<string[]>
}

export interface StickerFinder {
  find(input: { query: string; authorUserId?: string; limit: number }): Promise<Sticker[]>
}

export type proceedTagging = (context: Context, input: {
  userId: string
  queue?: Queue
  sticker?: Sticker
}) => Promise<void>
