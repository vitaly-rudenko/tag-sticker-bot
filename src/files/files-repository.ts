import { type Client } from 'pg'
import { type FileType } from './file-type.ts';

export class FilesRepository {
  #client: Client

  constructor(input: { client: Client }) {
    this.#client = input.client
  }

  async upsert(input: { fileUniqueId: string; fileType: FileType; data: object }): Promise<void> {
    const { fileUniqueId, fileType, data } = input

    await this.#client.query(
      `INSERT INTO files (file_unique_id, file_type, data)
       VALUES ($1, $2, $3)
       ON CONFLICT (file_unique_id) DO UPDATE
       SET file_type = $2
         , data = $3;`,
      [fileUniqueId, fileType, data],
    )
  }
}