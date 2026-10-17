// @environment browser
import { createApp } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { WebAudioSoundscapeProvider } from '../audio/WebAudioSoundscapeProvider.js';
import { WorldFilmRecorder } from '../renderer/WorldFilmRecorder.js';
import { BuildVideoShape } from '../core/BuildVideo.js';
import BuildVideoDialog from '../ui/components/buildVideo/BuildVideoDialog.js';
import { takeWalkThroughFilmRequest } from '../ui/components/buildVideo/walkThroughFilmRequest.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// A walk-through's recording, in a real browser: World View's sound is
// recorded even while the person has it muted, with music only when the video
// asks for it (audio/WebAudioSoundscapeProvider.js#startCapture()); frames
// are cropped from the middle of the view into a video of the chosen shape,
// with that sound (renderer/WorldFilmRecorder.js); and Make a video hands a
// walk-through to World View (BuildVideoDialog, walkThroughFilmRequest.js).

async function until(condition, what, tries = 400) {
    for (let i = 0; i < tries; i++) {
        if (condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`timed out waiting for ${what}`);
}

// A view 1600 × 900: red on the left, green in the middle, blue on the right.
function viewCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 900;
    const context = canvas.getContext('2d');
    for (const [x, color] of [[0, '#ff0000'], [533, '#00ff00'], [1067, '#0000ff']]) {
        context.fillStyle = color;
        context.fillRect(x, 0, 534, 900);
    }
    return canvas;
}

// What a recording looks and sounds like: its size, the colour in the middle
// of its picture, and how loud its sound is.
async function inspect(blob) {
    const video = document.createElement('video');
    video.muted = true;
    const url = URL.createObjectURL(blob);
    try {
        await new Promise((resolve, reject) => {
            video.onloadeddata = resolve;
            video.onerror = () => reject(new Error(`the video couldn't be read (${blob.type}, ${blob.size} bytes)`));
            video.src = url;
        });
        video.currentTime = 0.7;
        await new Promise((resolve) => { video.onseeked = resolve; });
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0);
        const [r, g, b] = context.getImageData(canvas.width / 2, canvas.height / 3, 1, 1).data;
        const audio = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(await blob.arrayBuffer());
        const data = audio.getChannelData(0);
        let sum = 0;
        for (const value of data) sum += value * value;
        return { width: video.videoWidth, height: video.videoHeight, middle: { r, g, b }, rms: Math.sqrt(sum / data.length), seconds: audio.duration };
    } finally {
        URL.revokeObjectURL(url);
    }
}

// Recording World View's sound: heard in the video while muted for the
// person, the wind in it, the music only when asked.
{
    const provider = new WebAudioSoundscapeProvider({ contextFactory: () => new AudioContext(), documentRef: document });
    provider.setLayerLevels({ wind: 1 });
    provider.setMuted(true);
    provider.setMusic(false);
    provider.resume();
    const stream = provider.startCapture({ music: true });
    assert(stream && stream.getAudioTracks().length === 1, 'recording gives one audio track');
    assert(provider.musicPlaying, 'the video asked for music, so it plays, though the person turned music off');

    const view = viewCanvas();
    const recorder = new WorldFilmRecorder({
        shape: BuildVideoShape.TALL,
        text: { title: 'Little hut', credit: 'by alice', badge: 'Made in ForkBuild', call: 'Remix it', address: 'example.test', hint: 'Link below' },
        audioStream: stream
    });
    recorder.start();
    const startedAt = performance.now();
    await new Promise((resolve) => {
        const draw = () => {
            recorder.drawFrame(view, 0);
            if (performance.now() - startedAt < 1500) requestAnimationFrame(draw);
            else resolve();
        };
        requestAnimationFrame(draw);
    });
    const video = await recorder.finish();
    assert(video.mimeType.startsWith('video/') && video.blob.size > 1000, `a video file (${video.mimeType}, ${video.blob.size} bytes)`);
    const seen = await inspect(video.blob);
    assert(seen.width === 720 && seen.height === 1280, `tall, 720 × 1280 (${seen.width} × ${seen.height})`);
    assert(seen.middle.g > 180 && seen.middle.r < 80 && seen.middle.b < 80, `cropped from the middle of the view (${JSON.stringify(seen.middle)})`);
    assert(seen.seconds > 0.5 && seen.rms > 0.002, `with World View's sound in it, though muted for the person (rms ${seen.rms.toFixed(4)})`);
    assert(stream.getAudioTracks()[0].readyState === 'live', 'the sound\'s track is left to the soundscape that made it');

    provider.stopCapture();
    assert(stream.getAudioTracks()[0].readyState === 'ended' && !provider.musicPlaying, 'stopping ends the track, and the music goes back to the person\'s setting');
    provider.setMuted(false);
    provider.setMusic(true);
    provider.startCapture({ music: false });
    assert(!provider.musicPlaying, 'a video asked without music has none, though the person has it on');
    provider.stopCapture();
    assert(provider.musicPlaying, 'and the person\'s music comes back after');
    provider.dispose();
    console.log('✓ a walk-through records World View\'s sound, cropped to its shape');
}

