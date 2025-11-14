// backend/server.js

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 4000;
const PHOTOS_DIR = '/mnt/Photos';
const LIMIT = 20;

// --- Middleware ---
app.use(cors({
  origin: ['http://localhost:3000', 'https://reddit.zhill.me'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/media', express.static(PHOTOS_DIR));

// Helper function to get all image files recursively
async function getImageFiles(dir) {
  const files = await fs.readdir(dir, { withFileTypes: true });
  const imageFiles = [];

  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    
    if (file.isDirectory()) {
      const subDirFiles = await getImageFiles(fullPath);
      imageFiles.push(...subDirFiles);
    } else if (file.isFile() && /\.(jpg|jpeg|png|gif)$/i.test(file.name)) {
      const stats = await fs.stat(fullPath);
      const relativePath = path.relative(PHOTOS_DIR, fullPath);
      // Remove the nested data object structure
      imageFiles.push({
        id: Buffer.from(relativePath).toString('base64'),
        url: `/media/${relativePath}`,
        title: file.name,
        created_utc: stats.birthtimeMs / 1000,
        author: 'Local Library',
        subreddit: path.basename(path.dirname(fullPath)),
        post_hint: 'image',
        thumbnail: `/media/${relativePath}`,
        is_video: false,
        permalink: `/media/${relativePath}`
      });
    }
  }
  return imageFiles;
}

// Cache system
let imageFilesCache = null;
let lastCacheUpdate = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Media routes
app.get('/api/media', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 25;
    const skip = page * limit;

    // Check if cache needs refresh
    const now = Date.now();
    if (!imageFilesCache || now - lastCacheUpdate > CACHE_TTL) {
      imageFilesCache = await getImageFiles(PHOTOS_DIR);
      lastCacheUpdate = now;
    }

    // Paginate from the cache
    const files = imageFilesCache
      .sort((a, b) => b.created_utc - a.created_utc)
      .slice(skip, skip + limit);

    const response = {
      data: {
        children: files,
        after: skip + files.length < imageFilesCache.length ? 'more' : null
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    status: 'Server is running',
    timestamp: new Date().toISOString(),
    totalFiles: imageFilesCache?.length || 0,
    photosDirectory: PHOTOS_DIR
  });
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`Serving photos from: ${PHOTOS_DIR}`);
});
