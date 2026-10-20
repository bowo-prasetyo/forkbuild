import { describeBuildVideo, videoAppUrl } from '../../../core/app/BuildVideo.js';
import { FORKBUILD_APP_URL } from '../../../core/app/ForkBuildAppLinks.js';
import { challengeOfTags } from '../../../core/challenge/BuildChallenge.js';
import { describeLicense } from '../../../application/document/LicenseLabels.js';
import { LicenseId } from '../../../core/document/License.js';
import { displayText, t } from '../../i18n/i18n.js';

// The words a video of a build carries, in the viewer's language, from the
// build's metadata (core/document/DocumentMetadata.js): the overlay's
// (renderer/BuildVideoOverlay.js) and the title and description to paste
// beside it (core/app/BuildVideo.js#describeBuildVideo()). Shared by Make a video
// (BuildVideoDialog) and the walk-through World View films.

// The address the end card shows, without its scheme: short enough to read
// off a video and type.
export const SHOWN_ADDRESS = FORKBUILD_APP_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');

function builtWithNames(metadata) {
    return metadata.builtWith.map((entry) => entry.name).filter(Boolean);
}

// Who built the build a remix was made from, when it is a remix of someone
// else's: '' otherwise.
function remixedFromAuthor(metadata) {
    if (!metadata.parentDocumentId) return '';
    const original = String(metadata.license?.attribution?.author || '').trim();
    return original && original !== metadata.author ? original : '';
}

// `{ title, credit, badge, call, address, hint }`, for the build `name`. A
// remix of someone else's build credits them on screen too.
export function videoOverlayText(metadata, name) {
    const builtWith = builtWithNames(metadata);
    const byline = metadata.author
        ? (builtWith.length ? t('video.creditWith', { author: metadata.author, names: builtWith.join(', ') }) : t('video.credit', { author: metadata.author }))
        : '';
    const original = remixedFromAuthor(metadata);
    const credit = original
        ? (byline ? t('video.creditRemixOf', { credit: byline, original }) : t('video.creditRemix', { original }))
        : byline;
    return Object.freeze({ title: name, credit, badge: t('video.badge'), call: t('video.call'), address: SHOWN_ADDRESS, hint: t('video.hint') });
}

// What the person making a video of `metadata`'s build should know of its
// license before posting it, if it may be someone else's: a message key, or
// null when the license asks nothing (CC0).
export function videoLicenseNoticeKey(metadata) {
    switch (metadata.license?.id) {
        case LicenseId.CC0_1_0:
            return null;
        case LicenseId.CC_BY_4_0:
        case LicenseId.CC_BY_SA_4_0:
        case LicenseId.CC_BY_ND_4_0:
            return 'video.license.credit';
        case LicenseId.CC_BY_NC_4_0:
            return 'video.license.nonCommercial';
        default:
            return 'video.license.ask';
    }
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
        remixedFromAuthor: remixedFromAuthor(metadata),
        license: describeLicense(license?.id),
        nonCommercial: license?.id === LicenseId.CC_BY_NC_4_0,
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
