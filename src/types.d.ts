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
  relevantMessageIds?: number[]
}

export interface UserSessionRepository {
  amendContext(userId: string, newContext: UserSessionContext): Promise<void>
  clearContext(userId: string): Promise<void>
  getContext(userId: string): Promise<UserSessionContext>
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
