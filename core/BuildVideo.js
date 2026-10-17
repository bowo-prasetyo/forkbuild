import { message } from './Message.js';
import { LAUNCH_CHANNEL_PARAMETER } from './LaunchChannel.js';

// A short video of a build to upload to YouTube, Shorts, TikTok or Reels
// yourself (recorded on this device; nothing is uploaded): the build turning
// or rising brick by brick (renderer/BuildVideoRecorder.js), or walked into in
// World View with its sounds and music (core/WalkThroughFilm.js,
// renderer/WorldFilmRecorder.js), then an end card saying who built it and
// where to remix it. This is the pure part: the
// shapes, how long each part lasts, what each moment shows, the order bricks
// rise in, and the title and description to paste beside the video.

export const BuildVideoKind = Object.freeze({
    TURNTABLE: 'turntable',
    TIMELAPSE: 'timelapse',
    WALKTHROUGH: 'walkthrough'
});
export const BUILD_VIDEO_KINDS = Object.freeze(Object.values(BuildVideoKind));
// The kinds drawn away from the screen, on their own, with no sound; a
// walk-through is filmed in World View.
export const DRAWN_VIDEO_KINDS = Object.freeze([BuildVideoKind.TURNTABLE, BuildVideoKind.TIMELAPSE]);

// Wide for YouTube; tall for Shorts, TikTok and Reels.
export const BuildVideoShape = Object.freeze({
    WIDE: 'wide',
    TALL: 'tall'
});
export const BUILD_VIDEO_SHAPES = Object.freeze(Object.values(BuildVideoShape));
export const BUILD_VIDEO_SIZES = Object.freeze({
    [BuildVideoShape.WIDE]: Object.freeze({ width: 1280, height: 720 }),
    [BuildVideoShape.TALL]: Object.freeze({ width: 720, height: 1280 })
});

// One turn every TURN_SECONDS, in every kind, so a time-lapse turns as
// calmly as a turntable.
export const TURN_SECONDS = 12;
const END_CARD_SECONDS = 3.5;
// A time-lapse's bricks rise at about this many a second, its rising part
// kept between these lengths, then it turns finished for a moment.
const BRICKS_PER_SECOND = 12;
const MIN_RISE_SECONDS = 5;
const MAX_RISE_SECONDS = 20;
const FINISHED_SECONDS = 3;
// How long the end card takes to fade in.
export const END_CARD_FADE_SECONDS = 0.5;

// How long each part of a `kind` video of `brickCount` bricks lasts, in
// seconds: `{ kind, riseSeconds, showSeconds, endCardSeconds, totalSeconds }`.
// `riseSeconds` is 0 for a turntable; `showSeconds` is the time between the
// last brick and the end card.
export function buildVideoTimeline(kind, brickCount) {
    if (!DRAWN_VIDEO_KINDS.includes(kind)) throw new Error(`Not a drawn video kind: ${kind}`);
    const count = Math.max(0, Math.floor(Number(brickCount) || 0));
    const riseSeconds = kind === BuildVideoKind.TIMELAPSE && count > 1
        ? Math.min(MAX_RISE_SECONDS, Math.max(MIN_RISE_SECONDS, count / BRICKS_PER_SECOND))
        : 0;
    const showSeconds = kind === BuildVideoKind.TURNTABLE ? TURN_SECONDS : FINISHED_SECONDS;
    return Object.freeze({
        kind,
        riseSeconds,
        showSeconds,
        endCardSeconds: END_CARD_SECONDS,
        totalSeconds: riseSeconds + showSeconds + END_CARD_SECONDS
    });
}

// What the video shows `seconds` in, for `timeline` and `brickCount` bricks:
// `{ azimuth, visibleBricks, endCard }`. The camera turns from
// `startAzimuth` at one turn every TURN_SECONDS; `visibleBricks` grows
// steadily over the rising part; `endCard` is how far the end card has faded
// in, 0 to 1.
export function buildVideoFrame(timeline, brickCount, seconds, { startAzimuth = Math.PI / 4 } = {}) {
    const time = Math.min(Math.max(0, Number(seconds) || 0), timeline.totalSeconds);
    const count = Math.max(0, Math.floor(Number(brickCount) || 0));
    const visibleBricks = timeline.riseSeconds > 0 && time < timeline.riseSeconds
        ? Math.min(count, Math.floor((time / timeline.riseSeconds) * count) + 1)
        : count;
    const endCardStart = timeline.totalSeconds - timeline.endCardSeconds;
    const endCard = time <= endCardStart ? 0 : Math.min(1, (time - endCardStart) / END_CARD_FADE_SECONDS);
    return Object.freeze({
        azimuth: startAzimuth + (time / TURN_SECONDS) * Math.PI * 2,
        visibleBricks,
        endCard
    });
}

// The order a time-lapse raises `bricks` in: as indexes into `bricks`, lowest
// first, so nothing appears hanging in the air, and in the order they were
// placed among bricks at the same height.
export function timelapseOrder(bricks) {
    return bricks
        .map((brick, index) => ({ index, y: Number(brick?.position?.y) || 0 }))
        .sort((a, b) => a.y - b.y || a.index - b.index)
        .map((entry) => entry.index);
}

