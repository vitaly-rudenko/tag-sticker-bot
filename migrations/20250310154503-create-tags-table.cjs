module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    try {
      await db.query(`
        BEGIN;

        CREATE TABLE tags (
          id SERIAL PRIMARY KEY,
          author_user_id VARCHAR NOT NULL,
          is_private BOOLEAN NOT NULL,
          value VARCHAR NOT NULL,
          file_unique_id VARCHAR NOT NULL,
          file_id VARCHAR NOT NULL,
          set_name VARCHAR,
          mime_type VARCHAR,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE UNIQUE INDEX tags_author_user_id_file_unique_id_value_idx
            ON tags (author_user_id, file_unique_id, value);

        COMMIT;
      `)
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
