import { describeBuildVideo, videoAppUrl } from '../../../core/BuildVideo.js';
import { FORKBUILD_APP_URL } from '../../../core/ForkBuildAppLinks.js';
import { challengeOfTags } from '../../../core/BuildChallenge.js';
import { describeLicense } from '../../../application/document/LicenseLabels.js';
import { displayText, t } from '../../i18n/i18n.js';

// The words a video of a build carries, in the viewer's language, from the
// build's metadata (core/DocumentMetadata.js): the overlay's
// (renderer/BuildVideoOverlay.js) and the title and description to paste
// beside it (core/BuildVideo.js#describeBuildVideo()). Shared by Make a video
// (BuildVideoDialog) and the walk-through World View films.

// The address the end card shows, without its scheme: short enough to read
// off a video and type.
export const SHOWN_ADDRESS = FORKBUILD_APP_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');

function builtWithNames(metadata) {
    return metadata.builtWith.map((entry) => entry.name).filter(Boolean);
}

// `{ title, credit, badge, call, address, hint }`, for the build `name`.
export function videoOverlayText(metadata, name) {
    const builtWith = builtWithNames(metadata);
    const credit = metadata.author
        ? (builtWith.length ? t('video.creditWith', { author: metadata.author, names: builtWith.join(', ') }) : t('video.credit', { author: metadata.author }))
        : '';
    return Object.freeze({ title: name, credit, badge: t('video.badge'), call: t('video.call'), address: SHOWN_ADDRESS, hint: t('video.hint') });
}

// `{ title, text, linkLeftOut }` to paste where the video is uploaded;
// `linkLeftOut` when the build's link was too long for a description.
export function videoDescription(metadata, { name, buildUrl = null, shape }) {
    const license = metadata.license;
    const described = describeBuildVideo({
        title: name,
        author: metadata.author || '',
        builtWith: builtWithNames(metadata),
        remixedFrom: metadata.parentDocumentId ? (license?.attribution?.title || '') : '',
        license: describeLicense(license?.id),
        buildUrl,
        appUrl: videoAppUrl(FORKBUILD_APP_URL),
        challengeTag: challengeOfTags(metadata.tags)?.tag ?? null,
        shape
    });
    return Object.freeze({
        title: t(described.title),
        text: described.lines.map((line) => (line === null ? '' : displayText(line))).join('\n'),
        linkLeftOut: described.linkLeftOut
    });
}

// Saves `blob` to the person's downloads as `filename`.
export function downloadVideo(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    // The download has started by the time this runs; revoking sooner can cancel it in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}
