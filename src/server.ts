// import http, { IncomingMessage, ServerResponse } from 'http';
import * as http from 'http';  

// import fs from 'fs';
// import path from 'path';
import * as fs from 'fs';  
import * as path from 'path'; 
import * as os from 'os';

interface FrameInfo {
  frame: number;
  offset: number;
  size: number;
  filename: string;
}

interface Segment {
  segment: number;
  file: string;
  startFrame: number;
  endFrame: number;
  frameCount: number;
  size: number;
  frames: FrameInfo[];
}

interface IndexData {
  version: number;
  totalFrames: number;
  totalSegments: number;
  cdnUrl:string;
  framesPerSegment: number;
  fps: number;
  segments: Segment[];
}

// Parse command-line arguments
const args = process.argv.slice(2);
let CDN_BASE_URL: string | null = null;
let BUILD_MODE = false;
let FRAMES_PER_SEGMENT = 30;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--cdn' && args[i + 1]) {
    CDN_BASE_URL = args[i + 1];
    i++;
  } else if (args[i] === '--build') {
    BUILD_MODE = true;
  } else if (args[i] === '--frames-per-segment' && args[i + 1]) {
    FRAMES_PER_SEGMENT = parseInt(args[i + 1], 10);
    i++;
  }
}

// Configuration
const FILE_SERVER_PORT = 8081;
const SPLAT_DIR = './gs_ply_files/2025-11-12_15-54-35_sinem_kostum_1_1_50-1850_90';
const SEGMENTS_DIR = 'segments_sinem_1_1';
const INDEX_FILE = './segments.index.json';

// Serve the built frontend from dist/


const SRC_DIR = path.join(process.cwd(), 'src');  
const DIST_DIR = path.join(process.cwd(), 'dist');  
const VIEWER_FILE = path.join(SRC_DIR, 'index.html');  
CDN_BASE_URL = "https://d223v4e7dt6i6.cloudfront.net"
// Determine if using CDN
const USE_CDN = CDN_BASE_URL !== null;
if (!USE_CDN) {
  CDN_BASE_URL = `http://localhost:${FILE_SERVER_PORT}`;
}

// State
let segmentIndex: Segment[] = [];
let totalFrames = 0;
let totalSegments = 0;
let fps = 30;

// Build segmented files from individual splats
async function buildSegmentedFiles(): Promise<void> {
  console.log('🔨 Building segmented splat files...');
  console.log(`📦 Frames per segment: ${FRAMES_PER_SEGMENT}`);
  console.log('═══════════════════════════════════════════');

  if (!fs.existsSync(SPLAT_DIR)) {
    console.error(`❌ Directory not found: ${SPLAT_DIR}`);
    process.exit(1);
  }

  // Create segments directory
  if (!fs.existsSync(SEGMENTS_DIR)) {
    fs.mkdirSync(SEGMENTS_DIR);
    console.log(`📁 Created ${SEGMENTS_DIR}/`);
  }

 

  const regex = /(.*?)(\d+)(?:\.compressed)?\.ply$/;

      // sort frames by trailing number, if it exists
  const sorter = (a: string, b: string) => {
      const avalue = a?.toLowerCase().match(regex)?.[2];
      const bvalue = b?.toLowerCase().match(regex)?.[2];
      return (avalue && bvalue) ? parseInt(avalue, 10) - parseInt(bvalue, 10) : 0;
  };

   const splatFiles = fs
    .readdirSync(SPLAT_DIR)
    .filter((file) => file.endsWith('compressed.ply'))
    .sort(sorter);


  if (splatFiles.length === 0) {
    console.error('❌ No .ply files found');
    process.exit(1);
  }

  console.log(`📁 Found ${splatFiles.length} ply files`);

  const segments: Segment[] = [];
  let currentSegment = 0;
  let framesInCurrentSegment = 0;
  let currentOffset = 0;
  let writeStream: fs.WriteStream | null = null;
  let segmentFrames: FrameInfo[] = [];

  for (let i = 0; i < splatFiles.length; i++) {
    // Start new segment if needed
    if (framesInCurrentSegment === 0) {
      const segmentFile = path.join(SEGMENTS_DIR, `segment_${currentSegment}.bin`);
      writeStream = fs.createWriteStream(segmentFile);

      currentOffset = 0;
      segmentFrames = [];
      console.log(`📦 Creating segment ${currentSegment}...`);
    }

    const filePath = path.join(SPLAT_DIR, splatFiles[i]);
    const fileData = fs.readFileSync(filePath);
    const size = fileData.length;

    // Write to current segment
    writeStream!.write(fileData);

    // Add frame info
    segmentFrames.push({
      frame: i,
      offset: currentOffset,
      size,
      filename: splatFiles[i],
    });

    currentOffset += size;
    framesInCurrentSegment++;

    // Close segment if full or last frame
    const isLastFrame = i === splatFiles.length - 1;
    if (framesInCurrentSegment === FRAMES_PER_SEGMENT || isLastFrame) {
      await new Promise<void>((resolve, reject) => {
        writeStream!.end(() => {
          const segmentFile = `segment_${currentSegment}.bin`;
          console.log(
            `  ✅ ${segmentFile}: ${framesInCurrentSegment} frames (${(currentOffset / 1024 / 1024).toFixed(
              2,
            )} MB)`,
          );

          segments.push({
            segment: currentSegment,
            file: segmentFile,
            startFrame: i - framesInCurrentSegment + 1,
            endFrame: i,
            frameCount: framesInCurrentSegment,
            size: currentOffset,
            frames: segmentFrames,
          });

          resolve();
        });
        writeStream!.on('error', reject);
      });

      currentSegment++;
      framesInCurrentSegment = 0;
    }
  }

  // Write index file
  const indexData: IndexData = {
    version: 1,
    totalFrames: splatFiles.length,
    totalSegments: segments.length,
    cdnUrl: `${CDN_BASE_URL}/${SEGMENTS_DIR}`,
    framesPerSegment: FRAMES_PER_SEGMENT,
    fps,
    segments,
  };

  fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2));

  console.log(`✅ Created ${segments.length} segments`);
  console.log(`✅ Created ${INDEX_FILE}`);
  console.log('═══════════════════════════════════════════');
}

