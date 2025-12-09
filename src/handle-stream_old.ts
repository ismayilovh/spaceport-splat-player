// import { Splat } from './splat';
// import { Events } from './events';


// // types.ts
//  interface FrameInfo {
//   frame: number;
//   offset: number;
//   size: number;
// }

//  interface Segment {
//   file: string;
//   startFrame: number;
//   endFrame: number;
//   frames: FrameInfo[];
// }

//  interface MetadataResponse {
//   segments: Segment[];
//   totalFrames: number;
//   totalSegments: number;
//   framesPerSegment: number;
//   fps: number;
//   cdnBaseUrl: string;
// }

// // videoPlayer.ts
// // import type { Segment, MetadataResponse, FrameInfo } from './types';

// export class VideoPlayer {
//   private readonly METADATA_URL = '/metadata';
//   private readonly BUFFER_SIZE = 3;

//   // State
//   private currentFrame = 0;
//   private totalFrames = 0;
//   private totalSegments = 0;
//   private framesPerSegment = 0;
//   private isPlaying = false;
//   private frameBuffer = new Map<number, any>();
//   private segmentIndex: Segment[] = [];
//   private cdnBaseUrl = '';
//   private fps = 30;
//   private playbackInterval: NodeJS.Timeout | null = null;
//   private abortController: AbortController | null = null;
//   private BATCH_SIZE = 30;
//   private currentBatchStart = 0;
//   private loadingNextBatch = false;
//   private segmentBlobCache = new Map<string, Blob>();
//   private batchUpdateHandler: (() => void) | null = null;

//   // DOM elements
//   private playBtn: HTMLElement | null;
//   private pauseBtn: HTMLElement | null;

//   // External dependencies (passed in constructor)
// //   private app: any;
// //   private player: any;
// //   private playerRoot: any;
// //   private pc: any;

//   constructor(
    
//     playBtnId = 'playBtn',
//     pauseBtnId = 'pauseBtn'
//   ) {

    
//     this.playBtn = document.getElementById(playBtnId);
//     this.pauseBtn = document.getElementById(pauseBtnId);

//     this.initialize();
//   }

//   private initialize(): void {
//     if (this.playBtn) {
//       this.playBtn.addEventListener('click', () => this.startPlayback());
//     }
//     if (this.pauseBtn) {
//       this.pauseBtn.addEventListener('click', () => this.stopPlayback());
//     }

//     console.log('🚀 Starting...', 'info');
//     this.loadMetadata();
//   }

//   // Find which segment contains a frame
//   private findSegmentForFrame(frameNum: number): Segment | null {
//     for (const segment of this.segmentIndex) {
//       if (frameNum >= segment.startFrame && frameNum <= segment.endFrame) {
//         return segment;
//       }
//     }
//     return null;
//   }

//   // Load metadata
//   private async loadMetadata(): Promise<void> {
//     try {
//       console.log('📡 Loading metadata...', 'info');
//       const response = await fetch(this.METADATA_URL);

//       if (!response.ok) {
//         throw new Error(`HTTP ${response.status}`);
//       }

//       const data: MetadataResponse = await response.json();

//       this.segmentIndex = data.segments;
//       this.totalFrames = data.totalFrames;
//       this.totalSegments = data.totalSegments;
//       this.framesPerSegment = data.framesPerSegment;
//       this.fps = data.fps;
//       this.cdnBaseUrl = data.cdnBaseUrl;
//     } catch (error) {
//       const errorMessage = error instanceof Error ? error.message : 'Unknown error';
//       console.error(`❌ Failed: ${errorMessage}`);
//     }
//   }

//   private async fetchSegmentBlob(segmentUrl: string): Promise<Blob> {
//     if (this.segmentBlobCache.has(segmentUrl)) {
//       return this.segmentBlobCache.get(segmentUrl)!;
//     }

//     const resp = await fetch(segmentUrl);
//     if (!resp.ok) throw new Error(`Segment fetch failed: ${resp.status}`);
    
//     const segBlob = await resp.blob();
//     this.segmentBlobCache.set(segmentUrl, segBlob);
//     return segBlob;
//   }

//   private makeURLFromSegmentBlob(
//     segBlob: Blob,
//     frameInfo: FrameInfo,
//     frameNum: number
//   ): any {
//     const start = frameInfo.offset;
//     const end = start + frameInfo.size;
//     const frameBlob = segBlob.slice(start, end, 'application/octet-stream');

//     const assetName = `splat_abs_${String(frameNum).padStart(6, '0')}`;
//     const url = URL.createObjectURL(frameBlob);
//     // const asset = new this.pc.Asset(assetName, 'gsplat', { url });
//     // asset._blobUrl = url;
//     // this.app.assets.add(asset);
//     return url;
//   }

