import { type Client } from 'pg'
import { type FileType } from './file-type.ts';

export class FilesRepository {
  #client: Client

  constructor(input: { client: Client }) {
    this.#client = input.client
  }

  async upsert(input: { fileUniqueId: string; fileId: string; fileType: FileType; setName?: string; mimeType?: string; data: object }): Promise<void> {
    const { fileUniqueId, fileId, fileType, setName, mimeType, data } = input

    await this.#client.query(
      `INSERT INTO files (file_unique_id, file_id, file_type, set_name, mime_type, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (file_unique_id) DO UPDATE
       SET file_type = $2
         , file_id = $3
         , set_name = $4
         , mime_type = $5
         , data = $6;`,
      [fileUniqueId, fileId, fileType, setName, mimeType, data],
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