// Load index
function loadIndex(): void {
  if (!fs.existsSync(INDEX_FILE)) {
    console.error(`❌ Index file not found: ${INDEX_FILE}`);
    console.error(`💡 Run with --build flag to create segments:`);
    console.error(`   tsx server.ts --build`);
    process.exit(1);
  }

  try {
    const indexData: IndexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    segmentIndex = indexData.segments;
    totalFrames = indexData.totalFrames;
    totalSegments = indexData.totalSegments;
    fps = indexData.fps;

    console.log(`✅ Loaded index: ${totalFrames} frames in ${totalSegments} segments`);
  } catch (error: any) {
    console.error(`❌ Failed to load index: ${error.message}`);
    process.exit(1);
  }
}

// File Server
function startFileServer(): void {
  const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (!req.url) {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }

    const urlPath = req.url.split('?')[0];

    // Serve viewer at root
    if (urlPath === '/' || urlPath === '/viewer' || urlPath === '/index.html') {
      if (fs.existsSync(VIEWER_FILE)) {
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
        });
        const stream = fs.createReadStream(VIEWER_FILE);

        stream.on('error', (err) => {
          console.error(`Error reading file stream for ${VIEWER_FILE}:`, err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal server error during file stream.');
          } else {
            res.end();
          }
        });
        stream.pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
          <head><title>Viewer Not Found</title></head>
          <body style="font-family: Arial; padding: 40px;">
              <h1>❌ Viewer Not Found</h1>
              <p>Build the frontend first: <code>npm run build</code></p>
              <p>Looking for: <code>${VIEWER_FILE}</code></p>
          </body>
          </html>
        `);
      }
      return;
    }

    // Serve metadata endpoint
    if (urlPath === '/metadata' || urlPath === '/index.json') {
      const protocol = (req.socket as any).encrypted ? 'https' : 'http';
      const host = req.headers.host || `localhost:${FILE_SERVER_PORT}`;
      const requestOrigin = `${protocol}://${host}`;

      const computedBase = USE_CDN ? CDN_BASE_URL! : requestOrigin;
      console.log("base",computedBase )

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify(
          {
            totalFrames,
            totalSegments,
            fps,
            cdnUrl: `${computedBase}/${SEGMENTS_DIR}`,
            mode: USE_CDN ? 'cdn' : 'local',
            segments: segmentIndex,
          },
          null,
          2,
        ),
      );
      return;
    }
    // Serve segment files with Range support
    if (urlPath.startsWith(`/${SEGMENTS_DIR}/segment_`)) {
        // console.log("urlpath:", urlPath)

      if (USE_CDN) {
            // Serve segment files with Range support
        // console.log("urlpath inside:", urlPath)

        const segmentFile = path.basename(urlPath);
        res.writeHead(302, { Location: `${CDN_BASE_URL}/${SEGMENTS_DIR}/${segmentFile}` });
        res.end();
        return;
      }

      const fileName = path.basename(urlPath);
      const filePath = path.join(SEGMENTS_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Segment not found' }));
        return;
      }

      try {
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunkSize = end - start + 1;

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000',
          });

          const stream = fs.createReadStream(filePath, { start, end });
          stream.pipe(res);
        } else {
          // Full file
          res.writeHead(200, {
            'Content-Length': fileSize,
            'Accept-Ranges': 'bytes',
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000',
          });
          fs.createReadStream(filePath).pipe(res);
        }
      } catch (error: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    // Serve static files from dist/ (JS, CSS, images, etc.)
    const staticFilePath = path.join(DIST_DIR, req.url);
    if (fs.existsSync(staticFilePath) && fs.statSync(staticFilePath).isFile()) {
      const ext = path.extname(staticFilePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.js': 'application/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.wasm': 'application/wasm',
        '.map': 'application/json',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      res.writeHead(200, { 
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(staticFilePath).pipe(res);
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
      <head><title>404 Not Found</title></head>
      <body style="font-family: Arial; padding: 40px;">
          <h1>404 - Not Found</h1>
          <p>Requested: <code>${req.url}</code></p>
          <p>Available endpoints:</p>
          <ul>
              <li><a href="/">🎬 Viewer</a></li>
              <li><a href="/metadata">📊 Metadata (JSON)</a></li>
          </ul>
      </body>
      </html>
    `);
  });

  function printLanAddresses(port: number): void {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      const ifaceList = ifaces[name];
      if (!ifaceList) continue;
      for (const iface of ifaceList) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`➡️  Server listening: http://${iface.address}:${port}/`);
        }
      }
    }
  }

  server.listen(FILE_SERVER_PORT, () => {
    // console.log(`🎬 Viewer: http://localhost:${FILE_SERVER_PORT}/`);
    // console.log(`📊 Metadata: http://localhost:${FILE_SERVER_PORT}/metadata`);
    printLanAddresses(FILE_SERVER_PORT);
  });
}

