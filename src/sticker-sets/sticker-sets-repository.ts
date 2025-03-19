import { Client } from 'pg'

export class StickerSetsRepository {
  #client: Client

  constructor(input: { client: Client }) {
    this.#client = input.client
  }

  async upsert(input: { setName: string; title: string; data: object }): Promise<void> {
    const { setName, title, data } = input

    await this.#client.query(
      `INSERT INTO sticker_sets (set_name, title, data)
       VALUES ($1, $2, $3)
       ON CONFLICT (set_name) DO UPDATE
       SET title = $2
         , data = $3;`,
      [setName, title, data],
    )
  }
}