//   private async preloadBatchUsingSegmentSlice(startFrame: number): Promise<any[]> {
//     const batchURLs: any[] = [];
//     const groups = new Map<string, number[]>();

//     for (let i = 0; i < this.BATCH_SIZE; i++) {
//       const frameNum = startFrame + i;
      
//       if (frameNum >= this.totalFrames) {
//         this.BATCH_SIZE = i + 4;
//         break;
//       }
      
//       const seg = this.findSegmentForFrame(frameNum);
//       if (!seg) continue;
      
//       if (!groups.has(seg.file)) {
//         groups.set(seg.file, []);
//       }
//       groups.get(seg.file)!.push(frameNum);
//     }

//     for (const [segFile, frameNums] of groups) {
//       const segUrl = `${this.cdnBaseUrl}/segments/${segFile}`;
//       const segBlob = await this.fetchSegmentBlob(segUrl);
      
//       for (const frameNum of frameNums) {
//         const seg = this.findSegmentForFrame(frameNum);
//         if (!seg) continue;
        
//         const fInfo = seg.frames.find((f: { frame: number; }) => f.frame === frameNum);
//         if (!fInfo) continue;
        
//         const url = this.makeURLFromSegmentBlob(segBlob, fInfo, frameNum);
//         batchURLs.push(url);
//       }
//     }

//     return batchURLs;
//   }

 

//   public async startPlayback(): Promise<void> {

//     // Load and append first batch
//     const firstBatch = await this.preloadBatchUsingSegmentSlice(this.currentBatchStart);
//     // await this.player.appendFrames(firstBatch);

//     // Enable player and hide loading UI
//     // this.playerRoot.enabled = true;
//     const el = document.getElementById('loading');
//     if (el) el.style.display = 'none';
//     this.isPlaying = true;

//     this.batchUpdateHandler = () => {
//       if (!this.isPlaying) return;

//     //   const currentFrame = this.player.currentFrameAbsolute;

//       const loadAndAppendNextBatch = async (nextBatchStart: number) => {
//         try {
//           if (!this.isPlaying) return;
          
//           const t1 = performance.now();
//           const batchURLs = await this.preloadBatchUsingSegmentSlice(nextBatchStart);
//           console.log('preload segments duration:', performance.now() - t1);
          
//           if (!batchURLs || batchURLs.length === 0) {
//             return;
//           }

//         //   if (!this.player || typeof this.player.appendFrames !== 'function') {
//         //     console.error('player.appendFrames is not available');
//         //     return;
//         //   }

//         //   await this.player.appendFrames(batchAssets);
//           this.currentBatchStart = nextBatchStart;
//           console.log(this.currentBatchStart);
//         } catch (err) {
//           console.error('Error loading/appending batch', err);
//         } finally {
//           this.loadingNextBatch = false;
//         }
//       };

//       const preloadLead = 10;

//       if (
//         !this.loadingNextBatch 
//         // && currentFrame >= this.currentBatchStart + this.BATCH_SIZE - preloadLead
//     ) {
//         this.loadingNextBatch = true;
//         let nextBatchStart = 0;

//         if (this.currentBatchStart + this.BATCH_SIZE >= this.totalFrames) {
//           this.stopPlayback();
//         } else {
//           nextBatchStart = this.currentBatchStart + this.BATCH_SIZE;
//           loadAndAppendNextBatch(nextBatchStart);
//         }
//       }
//     };

//   }

//   public stopPlayback(): void {
//     if (!this.isPlaying) return;

//     this.isPlaying = false;

//     // Abort any ongoing fetches
//     if (this.abortController) {
//       this.abortController.abort();
//       this.abortController = null;
//     }

//     if (this.batchUpdateHandler) {
//       this.batchUpdateHandler = null;
//     }

//     // Optionally disable player visuals

//     console.log('⏸️ Paused', 'info');
//   }

//   // Public getters for state
//   public get playing(): boolean {
//     return this.isPlaying;
//   }

//   public get currentFrameNumber(): number {
//     return this.currentFrame;
//   }

//   public get totalFrameCount(): number {
//     return this.totalFrames;
//   }

//   // Cleanup method
//   public destroy(): void {
//     this.stopPlayback();
    
//     if (this.playBtn) {
//       this.playBtn.removeEventListener('click', () => this.startPlayback());
//     }
//     if (this.pauseBtn) {
//       this.pauseBtn.removeEventListener('click', () => this.stopPlayback());
//     }

//     this.frameBuffer.clear();
//     this.segmentBlobCache.clear();
//   }
// }

