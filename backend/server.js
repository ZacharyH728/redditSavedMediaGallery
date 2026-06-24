// backend/server.js - OPTIMIZED
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { execFile } = require('child_process');
const cors = require('cors');
const chokidar = require('chokidar');

const app = express();
const PORT = process.env.PORT || 4000;
const PHOTOS_DIR = process.env.PHOTOS_DIR || path.join(__dirname, 'media');
const CACHE_FILE = path.join(__dirname, 'media_cache.json');
const THUMBNAILS_DIR = path.join(__dirname, 'thumbnails');
const TRANSCODED_DIR = path.join(__dirname, 'transcoded');
const VAAPI_DEVICE = process.env.VAAPI_DEVICE || '/dev/dri/renderD128';
const TRANSCODE_CONCURRENCY = parseInt(process.env.TRANSCODE_CONCURRENCY || '2', 10);

// Deduplicates concurrent thumbnail requests for the same file
const pendingThumbnails = new Map();

// --- Transcoding state ---
const transcodedFiles = new Set();   // relative paths of completed .mp4 files
const transcodeQueue = [];           // relative source paths waiting to be processed
let activeTranscodes = 0;

// --- Caches ---
// 1. Query Cache: key (seed+sort) -> array (sorted file list)
const queryCache = new Map();
// 2. Global File Index
let globalFileCache = [];

// --- Middleware ---
app.use(cors());

// Serve static files via Node.js as a fallback (primary serving happens via Nginx)
app.use('/media', express.static(PHOTOS_DIR));
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  next();
});

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
            
            const fileObj = {
              id: Buffer.from(relativePath).toString('base64'),
              url: `/media/${encodedUrlPath}`,
              thumbnail_url: (type === 'video' || type === 'image') ? `/thumbnail/${encodedUrlPath}` : null,
              title: dirent.name,
              created_utc: stats.birthtimeMs / 1000,
              modified_utc: stats.mtimeMs / 1000,
              author: 'Local Library',
              subreddit: path.basename(path.dirname(fullPath)),
              post_hint: type,
            };
            if (type === 'video') {
              fileObj._relPath = relativePath;
              fileObj._transcodedRelPath = relativePath.replace(/\.[^.]+$/, '.mp4');
            }
            return [fileObj];
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

