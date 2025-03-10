
export class PostgresStorage {
  /**
   * @param {import('pg').Client} client
   * @param {string} tableName
   */
  constructor(client, tableName) {
    this._client = client
    this._tableName = tableName
  }

  /** @param {import('umzug').MigrationMeta} migration */
  async logMigration(migration) {
    await this.init()

    await this._client.query(`
      INSERT INTO ${this._tableName}(name)
      VALUES ('${migration.name}')
      ON CONFLICT DO NOTHING;
    `)
  }

  /** @param {import('umzug').MigrationMeta} migration */
  async unlogMigration(migration) {
    await this.init()

    await this._client.query(`
      DELETE FROM ${this._tableName}
      WHERE name = '${migration.name}';
    `)
  }

  async executed() {
    await this.init()

    const { rows } = await this._client.query(`
      SELECT name FROM ${this._tableName};
    `)

    return rows.map(row => row.name)
  }

  async init() {
    await this._client.query(`
      CREATE TABLE IF NOT EXISTS ${this._tableName} (
        name varchar(255) PRIMARY KEY
      );
    `)
  }
}
