import * as pc from 'playcanvas';
// import { CameraControls } from './node_modules/playcanvas/scripts/esm/camera-controls.mjs'

import {GSplatFramePlayerDoubleBuffer} from './gsplatFramePlayerDoubleBuffer.esm.js';
const canvas = document.getElementById('application');
const app = new pc.Application(canvas, {
    graphicsDeviceOptions: { antialias: false }
});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.start();


// const { CameraControls } = await fileImport(`${rootPath}/static/scripts/esm/camera-controls.mjs`);

window.addEventListener('resize', () => app.resizeCanvas());


// ---- 2. Camera + Orbit ----
const camera = new pc.Entity('Camera');
camera.addComponent('camera', { clearColor: new pc.Color(0.3, 0.3, 0.7) });
app.root.addChild(camera);

let target = new pc.Vec3(0, 0, 0);
let distance = 5, yaw = 0, pitch = 0;
const pitchMin = 0, pitchMax = 89 * Math.PI/180;
let dragging = false, lastX = 0, lastY = 0;

canvas.addEventListener('mousedown', e => {
    if (e.button === 0) { dragging = true; lastX = e.clientX; lastY = e.clientY; }
});
window.addEventListener('mouseup', () => dragging = false);
window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    yaw -= dx * 0.005; pitch -= dy * 0.005;
    pitch = Math.max(pitchMin, Math.min(pitchMax, pitch));
});
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    distance *= Math.pow(1.0 + 0.1, Math.sign(e.deltaY));
}, { passive: false });

app.on('update', () => {

    const x = target.x + distance * Math.cos(pitch) * Math.sin(yaw);
    const y = target.y + distance * Math.sin(pitch);
    const z = target.z + distance * Math.cos(pitch) * Math.cos(yaw);
    camera.setPosition(x, y, z);
    camera.lookAt(target);
});

// ---- 3. Light ----
const light = new pc.Entity('Light');
light.addComponent('light', { type: 'directional' });
light.setEulerAngles(45, 45, 0);
app.root.addChild(light);



const METADATA_URL = '/metadata';
const BUFFER_SIZE = 3;

// State
let currentFrame = 0;
let totalFrames = 0;
let totalSegments = 0;
let framesPerSegment = 0;
let isPlaying = false;
let frameBuffer = new Map();
let segmentIndex = [];
let cdnBaseUrl = '';
let fps = 30;
let playbackInterval = null;


const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');

    


// Find which segment contains a frame
function findSegmentForFrame(frameNum) {
    for (const segment of segmentIndex) {
        if (frameNum >= segment.startFrame && frameNum <= segment.endFrame) {
            return segment;
        }
    }
    return null;
}