// // Usage example:
// // const videoPlayer = new VideoPlayer(app, player, playerRoot, pc);



// import { Splat } from './splat';
import { Events } from './events';
// import { Scene } from './scene';

// types.ts
interface FrameInfo {
  frame: number;
  offset: number;
  size: number;
}

interface Segment {
  file: string;
  startFrame: number;
  endFrame: number;
  frames: FrameInfo[];
}

interface MetadataResponse {
  segments: Segment[];
  totalFrames: number;
  totalSegments: number;
  framesPerSegment: number;
  fps: number;
  cdnBaseUrl: string;
}

// videoPlayer.ts
export const registerCreateVideoPlayer = ( events: Events,
  playBtnId: string = 'playBtn',
  pauseBtnId: string = 'pauseBtn'
) => {
  // Constants
  const METADATA_URL = '/metadata';
  const BUFFER_SIZE = 3;

  // State
  let currentFrame = 0;
  let totalFrames = 0;
  let totalSegments = 0;
  let framesPerSegment = 0;
  let isPlaying = false;
  let frameBuffer = new Map<number, any>();
  let segmentIndex: Segment[] = [];
  let cdnBaseUrl = '';
  let fps = 30;
  let playbackInterval: NodeJS.Timeout | null = null;
  let abortController: AbortController | null = null;
  let BATCH_SIZE = 30;
  let currentBatchStart = 0;
  let loadingNextBatch = false;
  let segmentBlobCache = new Map<string, Blob>();
  let segmentArrayBufferCache = new Map<string, ArrayBuffer>();

  let batchUpdateHandler: (() => void) | null = null;

  // DOM elements
  const playBtn = document.getElementById(playBtnId);
  const pauseBtn = document.getElementById(pauseBtnId);
  

  // Find which segment contains a frame
  const findSegmentForFrame = (frameNum: number): Segment | null => {
    for (const segment of segmentIndex) {
      if (frameNum >= segment.startFrame && frameNum <= segment.endFrame) {
        return segment;
      }
    }
    return null;
  };
 
  // Load metadata
  const loadMetadata = async (): Promise<void> => {
    try {
      console.log('📡 Loading metadata...', 'info');
      const response = await fetch(METADATA_URL);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: MetadataResponse = await response.json();

      segmentIndex = data.segments;
      totalFrames = data.totalFrames;
      totalSegments = data.totalSegments;
      framesPerSegment = data.framesPerSegment;
      fps = data.fps;
      cdnBaseUrl = data.cdnBaseUrl;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed: ${errorMessage}`);
    }
  };

  const fetchSegmentBlob = async (segmentUrl: string): Promise<Blob> => {
    if (segmentBlobCache.has(segmentUrl)) {
      return segmentBlobCache.get(segmentUrl)!;
    }

    const resp = await fetch(segmentUrl);
    if (!resp.ok) throw new Error(`Segment fetch failed: ${resp.status}`);
    // return resp;
    const segBlob = await resp.blob();
    segmentBlobCache.set(segmentUrl, segBlob);
    return segBlob;
  };

   const fetchSegmentArrayBuffer = async (segmentUrl: string): Promise<ArrayBuffer> => {
    if (segmentArrayBufferCache.has(segmentUrl)) {
      return segmentArrayBufferCache.get(segmentUrl)!;
    }

    const resp = await fetch(segmentUrl);
    if (!resp.ok) throw new Error(`Segment fetch failed: ${resp.status}`);
    // return resp;
    const segArrayBuffer = await resp.arrayBuffer();
    segmentArrayBufferCache.set(segmentUrl, segArrayBuffer);
    return segArrayBuffer;
  };

  const makeUrlFromSegmentBlob = (
    segBlob: Blob,
    frameInfo: FrameInfo,
  ): any => {
    const start = frameInfo.offset;
    const end = start + frameInfo.size;
    const frameBlob = segBlob.slice(start, end, 'application/octet-stream');
    // const size = frameBlob.size;
    // console.log("size1:", size);
    // const response =  new Response(frameBlob);  
    // return response;
    const url = URL.createObjectURL(frameBlob);
    return url;
  };

  const makeArrayFromSegmentArrayBuffer = (
    resp: ArrayBuffer,
    frameInfo: FrameInfo,
  ): any => {
    const start = frameInfo.offset;
    const end = start + frameInfo.size;
    const frame = resp.slice(start, end);

    return frame;
  };

  const preloadBatchUsingSegmentSlice = async (startFrame: number): Promise<any[]> => {
    const batchUrls: any[] = [];
    // const batchArryBuffers: ArrayBuffer[] = [];
    const groups = new Map<string, number[]>();

    for (let i = 0; i < BATCH_SIZE; i++) {
      const frameNum = startFrame + i;
      
      if (frameNum >= totalFrames) {
        BATCH_SIZE = i + 4;
        break;
      }
      
      const seg = findSegmentForFrame(frameNum);
      if (!seg) continue;
      
      if (!groups.has(seg.file)) {
        groups.set(seg.file, []);
      }
      groups.get(seg.file)!.push(frameNum);
    }

    for (const [segFile, frameNums] of groups) {
      const segUrl = `${cdnBaseUrl}/segments/${segFile}`;
      const segBlob = await fetchSegmentBlob(segUrl);
      // const resp = await fetchSegmentArrayBuffer(segUrl);

      for (const frameNum of frameNums) {
        const seg = findSegmentForFrame(frameNum);
        if (!seg) continue;
        
        const fInfo = seg.frames.find((f: { frame: number; }) => f.frame === frameNum);
        if (!fInfo) continue;
        
        const url = makeUrlFromSegmentBlob(segBlob, fInfo);
        // const arrayBuf = makeArrayFromSegmentArrayBuffer(resp, fInfo)
        
        // batchArryBuffers.push(arrayBuf);
        batchUrls.push(url)
      }
    }
    
    return batchUrls ;//batchArryBuffers;
  };

  const startPlayback = async (): Promise<void> => {
    // Load and append first batch
    const firstBatchResponses = await preloadBatchUsingSegmentSlice(currentBatchStart);
     events.fire('plysequence.setFrames2', firstBatchResponses);
      events.fire('timeline.frame2', 0);
    // // console.log("size2", size)
    // const repeatProcess = () => {
   

      if (events.invoke('timeline.playing')) {
        events.fire('timeline.setPlaying2', false);
      } else {
        events.fire('timeline.setPlaying2', true);
      }
    // }
    
    // for (let i = 0; i < 5; i++) {
    //       repeatProcess()

    // }
    // Enable player and hide loading UI
    const el = document.getElementById('loading');
    if (el) el.style.display = 'none';
    isPlaying = true;

    batchUpdateHandler = () => {
      if (!isPlaying) return;

      const loadAndAppendNextBatch = async (nextBatchStart: number) => {
        try {
          if (!isPlaying) return;
          
          const t1 = performance.now();
          const batchURLs = await preloadBatchUsingSegmentSlice(nextBatchStart);
          console.log('preload segments duration:', performance.now() - t1);
          
          if (!batchURLs || batchURLs.length === 0) {
            return;
          }

          currentBatchStart = nextBatchStart;
          console.log(currentBatchStart);
        } catch (err) {
          console.error('Error loading/appending batch', err);
        } finally {
          loadingNextBatch = false;
        }
      };

      const preloadLead = 10;

      if (!loadingNextBatch) {
        loadingNextBatch = true;
        let nextBatchStart = 0;

        if (currentBatchStart + BATCH_SIZE >= totalFrames) {
          stopPlayback();
        } else {
          nextBatchStart = currentBatchStart + BATCH_SIZE;
          loadAndAppendNextBatch(nextBatchStart);
        }
      }
    };
  };

  const stopPlayback = async (): Promise<void> => {
   

    // if (!isPlaying) return;

    isPlaying = false;

    // Abort any ongoing fetches
    if (abortController) {
      abortController.abort();
      abortController = null;
    }

    if (batchUpdateHandler) {
      batchUpdateHandler = null;
    }

    console.log('⏸️ Paused', 'info');
  };

  const destroy = (): void => {
    stopPlayback();
    
    if (playBtn) {
      playBtn.removeEventListener('click', startPlayback);
    }
    if (pauseBtn) {
      pauseBtn.removeEventListener('click', stopPlayback);
    }

    frameBuffer.clear();
    segmentBlobCache.clear();
  };

  // Initialize
  const initialize = (): void => {
    if (playBtn) {
      playBtn.addEventListener('click', startPlayback);
    }
    if (pauseBtn) {
      pauseBtn.addEventListener('click', stopPlayback);
    }

    console.log('🚀 Starting...', 'info');
    loadMetadata();
  };

  playBtn.addEventListener('click', startPlayback);
  pauseBtn.addEventListener('click', stopPlayback);
  // Initialize on creation
  initialize();

  // Return public API
  return {
    startPlayback,
    stopPlayback,
    destroy,
    get playing() {
      return isPlaying;
    },
    get currentFrameNumber() {
      return currentFrame;
    },
    get totalFrameCount() {
      return totalFrames;
    }
  };
};

// Usage example:
// const videoPlayer = createVideoPlayer();