#!/bin/sh
set -ex

cd /server

DATABASE_HOST=$(echo $DATABASE_URL | cut -d'/' -f3 | cut -d'@' -f2 | cut -d':' -f1)
DATABASE_PORT=$(echo $DATABASE_URL | cut -d'/' -f3 | cut -d'@' -f2 | cut -d':' -f2)

echo "Waiting for ${DATABASE_HOST}:${DATABASE_PORT}"
wait-for "${DATABASE_HOST}:${DATABASE_PORT}" -t 120

echo "Migrating the database"
npm run umzug db:migrate

echo "Starting the app"
exec "$@"
