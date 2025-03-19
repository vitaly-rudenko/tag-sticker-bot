module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    try {
      await db.query(`
        BEGIN;

        CREATE TABLE files (
          id SERIAL PRIMARY KEY,
          file_type VARCHAR(100) NOT NULL,
          file_unique_id VARCHAR(100) NOT NULL,
          set_name VARCHAR(1000),
          mime_type VARCHAR(100),
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE UNIQUE INDEX files_file_unique_id_uq      ON files (file_unique_id);
        CREATE        INDEX files_file_type_set_name_idx ON files (file_type, set_name);

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

        DROP INDEX files_file_type_set_name_idx;
        DROP INDEX files_file_unique_id_uq;
        DROP TABLE files;

        COMMIT;
      `)
    } catch (err) {
      await db.query('ROLLBACK;')
      throw err
    }
  },
}
