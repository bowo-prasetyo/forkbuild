import { derivePlaceNamingDiscoveryTag, parsePlaceNamingDiscoveryEnvelope } from '../../core/PlaceNamingDiscoveryEnvelope.js';
import { snapshotCellTag, SNAPSHOT_CELL_TAG_PREFIX } from '../../core/NarrowDiscoveryTags.js';
import { isNonEmptyString, isPlainObject } from '../../utils/typeGuards.js';

// Each kind turns one raw discovery result into the payload the Announcement
// Index stores and the key it is stored under, or null to refuse it. See
// docs/AnnouncementIndex.md, "Records". The checks are structural only:
// signatures are still verified by whoever reads the payload back.

export const AnnouncementKind = Object.freeze({
    SNAPSHOT: 'snapshot',
    PLACE_NAMING: 'place-naming',
    PUBLICATION: 'publication'
});

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function isPosition(value) {
    return isPlainObject(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.z);
}

// Same identity SnapshotCandidateDiscoveryQueryService deduplicates by. Under
// a map cell tag, the claimed position must lie in that cell, so a relay that
// ignores the tag filter, or an announcer that mislabels one, cannot fill
// another cell's list.
function normalizeSnapshotCandidate(candidate, tag) {
    if (!isPlainObject(candidate)
        || !isNonEmptyString(candidate.contentHash)
        || !isNonEmptyString(candidate.locator)
        || !isNonEmptyString(candidate.storage)) {
        return null;
    }
    const payload = { contentHash: candidate.contentHash, locator: candidate.locator, storage: candidate.storage };
    // The envelope carries these two together or not at all.
    if (isNonEmptyString(candidate.publicationId) && isPosition(candidate.claimedPosition)) {
        payload.publicationId = candidate.publicationId;
        payload.claimedPosition = { x: candidate.claimedPosition.x, y: candidate.claimedPosition.y, z: candidate.claimedPosition.z };
    }
    if (typeof tag === 'string' && tag.startsWith(SNAPSHOT_CELL_TAG_PREFIX) && snapshotCellTag(payload.claimedPosition) !== tag) {
        return null;
    }
    return { key: `${payload.storage} ${payload.contentHash} ${payload.locator}`, payload };
}

// The signature is part of the key so a forged copy published under a real
// claim id is kept beside the real claim, never in its place.
function normalizePlaceNamingEnvelope(raw, tag) {
    const envelope = parsePlaceNamingDiscoveryEnvelope(raw);
    if (!envelope || derivePlaceNamingDiscoveryTag(envelope.worldId, envelope.regionId) !== tag) {
        return null;
    }
    const payload = JSON.parse(JSON.stringify(envelope));
    const signature = payload.claim.signature;
    const signatureValue = isPlainObject(signature) && isNonEmptyString(signature.signature)
        ? signature.signature
        : JSON.stringify(signature);
    return { key: `${payload.claim.id} ${signatureValue}`, payload };
}

// A lead's origin decides which material source resolves it, so the same URI
// from two origins is two records.
function normalizePublicationLead(candidate, _tag, origin) {
    if (!isPlainObject(candidate) || !isNonEmptyString(candidate.uri) || !isNonEmptyString(origin)) {
        return null;
    }
    const payload = { uri: candidate.uri, storage: isNonEmptyString(candidate.storage) ? candidate.storage : null };
    return { key: `${origin} ${payload.uri}`, payload };
}

export const ANNOUNCEMENT_KINDS = Object.freeze({
    [AnnouncementKind.SNAPSHOT]: Object.freeze({ normalize: normalizeSnapshotCandidate }),
    [AnnouncementKind.PLACE_NAMING]: Object.freeze({ normalize: normalizePlaceNamingEnvelope }),
    [AnnouncementKind.PUBLICATION]: Object.freeze({ normalize: normalizePublicationLead })
});