// Load metadata
async function loadMetadata() {
    try {
        console.log('📡 Loading metadata...', 'info');
        const response = await fetch(METADATA_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        segmentIndex = data.segments;
        totalFrames = data.totalFrames;
        totalSegments = data.totalSegments;
        framesPerSegment =  data.framesPerSegment;
        fps = data.fps;
        cdnBaseUrl = data.cdnBaseUrl;
        
        
        
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
        // setStatus('error', 'Error');
    }
}
let abortController = null;  


let BATCH_SIZE = 30;
let currentBatchStart = 0;
let loadingNextBatch = false;


// segmentBlobCache: Map<segmentUrl, Blob>
const segmentBlobCache = new Map();

async function fetchSegmentBlob(segmentUrl) {
    
  if (segmentBlobCache.has(segmentUrl)) return segmentBlobCache.get(segmentUrl);
    // segmentUrl ='/segments/segment_0.bin'
  const resp = await fetch(segmentUrl);
  if (!resp.ok) throw new Error(`Segment fetch failed: ${resp.status}`);
  const segBlob = await resp.blob(); 
  segmentBlobCache.set(segmentUrl, segBlob);
  return segBlob;
}


    

function makeAssetFromSegmentBlob(segBlob, frameInfo, frameNum) {
  // frameInfo.offset (start), frameInfo.size
  const start = frameInfo.offset;
  const end = start + frameInfo.size; // Blob.slice end is exclusive
  const frameBlob = segBlob.slice(start, end, 'application/octet-stream');

  const assetName = `splat_abs_${String(frameNum).padStart(6, '0')}`;
  const url = URL.createObjectURL(frameBlob);
  const asset = new pc.Asset(assetName, 'gsplat', { url });
  asset._blobUrl = url;            // track to revoke later
  app.assets.add(asset);
  return asset;
}

async function preloadBatchUsingSegmentSlice(startFrame) {
  const batchAssets = [];
  const groups = new Map(); // segment.file -> frameNums[]
  BATCH_SIZE= 30;
  for (let i = 0; i < BATCH_SIZE; i++) {
    const frameNum = startFrame + i;
    // if (frameNum >= totalFrames) break;
    // console.log("framenum", frameNum)
    if (frameNum >= totalFrames) {
        BATCH_SIZE = i + 4;
        break ;
    }
    const seg = findSegmentForFrame(frameNum);
    if (!seg) continue;
    if (!groups.has(seg.file)) groups.set(seg.file, []);
    groups.get(seg.file).push(frameNum);
  }

  // fetch each segment only once, then create per-frame assets by slicing
  for (const [segFile, frameNums] of groups) {
    const segUrl = `${cdnBaseUrl}/segments/${segFile}`;
    const segBlob = await fetchSegmentBlob(segUrl);
    for (const frameNum of frameNums) {
      const seg = findSegmentForFrame(frameNum);
      const fInfo = seg.frames.find(f => f.frame === frameNum);
      if (!fInfo) continue;
      const asset = makeAssetFromSegmentBlob(segBlob, fInfo, frameNum);
      batchAssets.push(asset);
    }
  }

  return batchAssets;
}

// Preload frames
async function preloadFrames(startFrame) {
    const promises = [];
    
    for (let i = 0; i < BUFFER_SIZE; i++) {
        const frameNum = (startFrame + i) % totalFrames;
        
        if (frameBuffer.has(frameNum)) continue;
        promises.push(
            fetchFrame(frameNum).then(data => {
                if (data) {
                    console.log("framenum", frameNum);

                    frameBuffer.set(frameNum, data);
                    // updateUI();
                }
            })
        );
    }
    
    await Promise.allSettled(promises);
    
}

// Cleanup buffer
function cleanupBuffer(currentFrame) {
    const keep = new Set();
    for (let i = -1; i < BATCH_SIZE + 1; i++) {
        keep.add((currentFrame + i + totalFrames) % totalFrames);
    }
    
    for (const frameNum of frameBuffer.keys()) {
        // console.log("frameBuffer.keys()", frameBuffer.keys())
        if (!keep.has(frameNum)) {
            // console.log("deleting frame number:", frameNum)
            frameBuffer.delete(frameNum);
        }
    }
}



let batchUpdateHandler = null; // store reference to update callback  

async function startPlayback() {
  if (playerRoot.enabled) return; // already started

  // Load and append first batch
  const firstBatch = await preloadBatchUsingSegmentSlice(currentBatchStart);
  await player.appendFrames(firstBatch);

  // Enable player and hide loading UI
  playerRoot.enabled = true;
  const el = document.getElementById('loading');
  if (el) el.style.display = 'none';
  isPlaying = true;  
  
  batchUpdateHandler = () => {
    if (!isPlaying) return;

    // const currentFrame = player.i;
    const currentFrame = player.currentFrameAbsolute;           // absolute index  

    // cleanupBuffer(currentFrame);  
    // console.log(`[batch] currentFrame=${currentFrame}, currentBatchStart=${currentBatchStart}, loadingNextBatch=${loadingNextBatch}`);
    async function loadAndAppendNextBatch(nextBatchStart) {
        try {
            // avoid starting if playback stopped
            if (!isPlaying) return;
            const t1 = performance.now();
            const batchAssets = await preloadBatchUsingSegmentSlice(nextBatchStart);
            console.log("preload segments duration:", performance.now()-t1)
            if (!batchAssets || batchAssets.length === 0) {
            // nothing to append
            return;
            }

            // ensure appendFrames exists and is a function
            if (!player || typeof player.appendFrames !== 'function') {
            console.error('player.appendFrames is not available');
            return;
            }

            // appendFrames is async and returns a Promise; await it
            await player.appendFrames(batchAssets);

            // update bookkeeping
            currentBatchStart = nextBatchStart;
            console.log(currentBatchStart)
        } catch (err) {
            console.error('Error loading/appending batch', err);
        } finally {
            loadingNextBatch = false;
        }
    }

// usage inside update handler:
    // const preloadLead = Math.max(10, Math.floor(BATCH_SIZE * 0.4));  
    const preloadLead = 10// Math.max(10, Math.floor(BATCH_SIZE * 0.5));  

    if (!loadingNextBatch && (currentFrame >= currentBatchStart + BATCH_SIZE - preloadLead)) {
        loadingNextBatch = true;
        let nextBatchStart=0;
       
        if (currentBatchStart + BATCH_SIZE >= totalFrames ) {
        //  playerRoot.enabled = false;
        //   startPlayback()
            stopPlayback();
            
        }
        else
            nextBatchStart = (currentBatchStart + BATCH_SIZE) 
        loadAndAppendNextBatch(nextBatchStart); // fire-and-forget
    }

 
};



  app.on('update', batchUpdateHandler);

}



function stopPlayback() {
  if (!isPlaying) return;

  isPlaying = false;
  // Abort any ongoing fetches  
  if (abortController) {  
    abortController.abort();  
    abortController = null;  
  }   
  if (batchUpdateHandler) {
    app.off('update', batchUpdateHandler);
    batchUpdateHandler = null;
  }

  // Optionally disable player visuals
  playerRoot.enabled = false;
  app.off('update', player._onUpdate);  


  console.log('⏸️ Paused', 'info');
}

// Controls
playBtn.addEventListener('click', startPlayback);
pauseBtn.addEventListener('click', stopPlayback);

// progressBar.addEventListener('click', async (e) => {
//     const rect = progressBar.getBoundingClientRect();
//     const percent = (e.clientX - rect.left) / rect.width;
//     currentFrame = Math.floor(percent * totalFrames);
    
//     log(`⏩ Seek to frame ${currentFrame}`, 'info');
//     frameBuffer.clear();
//     await preloadFrames(currentFrame);
//     updateUI();
// });

// Initialize
console.log('🚀 Starting...', 'info');
loadMetadata();


function makeAsset(i, url) {
  const num = String(i).padStart(3,'0');
  // const a = new pc.Asset(`splat${num}`, 'gsplat', { url: `${PATH}/meta${num}.json` });
  const formatted_i = `${String(i).padStart(4, '0')}`
  const a = new pc.Asset(`splat${num}`, 'gsplat', {url:url})

  app.assets.add(a);
  return a;
}

// const frames = Array.from({ length: framesPerSegment }, (_, k) => makeAsset(k + 1, url));


// Parent entity for the player
const playerRoot = new pc.Entity('SOGSPlayer');
playerRoot.enabled = false; // only visible when first frame is ready
app.root.addChild(playerRoot);

// >>> Transform from PlayCanvas Editor (applies to all splats) <<<
// playerRoot.setPosition(-0.39, 1.45, 1.02);          // Position
// playerRoot.setEulerAngles(143.35, -15.95, -5.9);     // Rotation (degrees)
playerRoot.setLocalScale(1, 1, 1);                   // Scale
playerRoot.setPosition(0, 0.7, 0);
playerRoot.setEulerAngles(0, 0, 180);

// Start player – with windowed preload (25)
// const player = new GSplatFramePlayerDoubleBuffer(app, playerRoot, frames, {
//   fps: 30,
//   loop: true,
//   aabbSize: 10,
//   preloadWindow: 20,
//   preloadAll: true
// });


const player = new GSplatFramePlayerDoubleBuffer(app, playerRoot, [], {
  fps: 30,
  loop: true,
  aabbSize: 10,
  preloadWindow: 10,
  preloadAll: true,
  autoTrimBatchSize: BATCH_SIZE
});

// UI: enable visibility only when the first frame is loaded
// frames[0].ready(() => {
//   playerRoot.enabled = true;
//   const el = document.getElementById('loading');
//   if (el) el.style.display = 'none'; // Guard prevents "null.style"
// });

// Optional: if you maintain a progress bar, always use guards
// Example usage (if you calculate percent somewhere):
// const progressEl = document.getElementById('progress');
// if (progressEl) progressEl.style.width = percent + '%';
