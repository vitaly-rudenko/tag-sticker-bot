module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    try {
      await db.query(`
        BEGIN;

        CREATE TABLE sticker_sets (
          id SERIAL PRIMARY KEY,
          set_name VARCHAR(1000) NOT NULL,
          title VARCHAR(1000) NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE UNIQUE INDEX sticker_sets_set_name_uq       ON sticker_sets (set_name);
        CREATE        INDEX sticker_sets_set_name_trgm_idx ON sticker_sets USING gin (set_name gin_trgm_ops);
        CREATE        INDEX sticker_sets_title_trgm_idx    ON sticker_sets USING gin (title gin_trgm_ops);

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

        DROP INDEX sticker_sets_title_trgm_idx;
        DROP INDEX sticker_sets_set_name_trgm_idx;
        DROP INDEX sticker_sets_set_name_uq;
        DROP TABLE sticker_sets;

        COMMIT;
      `)
    } catch (err) {
      await db.query('ROLLBACK;')
      throw err
    }
  },
}
