# backend/Dockerfile
FROM node:18-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# ffmpeg: media processing
# intel-media-va-driver: iHD VA-API backend for Intel Arc (Xe/Alchemist) GPUs
# libva-drm2: VA-API DRM backend (needed for headless/container GPU access)
RUN apt-get update && apt-get install -y \
  ffmpeg \
  intel-media-va-driver \
  libva-drm2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app/backend

COPY package*.json ./
RUN npm install

COPY server.js .

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
