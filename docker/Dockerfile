# Stage: Install NPM packages
FROM node:24-bookworm-slim AS npm_dependencies

WORKDIR /server
COPY package*.json ./
RUN npm ci --omit=dev

# Stage: Runtime
FROM node:24-bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends netcat-openbsd && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /server
COPY --from=npm_dependencies /server/node_modules ./node_modules
COPY package*.json ./
COPY src src

COPY docker/docker-entrypoint.sh /usr/local/bin/
COPY docker/wait-for /usr/local/bin

USER node

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/app.ts"]

