module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    try {
      await db.query(`
        BEGIN;

        CREATE INDEX favorites_file_id_idx ON favorites (file_id);
        CREATE INDEX tags_file_id_idx      ON tags (file_id);
        CREATE INDEX files_file_id_idx     ON files (file_id);

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

        DROP INDEX files_file_id_idx;
        DROP INDEX tags_file_id_idx;
        DROP INDEX favorites_file_id_idx;

        COMMIT;
      `)
    } catch (err) {
      await db.query('ROLLBACK;')
      throw err
    }
  },
}
