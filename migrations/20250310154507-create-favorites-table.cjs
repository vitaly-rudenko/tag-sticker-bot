module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    try {
      await db.query(`
        BEGIN;

        CREATE TABLE favorites (
          id SERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL,
          file_unique_id VARCHAR(100) NOT NULL,
          file_id VARCHAR(100) NOT NULL,
          file_type VARCHAR(100) NOT NULL,
          set_name VARCHAR(1000),
          emoji VARCHAR(100),
          mime_type VARCHAR(100),
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

        DROP INDEX favorites_user_id_file_unique_id_idx;
        DROP TABLE favorites;

        COMMIT;
      `)
    } catch (err) {
      await db.query('ROLLBACK;')
      throw err
    }
  },
}
