import { Events } from "./events";

interface FrameInfo {
  frame: number;
  offset: number;
  size: number;
  filename: string;
}

interface SegmentInfo {
  segment: number;
  file: string;
  startFrame: number;
  endFrame: number;
  frameCount: number;
  size: number;
  frames: FrameInfo[];
}

interface Manifest {
  version: number;
  totalFrames: number;
  totalSegments: number;
  cdnUrl: string;
  framesPerSegment: number;
  fps: number;
  segments: SegmentInfo[];
}

interface SegmentData {
  blob: Blob;
  info: SegmentInfo;
  url: string; // object URL for the entire segment
  frameUrls: Map<number, string>; // object URLs for individual frames
}

type OnSegmentReadyCallback = (
  segmentNum: number, 
  segmentInfo: SegmentInfo, 
  segmentUrl: string,
  frameUrls: string[]
) => void;

class SegmentDownloader {
  private baseUrl: string;
  private manifest: Manifest;
  private segments: Map<number, SegmentData>;

  private maxCachedSegments: number ; // Configurable limit  

  constructor(baseUrl: string, manifest: Manifest) {
    this.baseUrl = baseUrl;
    this.manifest = manifest;
    this.segments = new Map<number, SegmentData>();
    this.maxCachedSegments = 5;  

  }
/**
   * Sequential download: one segment after another, in manifest order.
   * Calls onSegmentReady after each segment completes.
   */
  async downloadSequential(onSegmentReady?: OnSegmentReadyCallback): Promise<void> {
    for (const segmentInfo of this.manifest.segments) {
      // If already downloaded, just emit callback and continue
      if (this.segments.has(segmentInfo.segment)) {
        const seg = this.segments.get(segmentInfo.segment)!;
        const frameUrls = this.getSegmentFrames(segmentInfo.segment);
        console.log(`Segment ${segmentInfo.segment} already downloaded, skipping`);
        if (onSegmentReady) {
          onSegmentReady(segmentInfo.segment, segmentInfo, seg.url, frameUrls);
        }
        continue;
      }

      try {
        const url = await this.downloadSegment(segmentInfo);
        const frameUrls = this.getSegmentFrames(segmentInfo.segment);
        console.log(`Segment ${segmentInfo.segment} downloaded (sequential) with ${frameUrls.length} frames`);

        if (onSegmentReady) {
          onSegmentReady(segmentInfo.segment, segmentInfo, url, frameUrls);
        }
      } catch (err) {
        console.error(`Error downloading segment ${segmentInfo.segment}:`, err);
        // You can decide: break, continue, or rethrow
        throw err;
      }
    }
  }
  // Start downloading all segments (non-blocking)
  startDownloading(staggerDelay: number = 100, onSegmentReady?: OnSegmentReadyCallback): void {
    this.manifest.segments.forEach((segmentInfo, index) => {
      setTimeout(async () => {
        // Already downloaded?
        if (this.segments.has(segmentInfo.segment)) {
          const seg = this.segments.get(segmentInfo.segment)!;
          console.log(`Segment ${segmentInfo.segment} already downloaded, skipping`);
          if (onSegmentReady) {
            const frameUrls = this.getSegmentFrames(segmentInfo.segment);
            onSegmentReady(segmentInfo.segment, segmentInfo, seg.url, frameUrls);
          }
          return;
        }

        try {
          const url = await this.downloadSegment(segmentInfo);
          const frameUrls = this.getSegmentFrames(segmentInfo.segment);
          console.log(`Segment ${segmentInfo.segment} downloaded with ${frameUrls.length} frames`);

          if (onSegmentReady) {
            onSegmentReady(segmentInfo.segment, segmentInfo, url, frameUrls);
          }
        } catch (error) {
          console.error(`Error downloading segment ${segmentInfo.segment}:`, error);
        }
      }, index * staggerDelay);
    });
  }

  // Optional: wait for all segments
  async waitForAll(staggerDelay: number = 100, onSegmentReady?: OnSegmentReadyCallback): Promise<void> {
    const downloads = this.manifest.segments.map((segmentInfo, index) => {
      return new Promise<void>(resolve => {
        setTimeout(async () => {
          // Already downloaded?
          if (this.segments.has(segmentInfo.segment)) {
            const seg = this.segments.get(segmentInfo.segment)!;
            console.log(`Segment ${segmentInfo.segment} already downloaded, skipping`);
            if (onSegmentReady) {
              const frameUrls = this.getSegmentFrames(segmentInfo.segment);
              onSegmentReady(segmentInfo.segment, segmentInfo, seg.url, frameUrls);
            }
            resolve();
            return;
          }

          try {
            const url = await this.downloadSegment(segmentInfo);
            const frameUrls = this.getSegmentFrames(segmentInfo.segment);
            console.log(`Segment ${segmentInfo.segment} downloaded with ${frameUrls.length} frames`);

            if (onSegmentReady) {
              onSegmentReady(segmentInfo.segment, segmentInfo, url, frameUrls);
            }
          } catch (error) {
            console.error(`Error downloading segment ${segmentInfo.segment}:`, error);
          }

          resolve();
        }, index * staggerDelay);
      });
    });

    await Promise.all(downloads);
  }

