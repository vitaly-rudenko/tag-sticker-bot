module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    try {
      await db.query(`
        BEGIN;

        ALTER TABLE favorites ADD COLUMN file_name VARCHAR(1000);
        ALTER TABLE tags ADD COLUMN file_name VARCHAR(1000);
        ALTER TABLE files ADD COLUMN file_name VARCHAR(1000);

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

        ALTER TABLE favorites DROP COLUMN file_name;
        ALTER TABLE tags DROP COLUMN file_name;
        ALTER TABLE files DROP COLUMN file_name;

        COMMIT;
      `)
    } catch (err) {
      await db.query('ROLLBACK;')
      throw err
    }
  },
}
