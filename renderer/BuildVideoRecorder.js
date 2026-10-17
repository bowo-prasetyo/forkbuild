import * as THREE from 'three';
import { BuildingRenderer } from './BuildingRenderer.js';
import { SceneManager } from './SceneManager.js';
import { Lights } from './Lights.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { computeThumbnailCamera } from '../core/PreviewCameraFraming.js';
import {
    BUILD_VIDEO_SIZES, buildVideoFrame, chooseVideoMimeType, timelapseOrder, videoCameraDistanceScale, videoFileExtension
} from '../core/BuildVideo.js';

// Records a video of a build on this device (core/BuildVideo.js says what it
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
const STRIP_COLOR = 'rgba(17, 24, 39, 0.72)';
const CARD_COLOR = 'rgba(17, 24, 39, 0.86)';
const ACCENT_COLOR = '#fbbf24';
const FONT = 'system-ui, sans-serif';

// Records `bricks` (core/Brick.js) as a `timeline` (buildVideoTimeline())
// video in `shape`. `text` is in the viewer's language: `{ title, credit,
// badge, call, address, hint }`, the strip naming the build and the end card
// (the build's title and `credit` above `call`, `address` and `hint`).
// `onProgress(fraction)` follows it; aborting `signal` stops it and rejects
// with an AbortError. Resolves to `{ blob, mimeType, extension }`.
export async function recordBuildVideo(bricks, { registry, timeline, shape, text, onProgress = () => {}, signal = null }) {
    const Recorder = globalThis.MediaRecorder;
    const mimeType = Recorder ? chooseVideoMimeType((type) => Recorder.isTypeSupported(type)) : null;
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

    const stream = canvas.captureStream(FRAMES_PER_SECOND);
    const recorder = new Recorder(stream, { mimeType, videoBitsPerSecond: BITS_PER_SECOND });
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
                } else if (!document.hidden && recorder.state === 'paused') {
                    hiddenFor += performance.now() - hiddenAt;
                    hiddenAt = null;
                    recorder.resume();
                }
            };
            const tick = (now) => {
                frameRequest = null;
                if (started === null) started = now;
                if (hiddenAt === null) {
                    const seconds = (now - started - hiddenFor) / 1000;
                    drawAt(seconds);
                    onProgress(Math.min(1, seconds / timeline.totalSeconds));
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
            frameRequest = requestAnimationFrame(tick);
        });
    } finally {
        stream.getTracks().forEach((track) => track.stop());
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

// The build's name along the bottom, and "Made in ForkBuild" beside it (or
// under it, in a tall frame).
function drawStrip(context, width, height, text) {
    const tall = height > width;
    const unit = Math.min(width, height) / 720;
    const padding = 32 * unit;
    const stripHeight = (tall ? 128 : 72) * unit;
    context.fillStyle = STRIP_COLOR;
    context.fillRect(0, height - stripHeight, width, stripHeight);
    context.textBaseline = 'middle';
    context.fillStyle = '#ffffff';
    if (tall) {
        context.textAlign = 'left';
        context.font = `700 ${36 * unit}px ${FONT}`;
        context.fillText(fit(context, text.title, width - 2 * padding), padding, height - stripHeight + 44 * unit);
        context.font = `600 ${26 * unit}px ${FONT}`;
        context.fillText(fit(context, text.badge, width - 2 * padding), padding, height - stripHeight + 90 * unit);
        return;
    }
    const middle = height - stripHeight / 2;
    context.textAlign = 'right';
    context.font = `600 ${26 * unit}px ${FONT}`;
    context.fillText(text.badge, width - padding, middle);
    const badgeWidth = text.badge ? context.measureText(text.badge).width + padding : 0;
    context.textAlign = 'left';
    context.font = `700 ${30 * unit}px ${FONT}`;
    context.fillText(fit(context, text.title, width - 2 * padding - badgeWidth), padding, middle);
}

// The end card over the last frame, faded in by `opacity`: the build's title
// and who built it, then where to remix it.
function drawEndCard(context, width, height, text, opacity) {
    const unit = Math.min(width, height) / 720;
    const room = width - 96 * unit;
    context.save();
    context.globalAlpha = opacity;
    context.fillStyle = CARD_COLOR;
    context.fillRect(0, 0, width, height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const middle = width / 2;
    const lines = [
        { text: text.title, font: `800 ${56 * unit}px ${FONT}`, color: '#ffffff', gap: 0 },
        { text: text.credit, font: `500 ${30 * unit}px ${FONT}`, color: '#e5e7eb', gap: 64 },
        { text: text.call, font: `700 ${40 * unit}px ${FONT}`, color: '#ffffff', gap: 112 },
        { text: text.address, font: `700 ${34 * unit}px ${FONT}`, color: ACCENT_COLOR, gap: 60 },
        { text: text.hint, font: `500 ${26 * unit}px ${FONT}`, color: '#e5e7eb', gap: 56 }
    ].filter((line) => line.text);
    const total = lines.reduce((sum, line, index) => sum + (index === 0 ? 0 : line.gap * unit), 0);
    let y = height / 2 - total / 2;
    lines.forEach((line, index) => {
        if (index > 0) y += line.gap * unit;
        context.font = line.font;
        context.fillStyle = line.color;
        context.fillText(fit(context, line.text, room), middle, y);
    });
    context.restore();
}

// `text`, shortened with an ellipsis to fit `width` in the context's font.
function fit(context, text, width) {
    if (!text || context.measureText(text).width <= width) return text || '';
    let end = text.length;
    while (end > 0 && context.measureText(`${text.slice(0, end)}…`).width > width) end--;
    return end > 0 ? `${text.slice(0, end)}…` : '';
}