// How much farther than a picture's framing (core/PreviewCameraFraming.js,
// which fits the build in the frame's height) the camera stands so the build
// also fits the width of a frame `aspect` wide (width / height): 1 for a wide
// frame, more for a tall one.
export function videoCameraDistanceScale(aspect, fovDegrees) {
    const vertical = (fovDegrees * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
    return horizontal >= vertical ? 1 : Math.sin(vertical / 2) / Math.sin(horizontal / 2);
}

// `forkbuild-<title>-<kind>.<extension>`.
export function buildVideoFileName(title, kind, extension) {
    const slug = String(title || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return `forkbuild-${slug || 'build'}-${kind}.${extension}`;
}

// The video formats to ask MediaRecorder for, best first: MP4 where the
// browser records it (Safari, recent Chrome), WebM otherwise. YouTube takes
// either.
export const BUILD_VIDEO_MIME_TYPES = Object.freeze([
    'video/mp4;codecs=avc1.42E01F',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
]);

// The same, for a video with sound.
export const BUILD_VIDEO_WITH_SOUND_MIME_TYPES = Object.freeze([
    'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
]);

// The first of BUILD_VIDEO_MIME_TYPES (BUILD_VIDEO_WITH_SOUND_MIME_TYPES, with
// `sound`) `isTypeSupported` accepts, or null.
export function chooseVideoMimeType(isTypeSupported, { sound = false } = {}) {
    for (const type of sound ? BUILD_VIDEO_WITH_SOUND_MIME_TYPES : BUILD_VIDEO_MIME_TYPES) {
        try {
            if (isTypeSupported(type)) return type;
        } catch {
            // A browser that throws for a type doesn't record it.
        }
    }
    return null;
}

// Whether a browser with these globals can record a video of a canvas:
// `globals.MediaRecorder` records one of BUILD_VIDEO_MIME_TYPES and canvases
// have captureStream(). Reads only what it is given.
export function canRecordBuildVideo(globals) {
    const Recorder = globals?.MediaRecorder;
    const canvas = globals?.HTMLCanvasElement?.prototype;
    return Boolean(Recorder && typeof Recorder.isTypeSupported === 'function' && canvas && typeof canvas.captureStream === 'function'
        && chooseVideoMimeType((type) => Recorder.isTypeSupported(type)));
}

export function videoFileExtension(mimeType) {
    return String(mimeType || '').startsWith('video/mp4') ? 'mp4' : 'webm';
}

// YouTube's limit on a title, in characters.
const TITLE_LIMIT = 100;
// The longest link to the build a description carries: YouTube takes 5,000
// characters, and a link that carries its whole build can be longer
// (application/publication/sharing/PublicationLinkPayload.js).
export const DESCRIPTION_LINK_LIMIT = 3500;

// The title and description to paste beside the video where it is uploaded,
// as messages (core/Message.js) the UI turns into text: `{ title, lines }`,
// an empty line where `lines` has null. Credits the author, everyone who built
// it with them and the build it was remixed from, links to the build itself
// (`buildUrl`, when it has one) and to ForkBuild (`appUrl`, tagged so a visit
// from the video is counted as one: core/LaunchChannel.js), and names its
// license. `title` and the names are plain text; `license` is a message or
// text. A tall video is meant for Shorts, so its title says so. A link longer
// than DESCRIPTION_LINK_LIMIT is left out, and `linkLeftOut` says so.
export function describeBuildVideo({
    title, author = '', builtWith = [], remixedFrom = '', license = null, buildUrl = null, appUrl, challengeTag = null, shape = BuildVideoShape.WIDE
}) {
    const name = String(title || '').trim();
    const names = builtWith.map((entry) => String(entry || '').trim()).filter(Boolean);
    const linkLeftOut = Boolean(buildUrl) && buildUrl.length > DESCRIPTION_LINK_LIMIT;
    const link = linkLeftOut ? null : buildUrl;
    const hashtags = ['#ForkBuild', ...(challengeTag ? [`#${challengeTag}`] : []), ...(shape === BuildVideoShape.TALL ? ['#Shorts'] : [])].join(' ');
    const lines = [
        author ? message('video.description.byAuthor', { title: name, author }) : message('video.description.built', { title: name }),
        ...(names.length ? [message('video.description.builtWith', { names: names.join(', ') })] : []),
        ...(remixedFrom ? [message('video.description.remixedFrom', { title: remixedFrom })] : []),
        null,
        ...(link ? [message('video.description.remixLink', { url: link })] : []),
        message('video.description.appLink', { url: appUrl }),
        null,
        ...(license ? [message('video.description.license', { license })] : []),
        hashtags
    ];
    return Object.freeze({
        title: message(shape === BuildVideoShape.TALL ? 'video.description.titleShorts' : 'video.description.title', { title: truncate(name, TITLE_LIMIT - 40) }),
        lines: Object.freeze(lines),
        linkLeftOut
    });
}

// The address ForkBuild's own links from a video use: `appUrl` with
// `?ref=youtube`.
export function videoAppUrl(appUrl) {
    const url = new URL(appUrl);
    url.searchParams.set(LAUNCH_CHANNEL_PARAMETER, 'youtube');
    return url.toString();
}

function truncate(text, length) {
    return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}