function groupGalleryItems(files) {
  const groups = new Map();
  const singles = [];

  for (const file of files) {
    // Pass already-grouped gallery items through unchanged (cache idempotency)
    if (file.post_hint === 'gallery') { singles.push(file); continue; }
    const match = file.title.match(/^(.+)_(\d+)(\.[^.]+)$/);
    if (!match) { singles.push(file); continue; }
    const [, baseName, num, ext] = match;
    const dir = file.url.substring(0, file.url.lastIndexOf('/'));
    const key = `${dir}/${baseName}${ext}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ file, num: parseInt(num, 10) });
  }

  const result = [...singles];
  for (const [, items] of groups) {
    items.sort((a, b) => a.num - b.num);
    const nums = items.map(i => i.num);
    // Require 2+ items with no gaps. Starting number is unconstrained so
    // galleries numbered _0…_N and _2…_N both work. A lone _3.jpg (1 item)
    // or two files with a gap (_1, _3) are left as regular files.
    const isConsecutive = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
    if (items.length < 2 || !isConsecutive) {
      items.forEach(({ file }) => result.push(file));
    } else {
      const first = items[0].file;
      const baseName = first.title.match(/^(.+)_\d+(\.[^.]+)$/)?.[1] ?? first.title;
      result.push({
        id: `gallery_${first.id}`,
        title: baseName,
        post_hint: 'gallery',
        subreddit: first.subreddit,
        created_utc: first.created_utc,
        modified_utc: first.modified_utc,
        items: items.map(({ file }) => ({
          url: file.url,
          thumbnail_url: file.thumbnail_url,
          _relPath: file._relPath,
          _transcodedRelPath: file._transcodedRelPath,
          title: file.title,
          post_hint: file.post_hint,
        })),
      });
    }
  }
  return result;
}

async function updateFileCache() {
  console.log('Updating file cache from disk...');
  const start = Date.now();
  globalFileCache = groupGalleryItems(await getImageFiles(PHOTOS_DIR));
  
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
    globalFileCache = groupGalleryItems(JSON.parse(data)).map(ensureInternalPaths);
    console.log(`Loaded ${globalFileCache.length} files from persistent cache.`);
  } catch (err) {
    console.log('No persistent cache found, scanning now...');
    await updateFileCache();
  }
}

// --- Watcher ---
let debounceTimer;
function scheduleCacheUpdate() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log('File change detected. Updating cache...');
    updateFileCache();
  }, 5000); // 5 seconds debounce
}

function startWatcher() {
  const watcher = chokidar.watch(PHOTOS_DIR, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true, // Don't trigger on existing files at startup
    depth: 99
  });

  watcher
    .on('add', path => scheduleCacheUpdate())
    .on('unlink', path => scheduleCacheUpdate());
    // .on('change', ...) - usually we don't care if content changes, only if files are added/removed for the gallery list, 
    // but if metadata changes it might be useful. Keeping it simple for now.
    
  console.log('File watcher started on ' + PHOTOS_DIR);
}

// --- Transcoding ---

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { timeout: 0 }, (err) => err ? reject(err) : resolve());
  });
}

async function getVideoCodec(inputPath) {
  return new Promise((resolve) => {
    execFile('ffprobe', [
      '-v', 'quiet', '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', inputPath
    ], { timeout: 15000 }, (err, stdout) => resolve(err ? null : stdout.trim()));
  });
}

async function transcodeVideo(relPath) {
  const inputPath = path.join(PHOTOS_DIR, relPath);
  const transcodedRelPath = relPath.replace(/\.[^.]+$/, '.mp4');
  const outputPath = path.join(TRANSCODED_DIR, transcodedRelPath);
  const tmpPath = outputPath + '.tmp';

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const codec = await getVideoCodec(inputPath);

  if (codec === 'h264') {
    // Already H.264 — remux into MP4 with faststart, no re-encode
    await runFfmpeg([
      '-i', inputPath, '-map', '0:v:0', '-map', '0:a?',
      '-c', 'copy', '-movflags', '+faststart', '-y', tmpPath,
    ]);
  } else {
    // Transcode to H.264 via VAAPI hardware encode
    try {
      await runFfmpeg([
        '-vaapi_device', VAAPI_DEVICE,
        '-i', inputPath,
        '-map', '0:v:0', '-map', '0:a?',
        '-vf', 'format=nv12,hwupload',
        '-c:v', 'h264_vaapi', '-qp', '23',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart', '-y', tmpPath,
      ]);
    } catch (vaapiErr) {
      console.warn(`VAAPI failed for ${relPath}: ${vaapiErr.message} — falling back to software encode`);
      await runFfmpeg([
        '-i', inputPath, '-map', '0:v:0', '-map', '0:a?',
        '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart', '-y', tmpPath,
      ]);
    }
  }

  await fs.rename(tmpPath, outputPath);
  transcodedFiles.add(transcodedRelPath);
  console.log(`Transcoded: ${relPath}`);
}

function drainTranscodeQueue() {
  while (transcodeQueue.length > 0 && activeTranscodes < TRANSCODE_CONCURRENCY) {
    const relPath = transcodeQueue.shift();
    activeTranscodes++;
    transcodeVideo(relPath)
      .catch(err => console.error(`Transcode failed [${relPath}]:`, err.message))
      .finally(() => { activeTranscodes--; drainTranscodeQueue(); });
  }
}

async function loadTranscodedFiles() {
  async function scan(dir) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await scan(full);
      } else if (entry.name.endsWith('.tmp')) {
        await fs.unlink(full).catch(() => {}); // clean up crashed partial transcodes
      } else if (entry.name.endsWith('.mp4')) {
        transcodedFiles.add(path.relative(TRANSCODED_DIR, full).replace(/\\/g, '/'));
      }
    }
  }
  await fs.mkdir(TRANSCODED_DIR, { recursive: true });
  await scan(TRANSCODED_DIR);
  console.log(`Found ${transcodedFiles.size} already-transcoded files.`);
}

// Populate _relPath/_transcodedRelPath on cached files that were written before this field existed
function ensureInternalPaths(file) {
  if (file.post_hint === 'video' && !file._relPath && file.id) {
    try {
      file._relPath = Buffer.from(file.id, 'base64').toString('utf8');
      file._transcodedRelPath = file._relPath.replace(/\.[^.]+$/, '.mp4');
    } catch {}
  }
  if (file.post_hint === 'gallery' && Array.isArray(file.items)) {
    file.items.forEach(item => {
      if (item.post_hint === 'video' && !item._relPath && item.url) {
        const rel = item.url.replace('/media/', '').split('/').map(decodeURIComponent).join('/');
        item._relPath = rel;
        item._transcodedRelPath = rel.replace(/\.[^.]+$/, '.mp4');
      }
    });
  }
  return file;
}

async function initTranscoding() {
  await loadTranscodedFiles();
  let queued = 0;
  for (const file of globalFileCache) {
    const videos = file.post_hint === 'video' ? [file]
      : file.post_hint === 'gallery' ? (file.items || []).filter(i => i.post_hint === 'video')
      : [];
    for (const v of videos) {
      if (v._relPath && v._transcodedRelPath && !transcodedFiles.has(v._transcodedRelPath)) {
        transcodeQueue.push(v._relPath);
        queued++;
      }
    }
  }
  console.log(`Queued ${queued} videos for transcoding (${TRANSCODE_CONCURRENCY} concurrent, VAAPI: ${VAAPI_DEVICE}).`);
  drainTranscodeQueue();
}

// Strips internal fields and injects transcoded_url before sending to client
function buildClientFile(file) {
  const { _relPath, _transcodedRelPath, ...out } = file;
  if (_transcodedRelPath && transcodedFiles.has(_transcodedRelPath)) {
    out.transcoded_url = `/transcoded/${_transcodedRelPath.split('/').map(encodeURIComponent).join('/')}`;
  }
  if (out.post_hint === 'gallery' && Array.isArray(out.items)) {
    out.items = out.items.map(item => {
      const { _relPath: ir, _transcodedRelPath: itp, ...itemOut } = item;
      if (itp && transcodedFiles.has(itp)) {
        itemOut.transcoded_url = `/transcoded/${itp.split('/').map(encodeURIComponent).join('/')}`;
      }
      return itemOut;
    });
  }
  return out;
}

// --- Thumbnail Generation ---
async function generateThumbnail(mediaPath, thumbPath, isVideo) {
  const args = isVideo
    ? ['-ss', '1', '-i', mediaPath, '-vframes', '1', '-vf', 'scale=640:-1', '-q:v', '5', '-f', 'image2', thumbPath, '-y']
    : ['-i', mediaPath, '-vf', 'scale=800:-1', '-q:v', '5', '-f', 'image2', thumbPath, '-y'];
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { timeout: 30000 }, (err) => err ? reject(err) : resolve());
  });
}

app.use('/api/thumbnail', async (req, res) => {
  if (req.method !== 'GET') { res.status(405).end(); return; }
  try {
    const relPath = req.path.slice(1); // strip leading '/', already URL-decoded by Express
    if (!relPath) { res.status(400).end(); return; }

    const mediaPath = path.resolve(PHOTOS_DIR, relPath);
    const base = PHOTOS_DIR.endsWith(path.sep) ? PHOTOS_DIR : PHOTOS_DIR + path.sep;
    if (!mediaPath.startsWith(base)) { res.status(403).end(); return; }

    const thumbPath = path.join(THUMBNAILS_DIR, relPath + '.jpg');

    // Serve from cache
    try { await fs.access(thumbPath); res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); return res.sendFile(thumbPath); } catch {}

    // Ensure source exists
    try { await fs.access(mediaPath); } catch { res.status(404).end(); return; }

    const isVideo = videoExts.test(relPath);
    const isImage = imageExts.test(relPath) && !/\.svg$/i.test(relPath);
    if (!isVideo && !isImage) { res.status(400).end(); return; }

    // Deduplicate concurrent requests for the same thumbnail
    if (!pendingThumbnails.has(thumbPath)) {
      const p = (async () => {
        await fs.mkdir(path.dirname(thumbPath), { recursive: true });
        await generateThumbnail(mediaPath, thumbPath, isVideo);
      })();
      pendingThumbnails.set(thumbPath, p);
      p.finally(() => pendingThumbnails.delete(thumbPath));
    }
    await pendingThumbnails.get(thumbPath);

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(thumbPath);
  } catch (err) {
    console.error('Thumbnail error:', err.message);
    res.status(500).end();
  }
});

// Serve transcoded files with long-lived caching
app.use('/api/transcoded', express.static(TRANSCODED_DIR, {
  setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'),
}));

app.get('/api/transcode-status', (req, res) => {
  const totalVideos = globalFileCache.reduce((n, f) => {
    if (f.post_hint === 'video') return n + 1;
    if (f.post_hint === 'gallery') return n + (f.items || []).filter(i => i.post_hint === 'video').length;
    return n;
  }, 0);
  res.json({ done: transcodedFiles.size, queued: transcodeQueue.length, active: activeTranscodes, total: totalVideos });
});

// --- API Route ---
app.get('/api/media', async (req, res) => {
  try {
    const limit = 50;
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
        processedFiles.sort((a, b) => b.modified_utc - a.modified_utc);
      } else if (sort === 'modified') {
        processedFiles.sort((a, b) => b.modified_utc - a.modified_utc);
      } else {
        processedFiles.sort((a, b) => a.title.localeCompare(b.title));
      }

      // Store in LRU-like cache (simple cleanup strategy could be added)
      if (queryCache.size > 100) queryCache.clear(); // Simple preventive clear
      queryCache.set(cacheKey, processedFiles);
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const files = processedFiles.slice(startIndex, endIndex).map(buildClientFile);
    const hasMore = endIndex < processedFiles.length;

    res.json({
      data: {
        children: files,
        after: hasMore,
      }
    });
  } catch (error) {
    console.error("Error in /api/media route:", error);
    res.status(500).json({ error: "Failed to retrieve media." });
  }
});

app.get('/api/refresh', async (req, res) => {
  try {
    await updateFileCache();
    res.json({ message: 'Cache updated successfully', count: globalFileCache.length });
  } catch (error) {
    console.error("Error in /api/refresh:", error);
    res.status(500).json({ error: 'Failed to update cache' });
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

  // Start watching for changes
  startWatcher();

  // Start background transcoding queue (does not block server startup)
  initTranscoding().catch(err => console.error('initTranscoding error:', err));

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

