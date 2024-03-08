import type { Telegram, Context } from 'telegraf'

export type File = {
  set_name?: string;
  mime_type?: string;
  file_id: string;
  file_unique_id: string;
}

export type UserSessionContext = {
  isPrivate: boolean
  phase?: string
  file?: File
  fileMessageId?: number
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
    file: File
    authorUserId: string
    values: string[]
    isPrivate: boolean
  }): Promise<void>
  search(input: {
    query: string
    limit: number
    authorUserId: string
    ownedOnly: boolean
  }): Promise<{
    includesOwnedFiles: boolean
    searchResults: File[]
  }>
  queryStatus(input: {
    stickerSetName: string
    authorUserId: string
    ownedOnly: boolean
  }): Promise<Set<string>>
}

export type proceedTagging = (context: Context, input: {
  userId: string
  isPrivate: boolean
  queue?: Queue
  file?: File
}) => Promise<void>

export interface FavoriteRepository {
  mark(input: {
    userId: string
    file: File
  }): Promise<void>
  unmark(input: {
    userId: string
    fileUniqueId: string
  }): Promise<void>
  query(input: {
    userId: string
    limit: number
    fromFileUniqueId?: string
  }): Promise<File[]>
  isMarked(input: {
    userId: string
    fileUniqueId: string
  }): Promise<boolean>
}
