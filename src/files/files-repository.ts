import { type Client } from 'pg'
import { type FileType } from './file-type.ts';

export class FilesRepository {
  #client: Client

  constructor(input: { client: Client }) {
    this.#client = input.client
  }

  async upsert(input: {
    fileUniqueId: string
    fileId: string
    fileType: FileType
    setName: string | undefined
    emoji: string | undefined
    mimeType: string | undefined
    data: object
    fileName: string | undefined
    isVideo: boolean
    isAnimated: boolean
  }): Promise<void> {
    const { fileUniqueId, fileId, fileType, setName, emoji, mimeType, data, fileName, isVideo, isAnimated } = input

    await this.#client.query(
      `INSERT INTO files (file_unique_id, file_id, file_type, set_name, emoji, mime_type, data, file_name, is_video, is_animated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (file_unique_id) DO UPDATE
       SET file_id = $2
         , file_type = $3
         , set_name = $4
         , emoji = $5
         , mime_type = $6
         , data = $7
         , file_name = $8
         , is_video = $9
         , is_animated = $10;`,
      [fileUniqueId, fileId, fileType, setName, emoji, mimeType, data, fileName, isVideo, isAnimated],
    )
  }

  async deleteAllByFileId(input: { fileId: string }): Promise<void> {
    const { fileId } = input

    await this.#client.query(
      `DELETE FROM files
       WHERE file_id = $1;`,
      [fileId]
    )
  }
}