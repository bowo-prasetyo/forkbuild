import { BUILD_VIDEO_SIZES, chooseVideoMimeType, videoFileExtension } from '../core/BuildVideo.js';
import { drawEndCard, drawStrip } from './BuildVideoOverlay.js';

// Records a walk-through filmed in World View (core/WalkThroughFilm.js): each
// frame World View draws is copied, cropped to the video's shape from the
// middle of the view, into a canvas of the video's size, with the build's name
// along the bottom and, at the end, its end card (renderer/BuildVideoOverlay.js),
// and recorded with the sound World View plays
// (audio/WebAudioSoundscapeProvider.js#startCapture()). Only World View's 3D
// view is recorded, never its panels.

const FRAMES_PER_SECOND = 30;
const BITS_PER_SECOND = 8_000_000;
const AUDIO_BITS_PER_SECOND = 128_000;

// The part of a `sourceWidth` × `sourceHeight` frame, from its middle, that
// fills a `width` × `height` video: `{ x, y, width, height }`.
export function coverCrop(sourceWidth, sourceHeight, width, height) {
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const cropWidth = Math.min(sourceWidth, width / scale);
    const cropHeight = Math.min(sourceHeight, height / scale);
    return Object.freeze({
        x: (sourceWidth - cropWidth) / 2,
        y: (sourceHeight - cropHeight) / 2,
        width: cropWidth,
        height: cropHeight
    });
}

export class WorldFilmRecorder {
    // `shape`: core/BuildVideo.js's BuildVideoShape. `text`: the overlay's
    // words, in the viewer's language (renderer/BuildVideoOverlay.js).
    // `audioStream`: the sound to record, or null for none.
    constructor({ shape, text, audioStream = null }) {
        const { width, height } = BUILD_VIDEO_SIZES[shape];
        this._width = width;
        this._height = height;
        this._text = text;
        this._audioStream = audioStream;
        this._canvas = document.createElement('canvas');
        this._canvas.width = width;
        this._canvas.height = height;
        this._context = this._canvas.getContext('2d');
        this._recorder = null;
        this._recording = false;
        this._stream = null;
        this._chunks = [];
        this._mimeType = null;
        this._onVisibility = () => this._followVisibility();
    }

    // Gets ready to record; recording itself starts with the first frame
    // drawFrame() copies, so the video never opens on an empty canvas. Throws
    // where this browser can't record a video.
    start() {
        const Recorder = globalThis.MediaRecorder;
        const sound = Boolean(this._audioStream && this._audioStream.getAudioTracks().length > 0);
        const mimeType = Recorder ? chooseVideoMimeType((type) => Recorder.isTypeSupported(type), { sound }) : null;
        if (!mimeType) throw new Error('this browser can\'t record a video');
        this._mimeType = mimeType;
        const video = this._canvas.captureStream(FRAMES_PER_SECOND);
        this._stream = new MediaStream([...video.getVideoTracks(), ...(sound ? this._audioStream.getAudioTracks() : [])]);
        this._recorder = new Recorder(this._stream, {
            mimeType,
            videoBitsPerSecond: BITS_PER_SECOND,
            ...(sound ? { audioBitsPerSecond: AUDIO_BITS_PER_SECOND } : {})
        });
        this._recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) this._chunks.push(event.data);
        };
        document.addEventListener('visibilitychange', this._onVisibility);
    }

    // Copies a frame World View just drew (`source`, its canvas), with the
    // end card faded in by `endCard` (0 to 1).
    drawFrame(source, endCard = 0) {
        if (!source || !source.width || !source.height) return;
        const crop = coverCrop(source.width, source.height, this._width, this._height);
        this._context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, this._width, this._height);
        if (endCard < 1) drawStrip(this._context, this._width, this._height, this._text);
        if (endCard > 0) drawEndCard(this._context, this._width, this._height, this._text, endCard);
        if (this._recorder && !this._recording) {
            this._recording = true;
            this._recorder.start(1000);
        }
    }

    // Stops recording and resolves to `{ blob, mimeType, extension }`.
    finish() {
        return new Promise((resolve, reject) => {
            const recorder = this._recorder;
            if (!recorder) {
                reject(new Error('not recording'));
                return;
            }
            recorder.onerror = (event) => reject(event.error || new Error('the video couldn\'t be recorded'));
            recorder.onstop = () => {
                this._release();
                const type = this._mimeType.split(';')[0];
                resolve(Object.freeze({ blob: new Blob(this._chunks, { type }), mimeType: type, extension: videoFileExtension(this._mimeType) }));
            };
            if (recorder.state === 'inactive') recorder.onstop();
            else recorder.stop();
        });
    }

    // Stops recording and keeps nothing.
    cancel() {
        const recorder = this._recorder;
        if (recorder) {
            recorder.ondataavailable = null;
            recorder.onstop = null;
            if (recorder.state !== 'inactive') recorder.stop();
        }
        this._chunks = [];
        this._release();
    }

    _release() {
        document.removeEventListener('visibilitychange', this._onVisibility);
        // Only the canvas's track: the sound's belongs to whoever made it.
        this._stream?.getVideoTracks().forEach((track) => track.stop());
        this._stream = null;
        this._recorder = null;
    }

    // World View stops drawing while its tab is hidden, so recording pauses
    // with it rather than holding a frozen frame.
    _followVisibility() {
        const recorder = this._recorder;
        if (!recorder) return;
        if (document.hidden && recorder.state === 'recording') recorder.pause();
        else if (!document.hidden && recorder.state === 'paused') recorder.resume();
    }
}
