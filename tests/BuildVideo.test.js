// A video of a build (core/app/BuildVideo.js): how long each part lasts, what
// each moment shows, the order a time-lapse raises bricks in, the camera
// standing back for a tall frame, the file it is saved as, the format asked
// for, and the title and description pasted beside it.
import {
    BUILD_VIDEO_MIME_TYPES, BUILD_VIDEO_SIZES, BUILD_VIDEO_WITH_SOUND_MIME_TYPES, DESCRIPTION_LINK_LIMIT, BuildVideoKind, BuildVideoShape, END_CARD_FADE_SECONDS, TURN_SECONDS,
    buildVideoFileName, buildVideoFrame, buildVideoTimeline, canRecordBuildVideo, chooseVideoMimeType, describeBuildVideo,
    timelapseOrder, videoAppUrl, videoCameraDistanceScale, videoFileExtension
} from '../core/app/BuildVideo.js';
import { launchChannelOf } from '../core/app/LaunchChannel.js';
import { message } from '../core/app/Message.js';
import { assert } from './support/Assert.js';

const close = (a, b) => Math.abs(a - b) < 1e-9;

// Sizes: wide for YouTube, tall for Shorts.
{
    const wide = BUILD_VIDEO_SIZES[BuildVideoShape.WIDE];
    const tall = BUILD_VIDEO_SIZES[BuildVideoShape.TALL];
    assert(wide.width === 1280 && wide.height === 720 && tall.width === 720 && tall.height === 1280, 'wide is 1280 × 720, tall 720 × 1280');
    console.log('✓ wide and tall sizes');
}

// Timelines: a turntable turns once; a time-lapse rises at a pace kept
// between 5 and 20 seconds; both end on the end card.
{
    const turntable = buildVideoTimeline(BuildVideoKind.TURNTABLE, 500);
    assert(turntable.riseSeconds === 0 && turntable.showSeconds === TURN_SECONDS, `a turntable has no rising part and turns once (${JSON.stringify(turntable)})`);
    assert(close(turntable.totalSeconds, TURN_SECONDS + turntable.endCardSeconds), 'its length is the turn and the end card');

    assert(buildVideoTimeline(BuildVideoKind.TIMELAPSE, 12).riseSeconds === 5, 'a small build still rises over 5 seconds');
    assert(buildVideoTimeline(BuildVideoKind.TIMELAPSE, 120).riseSeconds === 10, 'a mid-sized one at 12 bricks a second');
    assert(buildVideoTimeline(BuildVideoKind.TIMELAPSE, 5000).riseSeconds === 20, 'a large one in no more than 20 seconds');
    const large = buildVideoTimeline(BuildVideoKind.TIMELAPSE, 5000);
    assert(large.totalSeconds <= 30, `even the longest video stays within half a minute (${large.totalSeconds}s)`);
    assert(buildVideoTimeline(BuildVideoKind.TIMELAPSE, 1).riseSeconds === 0, 'one brick has nothing to rise');

    let threw = false;
    try {
        buildVideoTimeline('slideshow', 3);
    } catch {
        threw = true;
    }
    assert(threw, 'an unknown kind is refused');
    threw = false;
    try {
        buildVideoTimeline(BuildVideoKind.WALKTHROUGH, 3);
    } catch {
        threw = true;
    }
    assert(threw, 'a walk-through is filmed in World View, not drawn on a timeline');
    console.log('✓ timelines');
}

