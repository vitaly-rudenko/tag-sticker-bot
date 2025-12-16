module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    try {
      await db.query(`
        BEGIN;

        ALTER TABLE files ADD COLUMN is_video BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE files ADD COLUMN is_animated BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE tags ADD COLUMN is_video BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE tags ADD COLUMN is_animated BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE favorites ADD COLUMN is_video BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE favorites ADD COLUMN is_animated BOOLEAN NOT NULL DEFAULT false;

        UPDATE files
        SET is_video = COALESCE((data->>'is_video')::boolean, false),
            is_animated = COALESCE((data->>'is_animated')::boolean, false)
        WHERE file_type = 'sticker';

        UPDATE tags
        SET is_video = COALESCE((
          SELECT (f.data->>'is_video')::boolean
          FROM files f
          WHERE f.file_unique_id = tags.file_unique_id
        ), false),
        is_animated = COALESCE((
          SELECT (f.data->>'is_animated')::boolean
          FROM files f
          WHERE f.file_unique_id = tags.file_unique_id
        ), false)
        WHERE file_type = 'sticker';

        UPDATE favorites
        SET is_video = COALESCE((
          SELECT (f.data->>'is_video')::boolean
          FROM files f
          WHERE f.file_unique_id = favorites.file_unique_id
        ), false),
        is_animated = COALESCE((
          SELECT (f.data->>'is_animated')::boolean
          FROM files f
          WHERE f.file_unique_id = favorites.file_unique_id
        ), false)
        WHERE file_type = 'sticker';

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

        ALTER TABLE files DROP COLUMN is_video;
        ALTER TABLE files DROP COLUMN is_animated;
        ALTER TABLE tags DROP COLUMN is_video;
        ALTER TABLE tags DROP COLUMN is_animated;
        ALTER TABLE favorites DROP COLUMN is_video;
        ALTER TABLE favorites DROP COLUMN is_animated;

        COMMIT;
      `)
    } catch (err) {
      await db.query('ROLLBACK;')
      throw err
    }
  },
}
