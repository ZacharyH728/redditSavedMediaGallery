# backend/Dockerfile
FROM node:18-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
# Default is 4 — too small once the library scan is issuing dozens of
# concurrent fs.stat/fs.readdir calls (see FS_SCAN_CONCURRENCY in server.js).
ENV UV_THREADPOOL_SIZE=16

# ffmpeg: thumbnail generation (software scale only — the VA-API driver packages
# that used to be installed here existed for hardware video transcoding, which
# has been removed).
RUN apt-get update && apt-get install -y \
  ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app/backend

COPY package*.json ./
RUN npm install

# Both files, not just server.js: server.js requires ./viewCounts.js, and a
# single-file COPY here builds a perfectly good image that dies on boot with
# MODULE_NOT_FOUND.
COPY server.js viewCounts.js ./

EXPOSE 4000

ARG REDDIT_CLIENT_ID
ENV REDDIT_CLIENT_ID=$REDDIT_CLIENT_ID
ARG REDDIT_CLIENT_SECRET
ENV REDDIT_CLIENT_SECRET=$REDDIT_CLIENT_SECRET
ARG PORT
ENV PORT=$PORT
ARG API_URL
ENV API_URL=$API_URL

CMD ["node", "server.js"]
