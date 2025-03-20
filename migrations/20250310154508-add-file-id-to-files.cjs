module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    try {
      await db.query(`
        BEGIN;

        ALTER TABLE files ADD COLUMN file_id VARCHAR(100);

        UPDATE files SET file_id = COALESCE(data->>'fileId', data->>'file_id');

        ALTER TABLE files ALTER COLUMN file_id SET NOT NULL;

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

        ALTER TABLE files DROP COLUMN file_id;

        COMMIT;
      `)
    } catch (err) {
      await db.query('ROLLBACK;')
      throw err
    }
  },
}
