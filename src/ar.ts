import * as pc from 'playcanvas';
import { Scene } from './scene';
import { Events } from './events';
import { ElementType } from './element';
import { Splat } from './splat';

const AR_VIEWING_DISTANCE = 2; // how far away the model should be from the camera origin in AR mode

let sceneRef: Scene | null = null;
let eventsRef: Events | null = null;

let isAutoRender: boolean = false;
let isGridVisible: boolean = true;
let initialModelTransform: pc.Mat4 = pc.Mat4.IDENTITY;

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
        if (sceneRef) {
            configureForAR(sceneRef);
        }
        eventsRef?.fire('ar.active', true);
    });

    pc.app.xr.on('end', () => {
        if (sceneRef) {
            restoreFromAR(sceneRef);
        }
        eventsRef?.fire('ar.active', false);
    });

    // listen for XR errors
    pc.app.xr.on('error', (error: Error) => {
        console.error("XR error:", error.message);
    });
}

function configureForAR(scene: Scene): void {
    const app = scene.app;

    isAutoRender = app.autoRender;
    isGridVisible = scene.grid.visible;

    // scene is changing in AR mode: render every frame, hide grid
    app.autoRender = true;
    scene.grid.visible = false;

    console.log("AR mode configured. XR session started.");
}

function restoreFromAR(scene: Scene): void {
    const app = scene.app;

    app.autoRender = isAutoRender;
    scene.grid.visible = isGridVisible;

    scene.elements.forEach((e => {
        if (e.type == ElementType.splat){
            const splat = e as Splat;

            console.log("Restoring model initial transform after AR:", initialModelTransform);
            splat.worldTransform.copy(initialModelTransform);
        }
    }));

    console.log("AR mode restored. XR session ended.");
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

    const camera = sceneRef.camera;
    const cameraComponent = camera.entity.camera;
    if (!cameraComponent) {
        console.error("Camera component not found");
        return;
    }

    // camera is too far at the start. need to focus it on the model.
    camera.focus();
    eventsRef?.fire('camera.setFov', 120);

    sceneRef?.elements.forEach((e => {
        if (e.type == ElementType.splat){
            const splat = e as Splat;

            initialModelTransform = splat.worldTransform.clone();
            console.log("Stored model initial transform for AR:", initialModelTransform);
            // initially, both the model and the camera are positioned at the origin in AR space. move it to the viewing distance.
            const translationMatrix = new pc.Mat4().setTranslate(0, 0, -AR_VIEWING_DISTANCE);
            const newTransform = new pc.Mat4().mul2(translationMatrix, splat.worldTransform);
            splat.worldTransform.copy(newTransform);
        }
    }));

    // delay session for camera focus process
    setTimeout(() => {
        pc.app.xr.start(cameraComponent, pc.XRTYPE_AR, pc.XRSPACE_LOCALFLOOR);
    }, 500);
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