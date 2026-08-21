# Docker Compose Setup for Reddit Saved Media Gallery

This project includes Docker support for easy deployment of both the backend and Svelte frontend.

## Quick Start

1. **Copy the environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your configuration:**
   ```bash
   # Required
   REDDIT_CLIENT_ID=your_reddit_client_id
   REDDIT_CLIENT_SECRET=your_reddit_client_secret
   
   # Optional (defaults shown)
   BACKEND_PORT=4000
   FRONTEND_PORT=3000
   ```

3. **Build and start the containers:**
   ```bash
   docker-compose up -d
   ```

4. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:4000

## Services

### Backend
- **Port:** 4000 (configurable via `BACKEND_PORT`)
- **Technology:** Node.js + Express
- **Volumes:**
  - `./media` (or your NFS photos path) mounted **read-only**

## Video transcoding (removed)

The backend used to pre-transcode every video to H.264 MP4 and serve those
copies instead of the originals. That has been removed: videos are now served
straight from the originals under `/media`, via nginx.

It was measured to be doing nothing useful. The library is overwhelmingly
already H.264, so nearly every file took the `-c copy` remux path — same
resolution, same bitrate, same bytes on the wire — and the transcode output was
consistently equal to or *larger* than the source. The encode paths never
downscaled or capped bitrate, so there was no bandwidth reduction to be had,
and serving the copies through Express was a slower path than nginx's `sendfile`
on the originals. The only real benefit was `+faststart` and container
normalisation for the handful of non-H.264 files.

If you want the startup-latency win back without the storage cost, the thing to
add is not a transcoder — it's `-movflags +faststart` at download time in the
downloader, plus a resolution/bitrate cap for genuinely oversized files.

Leftover `.mp4`s from the old feature may still be on the share at
`/mnt/media/Photos/transcodes`. They are safe to delete. Until they are, the
scanner keeps excluding any directory named `transcodes` (see
`EXCLUDED_DIR_NAMES` in `backend/server.js`) so they aren't indexed as duplicate
library entries.

### Frontend (Svelte)
- **Port:** 3000 (configurable via `FRONTEND_PORT`)
- **Technology:** Svelte 5 + Vite
- **Web Server:** Nginx (production-ready)

## Docker Commands

### Start services
```bash
docker-compose up -d
```

### Stop services
```bash
docker-compose down
```

### View logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f frontend-svelte
docker-compose logs -f backend
```

### Rebuild after code changes
```bash
docker-compose up -d --build
```

### Remove everything (including volumes)
```bash
docker-compose down -v
```

## Production Deployment

For production, update your `.env` file with production URLs:

```bash
# Production Configuration
API_URL=https://your-domain.com/api
VITE_API_URL=https://your-domain.com/api
VITE_BACKEND_URL=https://your-domain.com
```

Then rebuild:
```bash
docker-compose up -d --build
```

## Media Files

Place your media files in the `./media` directory. The structure should be:
```
media/
├── subreddit1/
│   ├── image1.jpg
│   └── image2.png
└── subreddit2/
    └── video1.mp4
```

The backend will serve these files and the frontend will display them.

## Troubleshooting

### Frontend can't connect to backend
- Check that both containers are running: `docker-compose ps`
- Verify the API URL in your `.env` file
- Check backend logs: `docker-compose logs backend`

### Port conflicts
- Change the ports in `.env`:
  ```bash
  BACKEND_PORT=5000
  FRONTEND_PORT=8080
  ```
- Restart: `docker-compose up -d`

### Rebuild from scratch
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```
