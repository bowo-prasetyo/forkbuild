import * as THREE from 'three';
import { BuildingRenderer } from './BuildingRenderer.js';
import { SceneManager } from './SceneManager.js';
import { Lights } from './Lights.js';
import { SpatialBounds } from '../core/world/SpatialBounds.js';
import { computeThumbnailCamera } from '../core/catalog/PreviewCameraFraming.js';
import { drawEndCard, drawStrip } from './BuildVideoOverlay.js';
import {
    BUILD_VIDEO_SIZES, buildVideoFrame, chooseVideoMimeType, timelapseOrder, videoCameraDistanceScale, videoFileExtension
} from '../core/app/BuildVideo.js';

// Records a video of a build on this device (core/app/BuildVideo.js says what it
// shows): the bricks drawn as Home's turntable draws them, on a patch of
// grass under the sky, with the build's name along the bottom and an end card
// saying who built it and where to remix it. The frames are drawn into a
// canvas and recorded as they are drawn (MediaRecorder), so a video takes as
// long to make as it lasts. Its WebGL context is released before it resolves.

const SKY_COLOR = 0x87ceeb;
const GROUND_COLOR = 0x7da35a;
const FOV_DEGREES = 35;
const PADDING = 1.05;
const FRAMES_PER_SECOND = 30;
const BITS_PER_SECOND = 8_000_000;
const AUDIO_BITS_PER_SECOND = 128_000;
// The soundtrack fades away this long before the video ends, under the end card.
const SOUNDTRACK_FADE_SECONDS = 1.6;

// Records `bricks` (core/building/Brick.js) as a `timeline` (buildVideoTimeline())
// video in `shape`. `text` is in the viewer's language: `{ title, credit,
// badge, call, address, hint }`, the strip naming the build and the end card
// (the build's title and `credit` above `call`, `address` and `hint`).
// `soundtrack`, when given, is music to record with it
// (audio/MusicRecording.js: `{ stream, play(), fadeOut(), pause(), resume() }`),
// started with the recording and faded out under the end card; the caller stops it. `onProgress(fraction)`
// follows it; aborting `signal` stops it and rejects with an AbortError.
// Resolves to `{ blob, mimeType, extension }`.
export async function recordBuildVideo(bricks, {
    registry, timeline, shape, text, soundtrack = null, onProgress = () => {}, signal = null
}) {
    const Recorder = globalThis.MediaRecorder;
    const sound = Boolean(soundtrack && soundtrack.stream.getAudioTracks().length > 0);
    const mimeType = Recorder ? chooseVideoMimeType((type) => Recorder.isTypeSupported(type), { sound }) : null;
    if (!mimeType) throw new Error('this browser can\'t record a video');
    if (signal?.aborted) throw abortError();
    const { width, height } = BUILD_VIDEO_SIZES[shape];

    const scene = new BuildVideoScene(registry, bricks, { width, height });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const order = timelapseOrder(bricks);

    const drawAt = (seconds) => {
        const frame = buildVideoFrame(timeline, bricks.length, seconds);
        context.drawImage(scene.draw(frame.azimuth, order, frame.visibleBricks), 0, 0);
        if (frame.endCard < 1) drawStrip(context, width, height, text);
        if (frame.endCard > 0) drawEndCard(context, width, height, text, frame.endCard);
    };
    drawAt(0);

    const video = canvas.captureStream(FRAMES_PER_SECOND);
    const stream = new MediaStream([...video.getVideoTracks(), ...(sound ? soundtrack.stream.getAudioTracks() : [])]);
    const recorder = new Recorder(stream, {
        mimeType,
        videoBitsPerSecond: BITS_PER_SECOND,
        ...(sound ? { audioBitsPerSecond: AUDIO_BITS_PER_SECOND } : {})
    });
    const chunks = [];
    recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    try {
        await new Promise((resolve, reject) => {
            let frameRequest = null;
            let started = null;
            // Time spent with the tab hidden, when browsers stop drawing:
            // recording pauses with it, so the video doesn't freeze.
            let hiddenAt = null;
            let hiddenFor = 0;
            let finished = false;
            let fading = false;
            const finish = (error) => {
                if (finished) return;
                finished = true;
                if (frameRequest !== null) cancelAnimationFrame(frameRequest);
                document.removeEventListener('visibilitychange', onVisibility);
                signal?.removeEventListener('abort', onAbort);
                recorder.onstop = () => (error ? reject(error) : resolve());
                if (recorder.state !== 'inactive') recorder.stop();
                else recorder.onstop();
            };
            const onAbort = () => finish(abortError());
            const onVisibility = () => {
                if (document.hidden && recorder.state === 'recording') {
                    hiddenAt = performance.now();
                    recorder.pause();
                    if (sound) soundtrack.pause();
                } else if (!document.hidden && recorder.state === 'paused') {
                    hiddenFor += performance.now() - hiddenAt;
                    hiddenAt = null;
                    recorder.resume();
                    if (sound) soundtrack.resume();
                }
            };
            const tick = (now) => {
                frameRequest = null;
                if (started === null) started = now;
                if (hiddenAt === null) {
                    const seconds = (now - started - hiddenFor) / 1000;
                    drawAt(seconds);
                    onProgress(Math.min(1, seconds / timeline.totalSeconds));
                    if (sound && !fading && seconds >= timeline.totalSeconds - SOUNDTRACK_FADE_SECONDS) {
                        fading = true;
                        soundtrack.fadeOut();
                    }
                    if (seconds >= timeline.totalSeconds) {
                        // One more frame's time, so the last one is recorded.
                        setTimeout(() => finish(null), 1000 / FRAMES_PER_SECOND * 2);
                        return;
                    }
                }
                frameRequest = requestAnimationFrame(tick);
            };
            signal?.addEventListener('abort', onAbort);
            document.addEventListener('visibilitychange', onVisibility);
            recorder.onerror = (event) => finish(event.error || new Error('the video couldn\'t be recorded'));
            recorder.start(1000);
            if (sound) soundtrack.play();
            frameRequest = requestAnimationFrame(tick);
        });
    } finally {
        // Only the canvas's track: the soundtrack's belongs to whoever made it.
        video.getTracks().forEach((track) => track.stop());
        scene.dispose();
    }
    const type = mimeType.split(';')[0];
    return Object.freeze({ blob: new Blob(chunks, { type }), mimeType: type, extension: videoFileExtension(mimeType) });
}

