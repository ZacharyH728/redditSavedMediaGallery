// backend/server.js - OPTIMIZED
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;
const PHOTOS_DIR = process.env.PHOTOS_DIR || path.join(__dirname, 'media');
const CACHE_FILE = path.join(__dirname, 'media_cache.json');

// --- Caches ---
// 1. Query Cache: key (seed+sort) -> array (sorted file list)
const queryCache = new Map();
// 2. Global File Index
let globalFileCache = [];

// --- Middleware ---
app.use(cors());

// Serve static files via Node.js as a fallback (primary serving happens via Nginx)
app.use('/media', express.static(PHOTOS_DIR));

// --- Utilities ---
function createSeededRandom(seed) {
  if (!seed) return Math.random;
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return function() {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function shuffleArray(array, seed = null) {
  let currentIndex = array.length, randomIndex;
  const newArray = [...array];
  const randomFn = seed ? createSeededRandom(seed) : Math.random;

  while (currentIndex !== 0) {
    randomIndex = Math.floor(randomFn() * currentIndex);
    currentIndex--;
    [newArray[currentIndex], newArray[randomIndex]] = [
      newArray[randomIndex], newArray[currentIndex]];
  }
  return newArray;
}

// --- File Discovery ---
const imageExts = /\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)$/i;
const videoExts = /\.(mp4|webm|mov|mkv|avi|wmv|flv|m4v)$/i;
const audioExts = /\.(mp3|wav|ogg|m4a|flac|aac)$/i;

async function getImageFiles(dir) {
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    
    // --- LIVE PHOTO DEDUPLICATION LOGIC ---
    // 1. Identify all image base names in this specific directory first.
    //    If we have 'vacation.heic', we store 'vacation' in the set.
    const imageBaseNames = new Set();
    for (const dirent of dirents) {
      if (!dirent.isDirectory() && imageExts.test(dirent.name)) {
        // 'IMG_1234.HEIC' -> 'img_1234'
        const baseName = path.parse(dirent.name).name.toLowerCase();
        imageBaseNames.add(baseName);
      }
    }
    // --------------------------------------

    const filesPromises = dirents.map(async (dirent) => {
      const fullPath = path.join(dir, dirent.name);
      
      try {
        if (dirent.isDirectory()) {
          return await getImageFiles(fullPath);
        } else {
          let type = null;
          if (imageExts.test(dirent.name)) type = 'image';
          else if (videoExts.test(dirent.name)) type = 'video';
          else if (audioExts.test(dirent.name)) type = 'audio';

          if (type) {
            // Check for Live Photo duplicate
            if (type === 'video') {
              const baseName = path.parse(dirent.name).name.toLowerCase();
              // If there is an image with the exact same name, assume this video is just the "Live" part
              if (imageBaseNames.has(baseName)) {
                return []; // SKIP this file
              }
            }

            // Optimization: Get stats strictly for what we need
            const stats = await fs.stat(fullPath);
            const relativePath = path.relative(PHOTOS_DIR, fullPath).replace(/\\/g, '/');
            const encodedUrlPath = relativePath.split('/').map(encodeURIComponent).join('/');
            
            return [{
              id: Buffer.from(relativePath).toString('base64'),
              url: `/media/${encodedUrlPath}`,
              title: dirent.name,
              created_utc: stats.birthtimeMs / 1000,
              author: 'Local Library',
              subreddit: path.basename(path.dirname(fullPath)),
              post_hint: type,
            }];
          }
        }
      } catch (err) {
        console.error(`Error processing file ${fullPath}:`, err.message);
        return []; 
      }
      return []; 
    });

    const results = await Promise.all(filesPromises);
    return results.flat();

  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error.message);
    return []; 
  }
}

async function updateFileCache() {
  console.log('Updating file cache from disk...');
  const start = Date.now();
  globalFileCache = await getImageFiles(PHOTOS_DIR);
  
  // Optimization: Write cache to disk
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(globalFileCache));
    console.log(`Cache persisted to ${CACHE_FILE}`);
  } catch (err) {
    console.error('Failed to write cache file:', err);
  }
  
  // Clear dependent caches
  queryCache.clear(); 
  
  console.log(`Cache updated with ${globalFileCache.length} files in ${Date.now() - start}ms`);
}

// --- Load Cache on Start ---
async function loadCacheFromDisk() {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf8');
    globalFileCache = JSON.parse(data);
    console.log(`Loaded ${globalFileCache.length} files from persistent cache.`);
  } catch (err) {
    console.log('No persistent cache found, scanning now...');
    await updateFileCache();
  }
}

// --- API Route ---
app.get('/api/media', async (req, res) => {
  try {
    const limit = 25;
    const page = parseInt(req.query.page) || 1;
    const sort = req.query.sort || 'random';
    const seed = req.query.seed ? parseInt(req.query.seed) : Date.now();
    
    // Optimization: Generate a unique key for this view configuration
    const cacheKey = `${sort}_${seed}`;

    if (globalFileCache.length === 0) {
      // Fallback if empty
      await updateFileCache();
    }

    let processedFiles;

    // Optimization: Check Query Cache
    if (queryCache.has(cacheKey)) {
      processedFiles = queryCache.get(cacheKey);
    } else {
      // If not in cache, calculate and store it
      // NOTE: This prevents re-sorting/re-shuffling on every page turn
      processedFiles = [...globalFileCache];
      
      if (sort === 'random') {
        processedFiles = shuffleArray(processedFiles, seed);
      } else if (sort === 'date') {
        processedFiles.sort((a, b) => b.created_utc - a.created_utc);
      } else {
        processedFiles.sort((a, b) => a.title.localeCompare(b.title));
      }

      // Store in LRU-like cache (simple cleanup strategy could be added)
      if (queryCache.size > 100) queryCache.clear(); // Simple preventive clear
      queryCache.set(cacheKey, processedFiles);
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const files = processedFiles.slice(startIndex, endIndex);
    const hasMore = endIndex < processedFiles.length;

    res.json({
      data: {
        children: files,
        after: hasMore 
      }
    });
  } catch (error) {
    console.error("Error in /api/media route:", error);
    res.status(500).json({ error: "Failed to retrieve media." });
  }
});

async function startServer() {
  try {
    await fs.access(PHOTOS_DIR);
  } catch (error) {
    console.log(`Media directory not found at ${PHOTOS_DIR}. Creating it.`);
    await fs.mkdir(PHOTOS_DIR, { recursive: true });
  }
  
  // Optimization: Load from disk first
  await loadCacheFromDisk();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================`);
    console.log(`Optimized Backend server running on http://0.0.0.0:${PORT}`);
    console.log(`Serving media from: ${PHOTOS_DIR}`);
    console.log(`==================================================\n`);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
