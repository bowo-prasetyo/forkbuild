import { createId } from '../document/createId.js';

// A heart: one identity saying it loves a published build, or taking that
// back. Each tap is a new record (its own `heartId`), and a person's latest
// record for a Publication is what counts (currentHeartsFor()), so a heart
// can be taken back anywhere the records travel, even where nothing can be
// deleted. Signed for distribution like a comment
// (core/publication/PublicationHeartDistributionEnvelope.js), but its own record, never
// a comment: comment lists and counts never see one.
//
// `authorName` is the name the person chose (their identity's username) at
// the time, kept so "alice and 11 others" can name someone who never
// published a build. It is what they call themselves, never a verified
// fact; the name a person publishes builds under is preferred where known
// (application/publication/identityNames.js).
//
// Never a score: a count of current hearts is a fact about a build as far
// as this device has found, never a rank or sort order
// (docs/principles/achievements.md).
export const MAX_HEART_AUTHOR_NAME_LENGTH = 60;

export class PublicationHeart {
    constructor({
        heartId = createId(),
        publicationId,
        authorIdentityId,
        authorName = null,
        hearted = true,
        createdAt = new Date()
    } = {}) {
        if (!heartId || typeof heartId !== 'string') {
            throw new Error('PublicationHeart requires a heartId');
        }
        if (!publicationId || typeof publicationId !== 'string') {
            throw new Error('PublicationHeart requires a publicationId');
        }
        if (!authorIdentityId || typeof authorIdentityId !== 'string') {
            throw new Error('PublicationHeart requires an authorIdentityId');
        }
        if (typeof hearted !== 'boolean') {
            throw new Error('PublicationHeart: hearted must be true or false');
        }
        if (authorName !== null && typeof authorName !== 'string') {
            throw new Error('PublicationHeart: authorName must be a string or null');
        }
        const createdAtDate = createdAt instanceof Date ? createdAt : new Date(createdAt);
        if (Number.isNaN(createdAtDate.getTime())) {
            throw new Error('PublicationHeart: createdAt must be a valid date');
        }
        const name = authorName === null ? '' : authorName.trim().slice(0, MAX_HEART_AUTHOR_NAME_LENGTH);
        this._heartId = heartId;
        this._publicationId = publicationId;
        this._authorIdentityId = authorIdentityId;
        this._authorName = name || null;
        this._hearted = hearted;
        this._createdAt = createdAtDate;
    }

    get heartId() { return this._heartId; }
    get publicationId() { return this._publicationId; }
    get authorIdentityId() { return this._authorIdentityId; }
    get authorName() { return this._authorName; }
    get hearted() { return this._hearted; }
    get createdAt() { return this._createdAt; }

    toJSON() {
        return {
            heartId: this._heartId,
            publicationId: this._publicationId,
            authorIdentityId: this._authorIdentityId,
            authorName: this._authorName,
            hearted: this._hearted,
            createdAt: this._createdAt.toISOString()
        };
    }

    // Never throws: a record that doesn't validate simply isn't restored.
    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        try {
            return new PublicationHeart(json);
        } catch {
            return null;
        }
    }
}

// Whether `a` supersedes `b` for the same person and build: the later
// record, and between two made at the same moment, the greater heartId, so
// every device settles on the same one.
export function isLaterHeart(a, b) {
    const difference = a.createdAt.getTime() - b.createdAt.getTime();
    return difference !== 0 ? difference > 0 : a.heartId > b.heartId;
}

// Each person's latest record for the Publication, keyed by identity.
export function latestHeartsFor(records, publicationId) {
    const latest = new Map();
    for (const record of Array.isArray(records) ? records : []) {
        if (!(record instanceof PublicationHeart) || record.publicationId !== publicationId) continue;
        const current = latest.get(record.authorIdentityId);
        if (!current || isLaterHeart(record, current)) latest.set(record.authorIdentityId, record);
    }
    return latest;
}

// The people whose latest record for the Publication is a heart, most
// recent first.
export function currentHeartsFor(records, publicationId) {
    return [...latestHeartsFor(records, publicationId).values()]
        .filter((record) => record.hearted)
        .sort((a, b) => (isLaterHeart(a, b) ? -1 : 1));
}
