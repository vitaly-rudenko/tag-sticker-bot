module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    try {
      await db.query(`
        BEGIN;

        ALTER TABLE files ADD COLUMN emoji VARCHAR(100);

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

        ALTER TABLE files DROP COLUMN emoji;

        COMMIT;
      `)
    } catch (err) {
      await db.query('ROLLBACK;')
      throw err
    }
  },
}
