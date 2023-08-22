export type Sticker = {
  setName: string
  fileUniqueId: string
  fileId: string
}

export type Tag = {
  sticker: Sticker
  authorUserId: string
  value?: string
}

export type QueuedSticker = {
  sticker: Sticker
  userId: string
}

export interface QueuedStickerRepository {
  enqueue(input: { userId: string; stickers: Sticker[] }): Promise<void>
  take(userId: string): Promise<QueuedSticker | undefined>
  clear(userId: string): Promise<void>
  count(userId: string): Promise<number>
}

export type UserSessionContext = {
  sticker?: Sticker
  stickerMessageId?: number
}

export interface UserSessionRepository {
  amendContext(userId: string, newContext: UserSessionContext): Promise<void>
  clearContext(userId: string): Promise<void>
  getContext(userId: string): Promise<UserSessionContext>
}

export interface TagRepository {
  storeTag(tag: Tag): Promise<void>
  getTaggedStickers(stickerFileUniqueIds: string[]): Promise<Sticker[]>
  queryTagStatus(input: {
    stickerFileUniqueIds: string[];
    authorUserId?: string
  }): Promise<{
    [stickerFileUniqueId: string]: boolean
  }>
}

export interface StickerFinder {
  find(input: { query: string; authorUserId?: string }): Promise<Sticker[]>
}