// Frames: bricks appear one by one through the rising part, the camera turns
// steadily, and the end card fades in at the end.
{
    const timeline = buildVideoTimeline(BuildVideoKind.TIMELAPSE, 120);
    assert(buildVideoFrame(timeline, 120, 0).visibleBricks === 1, 'the first brick shows at the start');
    assert(buildVideoFrame(timeline, 120, 5).visibleBricks === 61, `half way, about half the bricks (${buildVideoFrame(timeline, 120, 5).visibleBricks})`);
    assert(buildVideoFrame(timeline, 120, 9.999).visibleBricks === 120, 'all of them by the end of the rising part');
    assert(buildVideoFrame(timeline, 120, 11).visibleBricks === 120, 'and all of them after it');
    let previous = 0;
    for (let s = 0; s <= timeline.riseSeconds; s += 0.1) {
        const { visibleBricks } = buildVideoFrame(timeline, 120, s);
        assert(visibleBricks >= previous, `bricks never disappear (at ${s}s)`);
        previous = visibleBricks;
    }

    const start = buildVideoFrame(timeline, 120, 0, { startAzimuth: 1 });
    const later = buildVideoFrame(timeline, 120, TURN_SECONDS / 4, { startAzimuth: 1 });
    assert(close(start.azimuth, 1) && close(later.azimuth - start.azimuth, Math.PI / 2), 'the camera turns a quarter in a quarter of TURN_SECONDS');

    const endCardStart = timeline.totalSeconds - timeline.endCardSeconds;
    assert(buildVideoFrame(timeline, 120, endCardStart).endCard === 0, 'no end card before its time');
    assert(close(buildVideoFrame(timeline, 120, endCardStart + END_CARD_FADE_SECONDS / 2).endCard, 0.5), 'it fades in');
    assert(buildVideoFrame(timeline, 120, timeline.totalSeconds + 5).endCard === 1, 'and stays to the end, even past it');

    const turntable = buildVideoTimeline(BuildVideoKind.TURNTABLE, 40);
    assert(buildVideoFrame(turntable, 40, 0).visibleBricks === 40, 'a turntable shows every brick from the start');
    assert(buildVideoFrame(turntable, 0, 1).visibleBricks === 0, 'an empty build shows none');
    console.log('✓ frames');
}

// A time-lapse raises the lowest bricks first, in the order they were placed
// among bricks at the same height.
{
    const at = (y) => ({ position: { x: 0, y, z: 0 } });
    const order = timelapseOrder([at(2), at(0), at(1), at(0), at(2)]);
    assert(order.join() === '1,3,2,0,4', `lowest first, placed order within a height (${order})`);
    assert(timelapseOrder([]).length === 0, 'nothing for no bricks');
    console.log('✓ a time-lapse rises from the ground');
}

// A tall frame is narrower than it is high, so the camera stands back to fit
// the build across it.
{
    assert(videoCameraDistanceScale(16 / 9, 35) === 1, 'a wide frame needs no change');
    const tall = videoCameraDistanceScale(9 / 16, 35);
    const vertical = (35 * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * (9 / 16));
    assert(tall > 1.7 && close(tall * Math.sin(horizontal / 2), Math.sin(vertical / 2)), `a tall one stands back until the width fits (${tall})`);
    console.log('✓ the camera stands back for a tall frame');
}

// Files and formats.
{
    assert(buildVideoFileName('Château on the Hill!', BuildVideoKind.TIMELAPSE, 'webm') === 'forkbuild-chateau-on-the-hill-timelapse.webm', 'named after the build and kind');
    assert(buildVideoFileName('', BuildVideoKind.TURNTABLE, 'mp4') === 'forkbuild-build-turntable.mp4', 'an untitled build is "build"');

    assert(chooseVideoMimeType(() => true) === BUILD_VIDEO_MIME_TYPES[0], 'MP4 is preferred where it is recorded');
    assert(chooseVideoMimeType((type) => type.startsWith('video/webm')) === 'video/webm;codecs=vp9', 'otherwise WebM with VP9');
    assert(chooseVideoMimeType(() => false) === null, 'null where nothing is recorded');
    assert(chooseVideoMimeType(() => true, { sound: true }) === BUILD_VIDEO_WITH_SOUND_MIME_TYPES[0]
        && BUILD_VIDEO_WITH_SOUND_MIME_TYPES[0].includes('mp4a'), 'with sound, a format with an audio codec');
    assert(chooseVideoMimeType((type) => type.startsWith('video/webm'), { sound: true }) === 'video/webm;codecs=vp9,opus', 'WebM with Opus otherwise');
    assert(chooseVideoMimeType(() => { throw new Error('no'); }) === null, 'a browser that throws records nothing');
    assert(videoFileExtension('video/mp4;codecs=avc1.42E01F') === 'mp4' && videoFileExtension('video/webm;codecs=vp8') === 'webm', 'the extension follows the format');

    class Recorder { static isTypeSupported(type) { return type === 'video/webm'; } }
    class Canvas {}
    Canvas.prototype.captureStream = () => null;
    assert(canRecordBuildVideo({ MediaRecorder: Recorder, HTMLCanvasElement: Canvas }), 'a browser with MediaRecorder and captureStream can record');
    assert(!canRecordBuildVideo({ HTMLCanvasElement: Canvas }), 'one without MediaRecorder can\'t');
    assert(!canRecordBuildVideo({ MediaRecorder: Recorder, HTMLCanvasElement: class {} }), 'nor one without captureStream');
    assert(!canRecordBuildVideo({}), 'nor Node');
    console.log('✓ file names and formats');
}

