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
  }): Promise<void> {
    const { fileUniqueId, fileId, fileType, setName, emoji, mimeType, data, fileName } = input

    await this.#client.query(
      `INSERT INTO files (file_unique_id, file_id, file_type, set_name, emoji, mime_type, data, file_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (file_unique_id) DO UPDATE
       SET file_id = $2
         , file_type = $3
         , set_name = $4
         , emoji = $5
         , mime_type = $6
         , data = $7
         , file_name = $8;`,
      [fileUniqueId, fileId, fileType, setName, emoji, mimeType, data, fileName],
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