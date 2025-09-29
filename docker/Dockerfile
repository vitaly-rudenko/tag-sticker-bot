FROM node:22-alpine

ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US.UTF-8

WORKDIR /app

RUN apk add --no-cache npm

COPY package*.json .
RUN npm ci

COPY . .

RUN touch .env

RUN set -ex; \
  chmod +x ./docker/wait-for; \
  chmod +x ./docker/entrypoint

ENTRYPOINT ["./docker/entrypoint"]