  // Auto-cleanup old segments when limit exceeded
   cleanupOldSegments(keepSegment: number): void {
    if (this.segments.size <= this.maxCachedSegments) return;

    const segmentNumbers = Array.from(this.segments.keys());
    
    // Sort by distance from current segment
    segmentNumbers.sort((a, b) => 
      Math.abs(a - keepSegment) - Math.abs(b - keepSegment)
    );

    // Revoke segments beyond the limit
    const toRevoke = segmentNumbers.slice(this.maxCachedSegments);
    for (const segNum of toRevoke) {
      console.log(`Auto-revoking segment ${segNum}`);
      this.revokeSegmentUrls(segNum);
    }
  }

  /**
   * Download a single segment.
   * Returns an object URL string for that segment.
   * Also creates object URLs for all frames in the segment.
   */
  async downloadSegment(segmentInfo: SegmentInfo): Promise<string> {
    // If already downloaded, just return its URL
    if (this.segments.has(segmentInfo.segment)) {
      const existing = this.segments.get(segmentInfo.segment)!;
      console.log(`Segment ${segmentInfo.segment} already exists`);
      return existing.url;
    }


    const url = `${this.baseUrl}/${segmentInfo.file}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download ${segmentInfo.file} (status ${response.status})`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    // Create object URLs for all frames
    const frameUrls = new Map<number, string>();
    for (const frameInfo of segmentInfo.frames) {
      const frameBlob = blob.slice(
        frameInfo.offset,
        frameInfo.offset + frameInfo.size
      );
      const frameUrl = URL.createObjectURL(frameBlob);
      frameUrls.set(frameInfo.frame, frameUrl);
    }

    this.segments.set(segmentInfo.segment, {
      blob,
      info: segmentInfo,
      url: objectUrl,
      frameUrls
    });
    // this.cleanupOldSegments(segmentInfo.segment);  

    return objectUrl;
  }

  /**
   * Get an object URL for a segment if already downloaded.
   */
  getSegmentUrl(segmentNumber: number): string | null {
    const seg = this.segments.get(segmentNumber);
    return seg ? seg.url : null;
  }

  /**
   * Get object URL for a specific frame.
   * Returns null if segment not downloaded or frame not found.
   */
  getFrame(frameNumber: number): string | null {
    const segmentInfo = this.manifest.segments.find(
      s => frameNumber >= s.startFrame && frameNumber <= s.endFrame
    );
    if (!segmentInfo) return null;

    const segment = this.segments.get(segmentInfo.segment);
    if (!segment) return null;

    return segment.frameUrls.get(frameNumber) || null;
  }

  /**
   * Get all frame URLs from a specific segment as an array.
   * Returns empty array if segment not downloaded.
   */
  getSegmentFrames(segmentNumber: number): string[] {
    const segment = this.segments.get(segmentNumber);
    if (!segment) return [];

    const frameUrls: string[] = [];
    
    for (const frameInfo of segment.info.frames) {
      const url = segment.frameUrls.get(frameInfo.frame);
      if (url) {
        frameUrls.push(url);
      }
    }

    return frameUrls;
  }

  /**
   * Get a range of frame URLs across segments.
   * Example: getFrameRange(0, 59) gets frames 0-59 from segments 0 and 1
   */
  getFrameRange(startFrame: number, endFrame: number): string[] {
    const frameUrls: string[] = [];
    
    for (let i = startFrame; i <= endFrame; i++) {
      const url = this.getFrame(i);
      if (url) {
        frameUrls.push(url);
      }
    }

    return frameUrls;
  }

  hasSegment(segmentNumber: number): boolean {
    return this.segments.has(segmentNumber);
  }

  hasFrame(frameNumber: number): boolean {
    const segmentInfo = this.manifest.segments.find(
      s => frameNumber >= s.startFrame && frameNumber <= s.endFrame
    );
    return segmentInfo ? this.segments.has(segmentInfo.segment) : false;
  }

  getSegmentInfo(segmentNumber: number): SegmentInfo | undefined {
    return this.manifest.segments.find(s => s.segment === segmentNumber);
  }

