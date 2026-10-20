// @environment browser
import { createApp } from 'vue';
import PublicationShareLink from '../ui/components/PublicationShareLink.js';
import { recordBuildVideo } from '../renderer/BuildVideoRecorder.js';
import { BuildVideoKind, BuildVideoShape } from '../core/app/BuildVideo.js';
import { createMusicRecording } from '../audio/MusicRecording.js';
import { MUSIC_MOOD } from '../core/app/MusicScore.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { ShowcaseLibrary } from '../core/library/ShowcaseLibrary.js';
import { Document } from '../core/document/Document.js';
import { DocumentMetadata } from '../core/document/DocumentMetadata.js';
import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { Brick } from '../core/building/Brick.js';
import { Position } from '../core/document/Position.js';
import { License, LicenseId } from '../core/document/License.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// Make a video, in a real browser: the recorder draws the build into a canvas
// and records it as a video of the chosen shape, and the dialog beside Save
// picture makes one, downloads it and offers a description that credits the
// builder and links back to the build.

const registry = new CreateBrickRegistryUseCase().execute();
const castleBricks = ShowcaseLibrary.structures.find((s) => s.id === 'showcase:castle').bricks
    .map((brick) => new Brick({ definitionId: brick.definitionId, position: brick.position, rotation: brick.rotation, color: brick.color }));
const text = { title: 'Castle on the hill', credit: 'by alice', badge: 'Made in ForkBuild', call: 'Remix it', address: 'example.test', hint: 'Link below' };

async function until(condition, what, tries = 1200) {
    for (let i = 0; i < tries; i++) {
        if (condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`timed out waiting for ${what}`);
}

// The size a recorded video plays at.
async function videoSize(blob) {
    const video = document.createElement('video');
    video.muted = true;
    const url = URL.createObjectURL(blob);
    try {
        await new Promise((resolve, reject) => {
            video.onloadedmetadata = resolve;
            video.onerror = () => reject(new Error(`the video couldn't be read (${blob.type}, ${blob.size} bytes)`));
            video.src = url;
        });
        return { width: video.videoWidth, height: video.videoHeight };
    } finally {
        URL.revokeObjectURL(url);
    }
}

// A short recording, tall: a video file of the build at 720 × 1280.
{
    const progress = [];
    const timeline = Object.freeze({ kind: BuildVideoKind.TIMELAPSE, riseSeconds: 0.6, showSeconds: 0.3, endCardSeconds: 0.6, totalSeconds: 1.5 });
    const video = await recordBuildVideo(castleBricks, {
        registry, timeline, shape: BuildVideoShape.TALL, text, onProgress: (fraction) => progress.push(fraction)
    });
    assert(video.mimeType.startsWith('video/') && ['webm', 'mp4'].includes(video.extension), `a video file (${video.mimeType}, .${video.extension})`);
    assert(video.blob.size > 1000, `with frames in it (${video.blob.size} bytes)`);
    const size = await videoSize(video.blob);
    assert(size.width === 720 && size.height === 1280, `tall, 720 × 1280 (got ${size.width} × ${size.height})`);
    assert(progress.length > 5 && progress.at(-1) === 1 && progress.every((value, i) => i === 0 || value >= progress[i - 1]), `progress climbs to the end (${progress.length} reports)`);
    console.log('✓ a tall video of the build is recorded');
}

// How loud a video's sound is, second by second ([] for a video with none).
async function loudness(blob) {
    let audio;
    try {
        audio = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(await blob.arrayBuffer());
    } catch {
        return [];
    }
    const data = audio.getChannelData(0);
    const levels = [];
    const step = Math.floor(audio.sampleRate / 2);
    for (let from = 0; from + step <= data.length; from += step) {
        let sum = 0;
        for (let i = from; i < from + step; i++) sum += data[i] * data[i];
        levels.push(Math.sqrt(sum / step));
    }
    return levels;
}

// With music: the music is recorded with it, from the start, and fades away
// under the end card; the music's track is left to whoever made it.
{
    const soundtrack = await createMusicRecording({ mood: MUSIC_MOOD.EDITOR, seed: 7 });
    assert(soundtrack && soundtrack.stream.getAudioTracks().length === 1, 'the music is ready to record');
    const timeline = Object.freeze({ kind: BuildVideoKind.TURNTABLE, riseSeconds: 0, showSeconds: 3, endCardSeconds: 2.5, totalSeconds: 5.5 });
    const video = await recordBuildVideo(castleBricks, { registry, timeline, shape: BuildVideoShape.WIDE, text, soundtrack });
    const levels = await loudness(video.blob);
    assert(levels.length >= 9, `the video has sound (${levels.length} half-seconds)`);
    const playing = Math.max(...levels.slice(1, 6));
    assert(playing > 0.003, `music plays through it (${playing.toFixed(4)})`);
    assert(levels.at(-1) < playing / 3, `and fades away by the end (${levels.at(-1).toFixed(4)} after ${playing.toFixed(4)})`);
    assert(soundtrack.stream.getAudioTracks()[0].readyState === 'live', 'its track is left to the music');
    soundtrack.stop();
    assert(soundtrack.stream.getAudioTracks()[0].readyState === 'ended', 'which stopping ends');

    const silent = await recordBuildVideo(castleBricks, { registry, timeline: Object.freeze({ ...timeline, showSeconds: 0.5, totalSeconds: 1 }), shape: BuildVideoShape.WIDE, text });
    assert((await loudness(silent.blob)).length === 0, 'without music, a video has no sound track');
    console.log('✓ a time-lapse or a turntable can have music, fading under the end card');
}

// Stopping part way rejects with an AbortError, and the browser has a WebGL
// context to spare afterwards.
{
    const controller = new AbortController();
    const timeline = Object.freeze({ kind: BuildVideoKind.TURNTABLE, riseSeconds: 0, showSeconds: 5, endCardSeconds: 1, totalSeconds: 6 });
    setTimeout(() => controller.abort(), 300);
    let error = null;
    try {
        await recordBuildVideo(castleBricks, { registry, timeline, shape: BuildVideoShape.WIDE, text, signal: controller.signal });
    } catch (caught) {
        error = caught;
    }
    assert(error?.name === 'AbortError', `stopping rejects with an AbortError (${error?.name})`);
    console.log('✓ a recording can be stopped');
}

// The dialog, from a published build's share actions.
function publishHut() {
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    identity.login('video-browser-alice');
    const contentStore = new LocalContentStore(storage);
    const world = new World();
    const building = new Building({ creator: 'alice' });
    for (const [x, y] of [[0, 0.5], [1, 0.5], [0, 1.5]]) building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(x, y, 0), color: 0xb45309 }));
    world.addBuilding(building);
    const manager = new DocumentManager();
    const metadata = new DocumentMetadata({
        title: 'Little hut', author: 'alice', license: new License({ id: LicenseId.CC_BY_4_0 }), builtWith: [{ name: 'bob', identityId: 'id-bob' }]
    });
    manager.load(new Document({ world, metadata }), 'doc-hut');
    const publication = new PublishDocumentUseCase(new LocalPublisherProvider(storage, contentStore), identity).execute(manager);
    return { publication, contentStore };
}