// The title and description: credit, the link to the build, ForkBuild's link
// counted as a visit from YouTube, the license and hashtags.
{
    const appUrl = videoAppUrl('https://bowo-prasetyo.github.io/forkbuild/');
    assert(appUrl === 'https://bowo-prasetyo.github.io/forkbuild/?ref=youtube', `ForkBuild's link is tagged (${appUrl})`);
    assert(launchChannelOf(new URL(appUrl).search) === 'youtube', 'and counted as a visit from YouTube');

    const license = message('license.ccBy');
    const described = describeBuildVideo({
        title: 'Harbor', author: 'alice', builtWith: ['bob', ' ', 'carol'], remixedFrom: 'Old Port', license,
        buildUrl: 'https://example.test/n/abc', appUrl, challengeTag: 'lighthouse-20261012', shape: BuildVideoShape.TALL
    });
    assert(described.title.key === 'video.description.titleShorts' && described.title.params.title === 'Harbor', 'a tall video\'s title is for Shorts');
    const keys = described.lines.map((line) => (line === null ? null : line.key ?? line));
    assert(JSON.stringify(keys) === JSON.stringify([
        'video.description.byAuthor', 'video.description.builtWith', 'video.description.remixedFrom', null,
        'video.description.remixLink', 'video.description.appLink', null, 'video.description.license', '#ForkBuild #lighthouse-20261012 #Shorts'
    ]), `credit, links, license and hashtags, in that order (${JSON.stringify(keys)})`);
    assert(described.lines[0].params.author === 'alice' && described.lines[1].params.names === 'bob, carol', 'it credits the author and everyone who built with them');
    assert(described.lines[2].params.title === 'Old Port', 'and the build it remixes');
    assert(described.lines[4].params.url === 'https://example.test/n/abc' && described.lines[5].params.url === appUrl, 'it links to the build and to ForkBuild');
    assert(described.lines[7].params.license === license, 'it names the license');

    const plain = describeBuildVideo({ title: 'Hut', appUrl });
    const plainKeys = plain.lines.map((line) => (line === null ? null : line.key ?? line));
    assert(plain.title.key === 'video.description.title', 'a wide video\'s title is plain');
    assert(JSON.stringify(plainKeys) === JSON.stringify(['video.description.built', null, 'video.description.appLink', null, '#ForkBuild']),
        `a build with no author, link or license still says where it was built (${JSON.stringify(plainKeys)})`);

    assert(described.linkLeftOut === false, 'a short link is kept');
    const longLink = `https://example.test/b/${'a'.repeat(DESCRIPTION_LINK_LIMIT)}`;
    const leftOut = describeBuildVideo({ title: 'Harbor', buildUrl: longLink, appUrl });
    assert(leftOut.linkLeftOut && !leftOut.lines.some((line) => line?.key === 'video.description.remixLink'),
        'a link that carries a large build is too long for a YouTube description: it is left out, and that is said');

    // A remix credits whoever built its original; a non-commercial build says
    // it may not be earned from.
    const remix = describeBuildVideo({
        title: 'Keep', author: 'ben', remixedFrom: 'Castle', remixedFromAuthor: 'ana', license: message('license.ccByNc'), nonCommercial: true, appUrl
    });
    const remixed = remix.lines.find((line) => line?.key === 'video.description.remixedFromBy');
    assert(remixed && remixed.params.title === 'Castle' && remixed.params.author === 'ana', 'a remix names its original\'s builder');
    const keysOfRemix = remix.lines.map((line) => (line === null ? null : line.key ?? line));
    assert(keysOfRemix.indexOf('video.description.nonCommercial') === keysOfRemix.indexOf('video.description.license') + 1,
        `the non-commercial line follows the license (${JSON.stringify(keysOfRemix)})`);
    assert(!described.lines.some((line) => line?.key === 'video.description.nonCommercial'), 'only a non-commercial build says so');

    const long = describeBuildVideo({ title: 'x'.repeat(200), appUrl });
    assert(long.title.params.title.length === 60 && long.title.params.title.endsWith('…'), 'a long title is shortened to fit YouTube\'s limit');
    console.log('✓ the title and description');
}

console.log('✅ All BuildVideo tests passed.');