function abortError() {
    return new DOMException('The video was cancelled.', 'AbortError');
}

// The build on its grass, drawn from a camera turning round it; one WebGL
// context, released by dispose().
class BuildVideoScene {
    constructor(registry, bricks, { width, height }) {
        this._renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        this._renderer.setPixelRatio(1);
        this._renderer.setSize(width, height, false);
        this._sceneManager = new SceneManager();
        this._sceneManager.scene.background = new THREE.Color(SKY_COLOR);
        new Lights(this._sceneManager);
        this._camera = new THREE.PerspectiveCamera(FOV_DEGREES, width / height, 0.1, 10000);

        const buildingRenderer = new BuildingRenderer(registry);
        this._meshes = bricks.map((brick) => {
            const { mesh } = buildingRenderer.renderBrick(brick);
            this._sceneManager.add(mesh);
            return mesh;
        });
        this._orbit = null;
        if (bricks.length === 0) return;

        const bounds = SpatialBounds.fromBricks(bricks, registry);
        const framing = computeThumbnailCamera(bounds, { fovDegrees: FOV_DEGREES, padding: PADDING });
        const { center, size } = bounds;
        const ground = new THREE.Mesh(
            new THREE.CircleGeometry(Math.hypot(size.x, size.z) / 2 + 1.5, 48),
            new THREE.MeshStandardMaterial({ color: GROUND_COLOR })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(center.x, bounds.min.y - 0.01, center.z);
        this._sceneManager.add(ground);
        this._meshes.push(ground);

        const scale = videoCameraDistanceScale(width / height, FOV_DEGREES);
        const offset = {
            x: framing.position.x - framing.target.x,
            y: framing.position.y - framing.target.y,
            z: framing.position.z - framing.target.z
        };
        this._orbit = { target: framing.target, horizontal: Math.hypot(offset.x, offset.z) * scale, height: offset.y * scale };
        this._camera.fov = framing.fovDegrees;
        this._camera.updateProjectionMatrix();
    }

    // The frame with the camera at `azimuth` and the first `visible` bricks
    // of `order` shown; returns the canvas drawn into.
    draw(azimuth, order, visible) {
        order.forEach((index, rank) => { this._meshes[index].visible = rank < visible; });
        if (this._orbit) {
            const { target, horizontal, height } = this._orbit;
            this._camera.position.set(target.x + horizontal * Math.cos(azimuth), target.y + height, target.z + horizontal * Math.sin(azimuth));
            this._camera.lookAt(target.x, target.y, target.z);
        }
        this._renderer.render(this._sceneManager.scene, this._camera);
        return this._renderer.domElement;
    }

    dispose() {
        for (const mesh of this._meshes) {
            mesh.geometry.dispose();
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((material) => material.dispose());
        }
        this._meshes = [];
        this._renderer.dispose();
        this._renderer.forceContextLoss();
    }
}
