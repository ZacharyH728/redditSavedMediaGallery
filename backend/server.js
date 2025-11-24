// backend/server.js

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 4000;
const PHOTOS_DIR = process.env.PHOTOS_DIR || path.join(__dirname, 'media');

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use('/media', express.static(PHOTOS_DIR));
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url} (Order: ${req.query.order || 'date'})`);
  next();
});

// --- Utilities ---
// Fisher-Yates (aka Knuth) Shuffle function
function shuffleArray(array) {
  let currentIndex = array.length, randomIndex;
  const newArray = [...array]; // Create a shallow copy

  // While there remain elements to shuffle.
  while (currentIndex !== 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    // And swap it with the current element.
    [newArray[currentIndex], newArray[randomIndex]] = [
      newArray[randomIndex], newArray[currentIndex]];
  }

  return newArray;
}

// --- File Discovery Logic ---
async function getImageFiles(dir) {
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    let imageFiles = [];
    for (const dirent of dirents) {
      const fullPath = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        imageFiles = imageFiles.concat(await getImageFiles(fullPath));
      } else if (/\.(jpg|jpeg|png|gif|webp)$/i.test(dirent.name)) {
        const stats = await fs.stat(fullPath);
        const relativePath = path.relative(PHOTOS_DIR, fullPath).replace(/\\/g, '/');
        const encodedUrlPath = relativePath.split('/').map(encodeURIComponent).join('/');
        imageFiles.push({
          id: Buffer.from(relativePath).toString('base64'),
          url: `/media/${encodedUrlPath}`,
          title: dirent.name,
          created_utc: stats.birthtimeMs / 1000,
          author: 'Local Library',
          subreddit: path.basename(path.dirname(fullPath)),
          post_hint: 'image',
        });
      }
    }
    return imageFiles;
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error.message);
    return [];
  }
}

// --- Caching ---
let dateSortedCache = [];
let shuffledCache = [];
let lastCacheUpdate = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

async function updateCache() {
  console.log('Refreshing cache...');
  try {
    const allFiles = await getImageFiles(PHOTOS_DIR);
    // Create the date-sorted cache
    dateSortedCache = [...allFiles].sort((a, b) => b.created_utc - a.created_utc);
    // Create the shuffled cache
    shuffledCache = shuffleArray(allFiles);
    lastCacheUpdate = Date.now();
    console.log(`✓ Cache refreshed: ${allFiles.length} files found and cached.`);
  } catch (error) {
    console.error('Failed to update file cache:', error);
  }
}

// --- API Routes ---
app.get('/api/media', async (req, res) => {
  const now = Date.now();
  if (now - lastCacheUpdate > CACHE_TTL) {
    await updateCache();
  }

  const order = req.query.order || 'date'; // Default to 'date'
  const page = parseInt(req.query.page) || 0;
  const limit = parseInt(req.query.limit) || 25;
  const skip = page * limit;

  const sourceCache = order === 'random' ? shuffledCache : dateSortedCache;
  const files = sourceCache.slice(skip, skip + limit);
  
  res.json({
    data: {
      children: files,
      after: skip + files.length < sourceCache.length ? 'more' : null
    }
  });
});

// --- Server Initialization ---
async function startServer() {
  try {
    await fs.access(PHOTOS_DIR);
  } catch (error) {
    await fs.mkdir(PHOTOS_DIR, { recursive: true });
  }
  
  await updateCache(); // Initial cache fill

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================`);
    console.log(`Backend server running on http://0.0.0.0:${PORT}`);
    console.log(`Serving media from: ${PHOTOS_DIR}`);
    console.log(`==================================================\n`);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
