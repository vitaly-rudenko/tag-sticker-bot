module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    try {
      await db.query(`
        BEGIN;

        UPDATE files
        SET file_type = file_id
          , file_id = file_type
        WHERE file_type NOT IN ('sticker', 'animation', 'photo', 'video', 'video_note');

        COMMIT;
      `)
    } catch (err) {
      await db.query('ROLLBACK;')
      throw err
    }
  },

  /** @param {{ context: import('pg').Pool }} context */
  async down({ context: db }) {
    // stub
  },
}
