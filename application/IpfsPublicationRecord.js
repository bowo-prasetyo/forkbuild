const IPFS_URI_PREFIX = 'ipfs://';

// 0.8.69 — IPFS Publication Record & Content-Identity Binding.
//
// 0.8.67/0.8.68 gave a person an explicit way to publish to a remote
// pinning provider and see, once, what that one provider call returned
// — `application/IpfsRemotePublicationCoordinator.js`'s own outcome,
// alive for exactly as long as the reactive UI state holding it. This
// class is the durable, replayable shape of that same fact, independent
// of any one coordinator call: the one thing this codebase now knows
// about a publish, stated the way `core/ContentReference.js`'s own
// header has always insisted it be stated —
//
//   contentHash ───────────► what the bytes are
//         │
//         └──► locator (ipfs://CID) ───► where to retrieve them
//
// never the other way around. A `contentHash` is never derived FROM a
// `locator` anywhere in this class — both are supplied, independently,
// by whatever produced them (typically `application/
// IpfsRemotePublicationCoordinator.js`'s own PUBLISHED outcome, whose
// `contentHash` already came from `core/ContentReference.js#hash`, never
// from the CID `content/IpfsRemotePinningContentStore.js#put()` handed
// back — see that coordinator's own header, "the CID stays a locator").
//
// `publicationMethod` is OPTIONAL, and deliberately just a plain string
// from `IpfsPublicationMethod` below — never required, because a record
// built from a source this class does not yet know about (a future
// backend, a hand-typed test fixture) is still a perfectly legitimate
// record without one. When present, it distinguishes WHICH of this
// codebase's two existing publish paths produced the locator —
// `content/IpfsContentStore.js` (local Kubo) or `content/
// IpfsRemotePinningContentStore.js` (remote pinning, 0.8.67) — a
// distinction already real in this codebase's own module layout, never
// invented fresh here.
//
// NO PROVIDER CREDENTIALS, NO PROVIDER-SPECIFIC RESPONSE OBJECTS, AND NO
// PROVIDER "SUCCESS SCORE" OF ANY KIND. This record carries exactly the
// three facts named above, plus `publicationMethod` — never an
// `endpoint`, never a raw provider response, never a `confidence` or
// `trusted` field. A caller that wants the endpoint a remote publish
// used keeps `application/IpfsRemotePublicationCoordinator.js`'s own
// outcome for that; this record is deliberately narrower, because a
// caller checking content identity later has no legitimate use for who
// was asked to pin it or how many times.
//
// NEVER SIGNED, NEVER GIVEN AN `id`, AND NEVER PERSISTED BY THIS FILE.
// Unlike `core/PublicationAnchor.js` or `core/PublicationSnapshotPlacement
// .js` — both signed, catalogued protocol envelopes with their own
// schema version and signing descriptor — this is a plain, local value
// object. It is never published as content itself, never exchanged with
// a peer, and never wired into any catalog or store by this milestone;
// see `docs/Roadmap.md`, 0.8.69's own "Deliberately excluded" list, for
// why that step is left for later, separately sized work.
export const IpfsPublicationMethod = Object.freeze({
    KUBO: 'kubo',
    REMOTE_PINNING: 'remote-pinning'
});

export function isValidIpfsPublicationMethod(value) {
    return Object.values(IpfsPublicationMethod).includes(value);
}

export class IpfsPublicationRecord {
    constructor({ contentHash, locator, publishedAt, publicationMethod = null } = {}) {
        if (typeof contentHash !== 'string' || !contentHash.trim()) {
            throw new Error('IpfsPublicationRecord requires a contentHash');
        }
        if (typeof locator !== 'string' || !locator.startsWith(IPFS_URI_PREFIX) || locator.length <= IPFS_URI_PREFIX.length) {
            throw new Error('IpfsPublicationRecord requires an ipfs:// locator');
        }
        const publishedAtDate = publishedAt instanceof Date ? publishedAt : new Date(publishedAt);
        if (Number.isNaN(publishedAtDate.getTime())) {
            throw new Error('IpfsPublicationRecord: publishedAt must be a valid date');
        }
        if (publicationMethod !== null && !isValidIpfsPublicationMethod(publicationMethod)) {
            throw new Error(`IpfsPublicationRecord: publicationMethod must be one of ${Object.values(IpfsPublicationMethod).join(', ')}, or null`);
        }
        this._contentHash = contentHash;
        this._locator = locator;
        this._publishedAt = publishedAtDate;
        this._publicationMethod = publicationMethod;
    }

    get contentHash() { return this._contentHash; }
    get locator() { return this._locator; }
    get publishedAt() { return this._publishedAt; }
    get publicationMethod() { return this._publicationMethod; }

    toJSON() {
        return {
            contentHash: this._contentHash,
            locator: this._locator,
            publishedAt: this._publishedAt.toISOString(),
            publicationMethod: this._publicationMethod
        };
    }

    static fromJSON(json) {
        if (!json) return null;
        return new IpfsPublicationRecord({
            contentHash: json.contentHash,
            locator: json.locator,
            publishedAt: json.publishedAt ? new Date(json.publishedAt) : new Date(),
            publicationMethod: json.publicationMethod || null
        });
    }
}