const copied = [];
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { copied.push(value); } } });
const downloads = [];
HTMLAnchorElement.prototype.click = function captureDownload() {
    downloads.push({ href: this.href, download: this.download });
};

{
    const { publication, contentStore } = publishHut();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(PublicationShareLink, { publicationId: publication.id, title: publication.title, publication });
    app.provide('publicationContentStore', contentStore);
    app.mount(host);

    await until(() => host.querySelector('.publication-share-link-video'), 'Make a video');
    const link = host.querySelector('.publication-share-link-url').value;
    host.querySelector('.publication-share-link-video').click();
    await until(() => document.querySelector('.build-video-dialog'), 'the dialog');
    const dialog = () => document.querySelector('.build-video-dialog');
    assert(dialog().textContent.includes(t('video.lead')), 'it says what the video is for');
    assert(dialog().querySelector('[data-kind="timelapse"] input').checked && dialog().querySelector('[data-shape="wide"] input').checked,
        'a wide time-lapse is chosen to start with');

    dialog().querySelector('.build-video-record').click();
    await until(() => dialog().querySelector('progress'), 'recording to start');
    await until(() => dialog()?.querySelector('.build-video-description'), 'the video to be made', 2400);

    assert(downloads.length === 1 && /^forkbuild-little-hut-timelapse\.(webm|mp4)$/.test(downloads[0].download), `the video is downloaded, named after the build (${downloads[0]?.download})`);
    const blob = await (await fetch(downloads[0].href)).blob();
    assert((await loudness(blob)).length > 0, 'with music, as it is unless turned off');
    const size = await videoSize(blob);
    assert(size.width === 1280 && size.height === 720, `wide, 1280 × 720 (got ${size.width} × ${size.height})`);

    const title = dialog().querySelector('.build-video-title-text').value;
    const description = dialog().querySelector('.build-video-description').value;
    assert(title === t('video.description.title', { title: 'Little hut' }), `a title to paste (${title})`);
    assert(description.includes(t('video.description.byAuthor', { title: 'Little hut', author: 'alice' })), 'the description credits the builder');
    assert(description.includes(t('video.description.builtWith', { names: 'bob' })), 'and who built it with them');
    assert(description.includes(link), 'it links to the build itself');
    assert(description.includes('https://bowo-prasetyo.github.io/forkbuild/?ref=youtube'), 'and to ForkBuild, counted as a visit from YouTube');
    assert(description.includes(t('license.ccBy')) && description.trim().endsWith('#ForkBuild'), 'it names the license and ends with a hashtag');

    dialog().querySelector('.build-video-copy-description').click();
    await until(() => dialog().textContent.includes(t('video.descriptionCopied')), 'the description to be copied');
    assert(copied.length === 1 && copied[0] === description, 'Copy description copies it');

    dialog().querySelector('.build-video-another').click();
    await until(() => dialog().querySelector('.build-video-record'), 'the choices again');
    dialog().querySelector('.build-video-close').click();
    await until(() => !document.querySelector('.build-video-dialog'), 'the dialog to close');
    app.unmount();
    host.remove();
    console.log('✓ Make a video records the build, downloads it and offers a description to paste');
}

console.log('✅ All BuildVideoBrowser tests passed.');
