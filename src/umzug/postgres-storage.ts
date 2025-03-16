import type { Client } from 'pg'
import type { MigrationMeta } from 'umzug'

export class PostgresStorage {
  #client: Client
  #tableName: string

  constructor(client: Client, tableName: string) {
    this.#client = client
    this.#tableName = tableName
  }

  async logMigration(migration: MigrationMeta) {
    await this.init()

    await this.#client.query(`
      INSERT INTO ${this.#tableName}(name)
      VALUES ('${migration.name}')
      ON CONFLICT DO NOTHING;
    `)
  }

  async unlogMigration(migration: MigrationMeta) {
    await this.init()

    await this.#client.query(`
      DELETE FROM ${this.#tableName}
      WHERE name = '${migration.name}';
    `)
  }

  async executed() {
    await this.init()

    const { rows } = await this.#client.query(`
      SELECT name FROM ${this.#tableName};
    `)

    return rows.map(row => row.name)
  }

  async init() {
    await this.#client.query(`
      CREATE TABLE IF NOT EXISTS ${this.#tableName} (
        name varchar(255) PRIMARY KEY
      );
    `)
  }
}
