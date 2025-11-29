// backend/server.js - SIMPLIFIED

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 4000;
const PHOTOS_DIR = process.env.PHOTOS_DIR || path.join(__dirname, 'media');

// --- Middleware ---
app.use(cors());
app.use('/media', express.static(PHOTOS_DIR));
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  next();
});

// --- Utilities ---
// Simple Linear Congruential Generator for seeded random numbers
function createSeededRandom(seed) {
  // If no seed is provided, use Math.random
  if (!seed) return Math.random;

  // Simple LCG parameters
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;

  return function() {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

// Standard Fisher-Yates (aka Knuth) Shuffle function with seed support.
function shuffleArray(array, seed = null) {
  let currentIndex = array.length, randomIndex;
  const newArray = [...array];
  // Create a seeded random function, or use Math.random if no seed
  const randomFn = seed ? createSeededRandom(seed) : Math.random;

  while (currentIndex !== 0) {
    randomIndex = Math.floor(randomFn() * currentIndex);
    currentIndex--;
    [newArray[currentIndex], newArray[randomIndex]] = [
      newArray[randomIndex], newArray[currentIndex]];
  }
  return newArray;
}

// --- File Discovery Logic ---
// Define supported extensions once
const imageExts = /\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)$/i;
const videoExts = /\.(mp4|webm|mov|mkv|avi|wmv|flv|m4v)$/i;
const audioExts = /\.(mp3|wav|ogg|m4a|flac|aac)$/i;

async function getImageFiles(dir) {
  try {
    // Read directory contents
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    
    // Process all entries in parallel
    const filesPromises = dirents.map(async (dirent) => {
      const fullPath = path.join(dir, dirent.name);
      
      try {
        if (dirent.isDirectory()) {
          // Recursive call for subdirectories
          return await getImageFiles(fullPath);
        } else {
          // Check file type
          let type = null;
          if (imageExts.test(dirent.name)) type = 'image';
          else if (videoExts.test(dirent.name)) type = 'video';
          else if (audioExts.test(dirent.name)) type = 'audio';

          if (type) {
            // Get stats for sorting by date
            const stats = await fs.stat(fullPath);
            const relativePath = path.relative(PHOTOS_DIR, fullPath).replace(/\\/g, '/');
            // Encode the path parts to handle spaces and special chars in URLs
            const encodedUrlPath = relativePath.split('/').map(encodeURIComponent).join('/');
            
            return [{
              id: Buffer.from(relativePath).toString('base64'),
              url: `/media/${encodedUrlPath}`,
              title: dirent.name,
              created_utc: stats.birthtimeMs / 1000,
              author: 'Local Library',
              subreddit: path.basename(path.dirname(fullPath)),
              post_hint: type, // 'image', 'video', or 'audio'
            }];
          }
        }
      } catch (err) {
        console.error(`Error processing file ${fullPath}:`, err.message);
        return []; // Skip this specific file on error
      }
      return []; // Return empty array if not a media file
    });

    // Wait for all promises to resolve and flatten the results
    const results = await Promise.all(filesPromises);
    return results.flat();

  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error.message);
    return []; // Return empty if the directory itself cannot be read
  }
}

// --- In-Memory Cache ---
let globalFileCache = [];

async function updateFileCache() {
  console.log('Updating file cache...');
  const start = Date.now();
  globalFileCache = await getImageFiles(PHOTOS_DIR);
  console.log(`Cache updated with ${globalFileCache.length} files in ${Date.now() - start}ms`);
}

// --- API Route ---
app.get('/api/media', async (req, res) => {
  try {
    // Get query parameters for pagination, seeding, and sorting
    const limit = 25;
    const page = parseInt(req.query.page) || 1;
    const sort = req.query.sort || 'random';
    
    // 1. Use the cached list of files
    if (globalFileCache.length === 0) {
      // Try to populate if empty (first run race condition or empty folder)
      await updateFileCache();
    }
    
    if (globalFileCache.length === 0) {
      return res.json({ data: { children: [], after: null } });
    }

    let processedFiles = [...globalFileCache];

    if (sort === 'random') {
      // Use a provided seed or generate a random one if not provided
      const seed = req.query.seed ? parseInt(req.query.seed) : Date.now();
      // Shuffle using the seed
      processedFiles = shuffleArray(processedFiles, seed);
    } else if (sort === 'date') {
      // Sort by creation date (newest first)
      processedFiles.sort((a, b) => b.created_utc - a.created_utc);
    } else {
      // Default to filename sort if unknown
      processedFiles.sort((a, b) => a.title.localeCompare(b.title));
    }

    // 3. Calculate start and end indices for pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    // 4. Slice the array to get just the current page's files
    const files = processedFiles.slice(startIndex, endIndex);
    
    // 5. Determine if there are more files
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

// --- Server Initialization ---
async function startServer() {
  // Ensure the media directory exists before starting.
  try {
    await fs.access(PHOTOS_DIR);
  } catch (error) {
    console.log(`Media directory not found at ${PHOTOS_DIR}. Creating it.`);
    await fs.mkdir(PHOTOS_DIR, { recursive: true });
  }
  
  // Initial cache fill
  await updateFileCache();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================`);
    console.log(`Simplified Backend server running on http://0.0.0.0:${PORT}`);
    console.log(`Serving media from: ${PHOTOS_DIR}`);
    console.log(`==================================================\n`);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