// Make a video offers a walk-through where it can open World View, and hands
// the request over.
function snapshotText() {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const metadata = new DocumentMetadata({ title: 'Little hut', author: 'alice', license: new License({ id: LicenseId.CC_BY_4_0 }) });
    return JSON.stringify(new DocumentSerializer().serialize(new Document({ world, metadata })));
}

async function mountDialog({ router = null, documentId = null }) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let closed = 0;
    const app = createApp(BuildVideoDialog, {
        snapshotText: snapshotText(), title: 'Little hut', buildUrl: 'https://example.test/n/hut', documentId, onClose: () => { closed++; }
    });
    if (router) app.use(router);
    app.mount(host);
    if (router) await router.isReady();
    return { host, closed: () => closed, unmount: () => { app.unmount(); host.remove(); } };
}

{
    const plain = await mountDialog({});
    assert(!plain.host.querySelector('[data-kind="walkthrough"]'), 'without World View to go to, no walk-through is offered');
    plain.unmount();

    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div></div>' } }, { path: '/world/:documentId', component: { template: '<div></div>' } }] });
    router.push('/');
    const dialog = await mountDialog({ router, documentId: 'doc-hut' });
    const option = dialog.host.querySelector('[data-kind="walkthrough"]');
    assert(option && option.textContent.includes(t('video.walkthrough')), 'with it, a walk-through is offered');
    assert(dialog.host.querySelector('.build-video-music-input').checked, 'every kind has music, unless turned off');
    assert(!dialog.host.querySelector('[data-camera]'), 'the camera is asked about only for a walk-through');
    option.querySelector('input').click();
    await until(() => dialog.host.querySelector('[data-camera]'), 'the camera choice');
    assert(dialog.host.querySelector('[data-camera="behind"] input').checked && dialog.host.querySelector('[data-camera="eyes"]').textContent.includes(t('video.cameraEyes')),
        'behind the avatar, or through its eyes');
    assert(dialog.host.textContent.includes(t('video.walkthroughNote')) && dialog.host.querySelector('.build-video-record').textContent.trim() === t('video.filmWalkthrough'),
        'it says the walk is filmed in World View');
    dialog.host.querySelector('[data-shape="tall"] input').click();
    dialog.host.querySelector('[data-camera="eyes"] input').click();
    dialog.host.querySelector('.build-video-music-input').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    dialog.host.querySelector('.build-video-record').click();
    await until(() => router.currentRoute.value.path === '/world/doc-hut', 'World View to open');
    assert(router.currentRoute.value.query.film === 'walk' && dialog.closed() === 1, 'it opens World View on the build, to film it, and closes');
    const request = takeWalkThroughFilmRequest('doc-hut');
    assert(request && request.shape === BuildVideoShape.TALL && request.camera === 'eyes' && request.music === false && request.name === 'Little hut',
        `World View gets the shape, the camera, the music choice and the name (${JSON.stringify(request && { shape: request.shape, camera: request.camera, music: request.music })})`);
    assert(request.text.credit === t('video.credit', { author: 'alice' }) && request.description.text.split('\n').includes(t('video.description.remixLink', { url: 'https://example.test/n/hut' }))
        && request.description.title === t('video.description.titleShorts', { title: 'Little hut' }), 'and the words for the video and its description');
    assert(takeWalkThroughFilmRequest('doc-hut') === null, 'once only, so reopening the address later films nothing');
    dialog.unmount();
    console.log('✓ Make a video hands a walk-through to World View');
}

console.log('✅ All WalkThroughFilmBrowser tests passed.');
