import { computed, ref } from 'vue';
import { BUILD_VIDEO_SIZES, BuildVideoKind, buildVideoFileName, canRecordBuildVideo } from '../../../core/app/BuildVideo.js';
import { takeWalkThroughFilmRequest } from '../../components/buildVideo/walkThroughFilmRequest.js';
import { downloadVideo } from '../../components/buildVideo/buildVideoText.js';

// How long World View settles at the build before filming starts, so the
// ground, trees and sky around it have streamed in.
const SETTLE_MS = 1500;
// How long it waits for the build and an avatar before saying it can't film.
const WAIT_LIMIT_MS = 30_000;

// Filming a walk-through in World View (`/world/<id>?film=walk`, from Make a
// video): once the build has loaded, the avatar walks it
// (application/worldNavigation/walkThroughFilmMethods.js) while every frame
// World View draws is recorded, with its sound
// (renderer/WorldFilmRecorder.js), and the video is saved to the person's
// downloads with a title and description to paste (WalkThroughFilmPanel).
// `sound()` is World View's running sound service, or null.
//
// watchFilm() is called on World View's fast presence tick (every 100 ms);
// it does nothing when nothing is being filmed.
export function useWalkThroughFilm({ session, sound }) {
    // null, or `{ stage, progress, fileName, description }`: stage is
    // waiting (for the build to load), filming, saving, saved, failed or
    // unsupported (this browser can't record).
    const film = ref(null);
    let request = null;
    let waitingSince = 0;
    let recorder = null;
    let unsubscribe = null;
    let estimate = 1;
    let finishing = false;

    // Takes the walk-through Make a video asked for on `documentId`, if any,
    // and starts waiting to film it. Returns whether there was one.
    function beginFilm(documentId) {
        const next = takeWalkThroughFilmRequest(documentId);
        if (!next) return false;
        stopFilm();
        request = next;
        if (typeof session.focusDocument === 'function') session.focusDocument(documentId);
        if (!canRecordBuildVideo(globalThis)) {
            film.value = { stage: 'unsupported', progress: 0, fileName: '', description: null };
            return true;
        }
        waitingSince = Date.now();
        film.value = { stage: 'waiting', progress: 0, fileName: '', description: null };
        return true;
    }

    function watchFilm() {
        if (!request || film.value?.stage !== 'waiting') return;
        if (!session.canFilmWalkThrough(request.documentId)) {
            if (Date.now() - waitingSince > WAIT_LIMIT_MS) fail();
            return;
        }
        if (Date.now() - waitingSince < SETTLE_MS) return;
        startFilming().catch(() => fail());
    }

    async function startFilming() {
        film.value = { ...film.value, stage: 'filming' };
        const { WorldFilmRecorder } = await import('../../../renderer/WorldFilmRecorder.js');
        if (!request) return;
        const service = sound();
        let audio = null;
        try {
            audio = service && typeof service.startCapture === 'function' ? service.startCapture({ music: request.music }) : null;
        } catch {
            audio = null;
        }
        recorder = new WorldFilmRecorder({ shape: request.shape, text: request.text, audioStream: audio });
        // World View draws at the video's own size and shape while it films,
        // rather than the video being cropped from the middle of the view.
        if (typeof session.setRenderFrameSize === 'function') session.setRenderFrameSize(BUILD_VIDEO_SIZES[request.shape]);
        const size = BUILD_VIDEO_SIZES[request.shape];
        const started = session.startWalkThroughFilm(request.documentId, { camera: request.camera, sweep: request.sweep, aspect: size.width / size.height });
        if (!started) throw new Error('the walk-through could not start');
        estimate = Math.max(1, started.seconds);
        recorder.start();
        unsubscribe = session.onRenderedFrame((canvas) => {
            const state = session.walkThroughFilmState();
            if (!recorder || !state) return;
            recorder.drawFrame(canvas, state.endCard);
            if (film.value) film.value = { ...film.value, progress: Math.min(1, state.seconds / estimate) };
            if (state.done) finishFilming();
        });
    }

    async function finishFilming() {
        if (finishing || !recorder) return;
        finishing = true;
        const finished = recorder;
        const finishedRequest = request;
        release();
        film.value = { ...film.value, stage: 'saving', progress: 1 };
        try {
            const video = await finished.finish();
            const fileName = buildVideoFileName(finishedRequest.name, BuildVideoKind.WALKTHROUGH, video.extension);
            downloadVideo(video.blob, fileName);
            film.value = { stage: 'saved', progress: 1, fileName, description: finishedRequest.description };
        } catch {
            fail();
        } finally {
            finishing = false;
            request = null;
        }
    }

    // Lets go of the frames, the avatar and the sound, keeping the recorder's
    // own state for finish() or cancel().
    function release() {
        if (typeof unsubscribe === 'function') unsubscribe();
        unsubscribe = null;
        recorder = null;
        if (typeof session.stopWalkThroughFilm === 'function') session.stopWalkThroughFilm();
        if (typeof session.setRenderFrameSize === 'function') session.setRenderFrameSize(null);
        const service = sound();
        if (service && typeof service.stopCapture === 'function') service.stopCapture();
    }

    function fail() {
        const failed = recorder;
        release();
        failed?.cancel();
        request = null;
        film.value = { stage: 'failed', progress: 0, fileName: '', description: null };
    }

    // Stops filming, keeping nothing, and closes the panel.
    function stopFilm() {
        const stopped = recorder;
        release();
        stopped?.cancel();
        request = null;
        film.value = null;
    }

    const filming = computed(() => film.value !== null && ['waiting', 'filming', 'saving'].includes(film.value.stage));

    return { film, filming, beginFilm, watchFilm, stopFilm };
}
