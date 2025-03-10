module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    try {
      await db.query(`
        BEGIN;

        CREATE TABLE favorites (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR NOT NULL,
          file_id VARCHAR NOT NULL,
          file_unique_id VARCHAR NOT NULL,
          set_name VARCHAR,
          mime_type VARCHAR,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE UNIQUE INDEX favorites_user_id_file_unique_id_idx
            ON favorites (user_id, file_unique_id);

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

        DROP INDEX IF EXISTS favorites_user_id_file_unique_id_idx;
        DROP TABLE IF EXISTS favorites;

        COMMIT;
      `)
    } catch (err) {
      await db.query('ROLLBACK;')
      throw err
    }
  },
}
