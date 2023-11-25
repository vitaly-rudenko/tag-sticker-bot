import type { Telegram, Context } from 'telegraf'

export type Sticker = Pick<
  Awaited<ReturnType<Telegram['getStickerSet']>>['stickers'][number],
  'set_name' | 'file_id' | 'file_unique_id' | 'is_animated' | 'is_video' | 'emoji'
>
export type MinimalStickerWithSet = Pick<Sticker, 'set_name' | 'file_id' | 'file_unique_id'>
export type MinimalSticker = Pick<Sticker, 'file_id' | 'file_unique_id'>

export type UserSessionContext = {
  phase?: string
  sticker?: Sticker
  stickerMessageId?: number
  tagInstructionMessageId?: number
  queue?: Queue
}

export type Queue = {
  position: number
  stickerSetName: string
  stickerSetBitmap: {
    bitmap: string
    length: number
    size: number
  }
}

export interface UserSessionRepository {
  set(userId: string, newContext: UserSessionContext): Promise<void>
  get(userId: string): Promise<UserSessionContext>
  clear(userId: string): Promise<void>
}

export interface TagRepository {
  store(input: {
    authorUserId: string
    sticker: MinimalStickerWithSet
    values: string[]
  }): Promise<void>
  search(input: {
    query: string
    limit: number
    authorUserId?: string
  }): Promise<MinimalSticker[]>
  queryStatus(input: {
    stickerSetName: string
    authorUserId?: string
  }): Promise<Set<string>>
}

export type proceedTagging = (context: Context, input: {
  userId: string
  queue?: Queue
  sticker?: Sticker
}) => Promise<void>

export interface FavoriteRepository {
  mark(input: {
    userId: string
    sticker: Sticker
  }): Promise<void>
  unmark(input: {
    userId: string
    stickerFileUniqueId: string
  }): Promise<void>
  query(input: {
    userId: string
    limit: number
    fromStickerFileUniqueId?: string
  }): Promise<MinimalSticker[]>
  isMarked(input: {
    userId: string
    stickerFileUniqueId: string
  }): Promise<boolean>
}
