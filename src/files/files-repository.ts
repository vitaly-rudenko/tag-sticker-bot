import { type Client } from 'pg'
import { type FileType } from './file-type.ts';

export class FilesRepository {
  #client: Client

  constructor(input: { client: Client }) {
    this.#client = input.client
  }

  async upsert(input: { fileUniqueId: string; fileType: FileType; setName?: string; mimeType?: string; data: object }): Promise<void> {
    const { fileUniqueId, fileType, setName, mimeType, data } = input

    await this.#client.query(
      `INSERT INTO files (file_unique_id, file_type, set_name, mime_type, data)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (file_unique_id) DO UPDATE
       SET file_type = $2
         , set_name = $3
         , mime_type = $4
         , data = $5;`,
      [fileUniqueId, fileType, setName, mimeType, data],
    )
  }
}