module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    try {
      await db.query(`
        BEGIN;

        CREATE TABLE user_sessions (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR NOT NULL,
          is_private BOOLEAN DEFAULT FALSE,
          phase VARCHAR,
          file JSONB,
          file_message_id VARCHAR,
          tag_instruction_message_id VARCHAR,
          queue JSONB,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE UNIQUE INDEX user_sessions_user_id_idx
            ON user_sessions (user_id);

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

        DROP INDEX IF EXISTS user_sessions_user_id_idx;
        DROP TABLE IF EXISTS user_sessions;

        COMMIT;
      `)
    } catch (err) {
      await db.query('ROLLBACK;')
      throw err
    }
  },
}
