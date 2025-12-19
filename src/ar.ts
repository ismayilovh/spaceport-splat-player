import * as pc from 'playcanvas';
import { Scene } from './scene';
import { Events } from './events';

let sceneRef: Scene | null = null;
let eventsRef: Events | null = null;

export function initAR(scene: Scene, events: Events): void {
    sceneRef = scene;
    eventsRef = events;

    // register event handlers
    events.on('ar.toggle', toggleARSession);
    events.on('ar.start', startARSession);
    events.on('ar.end', endARSession);

    // fire initial availability
    events.fire('ar.available', isARAvailable());

    // listen for availability changes - XR capabilities are detected asynchronously
    pc.app.xr.on('available', (type: string, available: boolean) => {
        if (type === pc.XRTYPE_AR && eventsRef) {
            eventsRef.fire('ar.available', available);
        }
    });

    // listen for XR session start/end
    pc.app.xr.on('start', () => {
        eventsRef?.fire('ar.active', true);
    });

    pc.app.xr.on('end', () => {
        eventsRef?.fire('ar.active', false);
    });

    // listen for XR errors
    pc.app.xr.on('error', (error: Error) => {
        console.error("XR error:", error.message);
    });
}

export function startARSession(): void {
    if (!sceneRef) {
        console.error("AR not initialized. Call initAR(scene) first.");
        return;
    }

    if (!isARAvailable()) {
        console.error("AR is not available");
        return;
    }

    if (pc.app.xr.active) {
        return;
    }

    const camera = sceneRef.camera.entity.camera;
    if (!camera) {
        console.error("Camera component not found");
        return;
    }

    pc.app.xr.start(camera, pc.XRTYPE_AR, pc.XRSPACE_LOCALFLOOR);
}

export function endARSession(): void {
    if (pc.app.xr.active) {
        pc.app.xr.end();
    }
}

export function toggleARSession(): void {
    if (pc.app.xr.active) {
        endARSession();
    } else {
        startARSession();
    }
}

export function isARActive(): boolean {
    return pc.app.xr.active;
}

export function isARAvailable(): boolean {
    return pc.app.xr.supported && pc.app.xr.isAvailable(pc.XRTYPE_AR);
}