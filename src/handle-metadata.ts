// metadata.ts

const METADATA_URL: string = '/metadata';

interface MetadataResponse {
    segments: any[];
    totalFrames: number;
    totalSegments: number;
    framesPerSegment: number;
    fps: number;
    cdnBaseUrl: string;
}

interface MetadataState {
    segmentIndex: any[];
    totalFrames: number;
    totalSegments: number;
    framesPerSegment: number;
    fps: number;
    cdnBaseUrl: string;
}

let segmentIndex: any[] = [];
let totalFrames: number = 0;
let totalSegments: number = 0;
let framesPerSegment: number = 0;
let fps: number = 30;
let cdnBaseUrl: string = '';

async function loadMetadata(): Promise<MetadataResponse> {
    try {
        console.log('📡 Loading metadata...', 'info');
        const response: Response = await fetch(METADATA_URL);
        
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
        
        console.log('✅ Metadata loaded:', {
            totalFrames,
            totalSegments,
            framesPerSegment,
            fps,
            cdnBaseUrl
        });
        
        return data;
    } catch (error) {
        console.error(`❌ Failed: ${(error as Error).message}`);
        throw error;
    }
}

// Getter functions for accessing the state
export function getSegmentIndex(): any[] {
    return segmentIndex;
}

export function getTotalFrames(): number {
    return totalFrames;
}

export function getTotalSegments(): number {
    return totalSegments;
}

export function getFramesPerSegment(): number {
    return framesPerSegment;
}

export function getFps(): number {
    return fps;
}

export function getCdnBaseUrl(): string {
    return cdnBaseUrl;
}

export function getMetadataState(): MetadataState {
    return {
        segmentIndex,
        totalFrames,
        totalSegments,
        framesPerSegment,
        fps,
        cdnBaseUrl
    };
}

export { loadMetadata };
export type { MetadataResponse, MetadataState };