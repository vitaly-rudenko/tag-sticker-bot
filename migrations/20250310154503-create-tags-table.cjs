module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    try {
      await db.query(`
        BEGIN;

        CREATE TABLE tags (
          id SERIAL PRIMARY KEY,
          author_user_id BIGINT NOT NULL,
          visibility VARCHAR(100) NOT NULL,
          value VARCHAR(1000) NOT NULL,
          file_unique_id VARCHAR(100) NOT NULL,
          file_id VARCHAR(100) NOT NULL,
          file_type VARCHAR(100) NOT NULL,
          set_name VARCHAR(1000),
          emoji VARCHAR(100),
          mime_type VARCHAR(100),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE UNIQUE INDEX tags_author_user_id_file_unique_id_value_idx
                         ON tags (author_user_id, file_unique_id, value);

        CREATE INDEX tags_value_trgm_idx      ON tags USING gin (value gin_trgm_ops);
        CREATE INDEX tags_file_visibility_idx ON tags (file_unique_id, visibility);

        COMMIT;
      `)

      // TODO: add index on value
    } catch (err) {
      await db.query('ROLLBACK;')
      throw err
    }
  },

  /** @param {{ context: import('pg').Pool }} context */
  async down({ context: db }) {
    try {
      await db.query(`
        BEGIN;

        DROP INDEX IF EXISTS tags_author_user_id_file_unique_id_value_idx;
        DROP TABLE IF EXISTS tags;

        COMMIT;
      `)
    } catch (err) {
      await db.query('ROLLBACK;')
      throw err
    }
  },
}
