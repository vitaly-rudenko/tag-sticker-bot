import pg from 'pg'
import { Umzug } from 'umzug'
import { PostgresStorage } from './postgres-storage.ts'

const client = new pg.Client(process.env.DATABASE_URL)
client.connect()

export const umzug = new Umzug({
  migrations: { glob: 'migrations/*-*.cjs' },
  context: client,
  storage: new PostgresStorage(client, 'migrations_meta'),
  logger: console,
})
