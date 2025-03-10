import { Umzug } from 'umzug'
import pg from 'pg'
import { PostgresStorage } from './PostgresStorage.js'
import { env } from '../env.js'

const client = new pg.Client(env.DATABASE_URL)
client.connect()

export const umzug = new Umzug({
  migrations: { glob: 'migrations/*-*.cjs' },
  context: client,
  storage: new PostgresStorage(client, 'migrations_meta'),
  logger: console,
})