// Display usage
function showUsage(): void {
  console.log(`
🎬 Splat Stream Server (Segmented Mode)

Usage:
  tsx server.ts [options]

Options:
  --build                    Build segments from individual splats
  --frames-per-segment <n>   Frames per segment (default: 30)
  --cdn <url>                Use external CDN

Examples:
  # Build with 30 frames per segment
  tsx server.ts --build

  # Build with 50 frames per segment
  tsx server.ts --build --frames-per-segment 50

  # Run server (local)
  tsx server.ts

  # Run with CDN
  tsx server.ts --cdn https://cdn.example.com

Files:
  Input:  ${SPLAT_DIR}/*.ply (individual files)
  Output: ${SEGMENTS_DIR}/segment_0.bin, segment_1.bin, ...
          ${INDEX_FILE} (segment index)
  Frontend: ${DIST_DIR}/ (built frontend files)

Notes:
  - Segments are streamed one by one
  - Progressive loading - can start playing immediately
  - Better for large datasets
  - Serves frontend from dist/ directory
    `);
}

// Check for help flag
if (args.includes('--help') || args.includes('-h')) {
  showUsage();
  process.exit(0);
}

// Main
console.log();
console.log('🎬 Splat Stream Server (Segmented)');
console.log('═══════════════════════════════════════════');

if (BUILD_MODE) {
  buildSegmentedFiles()
    .then(() => {
      console.log();
      console.log('✅ Build complete! Now run without --build to start server.');
      process.exit(0);
    })
    .catch((error) => {
      console.error(`❌ Build failed: ${error.message}`);
      process.exit(1);
    });
} else {
  loadIndex();

  if (USE_CDN) {
    console.log(`🌍 Mode: CDN`);
    console.log(`🔗 CDN URL: ${CDN_BASE_URL}`);
  } else {
    console.log(`📁 Mode: Local`);
  }
  console.log(`📂 Serving frontend from: ${DIST_DIR}`);
  console.log('═══════════════════════════════════════════');

  startFileServer();
  console.log();
  console.log('✅ Server running!');
  console.log();
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  process.exit(0);
});