  // Clean up all object URLs (segment + frames)
  revokeAllUrls(): void {
    for (const seg of this.segments.values()) {
      URL.revokeObjectURL(seg.url);
      for (const frameUrl of seg.frameUrls.values()) {
        URL.revokeObjectURL(frameUrl);
      }
    }
    this.segments.clear();
  }
 keepOnlyLastNSegments(count: number): void {
    const segmentNumbers = Array.from(this.segments.keys()).sort((a, b) => a - b);
    
    if (segmentNumbers.length <= count) {
      console.log(`Only ${segmentNumbers.length} segments loaded, nothing to revoke`);
      return;
    }
    
    const toKeep = segmentNumbers.slice(-count);
    const toRevoke = segmentNumbers.filter(num => !toKeep.includes(num));
    
    console.log(`Keeping last ${count} segments:`, toKeep);
    console.log(`Revoking:`, toRevoke);
    
    for (const segNum of toRevoke) {
      const seg = this.segments.get(segNum);
      if (seg) {
        URL.revokeObjectURL(seg.url);
        for (const frameUrl of seg.frameUrls.values()) {
          URL.revokeObjectURL(frameUrl);
        }
        this.segments.delete(segNum);
      }
    }
    
    console.log(`Revoked ${toRevoke.length} segments. Remaining: ${this.segments.size}`);
  }
  // Revoke URLs for a specific segment
  revokeSegmentUrls(segmentNumber: number): void {
    const seg = this.segments.get(segmentNumber);
    if (seg) {
      URL.revokeObjectURL(seg.url);
      for (const frameUrl of seg.frameUrls.values()) {
        URL.revokeObjectURL(frameUrl);
      }
      this.segments.delete(segmentNumber);
    }
  }
}
// Usage - display frames as segments arrive
async function registerCreateVideoPlayer( events: Events,
    playBtnId: string = 'playBtn',
  pauseBtnId: string = 'pauseBtn'
): Promise<void> {
  const manifestUrl = '/metadata';
  const response = await fetch(manifestUrl);
  const manifest: Manifest = await response.json();
  const cdnUrl = manifest.cdnUrl
//   const  cdnUrl = `${cdnUrl}`;
  events.fire('startSpinner');

  const downloader = new SegmentDownloader(cdnUrl, manifest);
  let cnt= 0
  const allFrames: (string | null)[] = new Array(manifest.totalFrames).fill(null);  

// //   Start downloading (non-blocking) and display frames as they arrive
//   downloader.startDownloading(100, (segmentNum, segmentInfo, url, frames) => {
//     console.log(`Segment ${segmentNum} ready at URL: ${url}`);
//     console.log(`Got ${frames.length} frames (${segmentInfo.startFrame}-${segmentInfo.endFrame})`);


//         frames.forEach((frameUrl, index) => {  
//             const frameNumber = segmentInfo.startFrame + index;  
//             allFrames[frameNumber] = frameUrl;  
//         }); 
//         events.fire('plysequence.setFrames2', allFrames);

//         if  (cnt == 0) {
//             events.fire('timeline.frame2', 0);
//         }
//         cnt++;

//         console.log(`Frames array now has ${allFrames.filter(f => f !== null).length}/${manifest.totalFrames} frames loaded`);  
  


//         // if (events.invoke('timeline.playing')) {
//         //     events.fire('timeline.setPlaying2', false);
//         // } else {
//         //     events.fire('timeline.setPlaying2', true);
//         // }
   


    
//   });
 events.on("RevokeBlobUrls", ()=>{
    downloader.keepOnlyLastNSegments(10)
  })

  await downloader.downloadSequential(
    (segmentNum, segmentInfo, segmentUrl, frameUrls) => {
      console.log(
        `Segment ${segmentNum} ready (frames ${segmentInfo.startFrame}-${segmentInfo.endFrame})`
      );

        frameUrls.forEach((frameUrl, index) => {  
            const frameNumber = segmentInfo.startFrame + index;  
            allFrames[frameNumber] = frameUrl;  
        }); 
        events.fire('plysequence.setFrames2', allFrames);

        if  (cnt == 0) {
            events.fire('timeline.frame2', 0);
            events.fire('stopSpinner');

        }
        cnt++;

        console.log(`Frames array now has ${allFrames.filter(f => f !== null).length}/${manifest.totalFrames} frames loaded`);  
  


    }
  );

  console.log("All segments downloaded sequentially");


  const playBtn = document.getElementById(playBtnId);
  const pauseBtn = document.getElementById(pauseBtnId);
  // Your code continues immediately, doesn't wait for downloads
  console.log('Downloads started, continuing with other work...');


}

// Example display function
// function displayFrame(frameNumber: number, frameBlob: Blob): void {
//   console.log(`Displaying frame ${frameNumber}`, frameBlob);
//   // Your rendering logic here
// }

// Export for use in other modules
export { registerCreateVideoPlayer /* SegmentDownloader, Manifest, SegmentInfo, FrameInfo, SegmentData, OnSegmentReadyCallback */ };