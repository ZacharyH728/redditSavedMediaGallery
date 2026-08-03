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
  - The NFS `/transcodes` folder mounted **read-write** — transcoded `.mp4`s are
    persisted here, alongside the photos on the NAS, **not** in a docker volume

## Transcodes on the NAS

Transcoded videos must be stored on the NFS NAS in a separate `/transcodes`
folder alongside the photos — never in a docker volume or the container overlay,
so they survive image/container rebuilds and are visible on the share.

Bind-mount that NFS folder and point the backend at it via `TRANSCODED_DIR`:

```yaml
services:
  backend:
    environment:
      - TRANSCODED_DIR=/transcodes
    volumes:
      - ${LOCAL_MEDIA_PATH}:/usr/src/app/backend/media:ro
      - ${LOCAL_TRANSCODED_PATH}:/transcodes   # NFS NAS, read-write
```

Set `LOCAL_TRANSCODED_PATH` in `.env` to the host path of the NFS `/transcodes`
folder (e.g. `/mnt/nas/transcodes`). ffmpeg still muxes to a local scratch dir
(`TRANSCODE_TMP_DIR`, disk-backed) and only does a sequential copy onto the
share, so the seek-heavy `+faststart` mux never runs directly on NFS.

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
