// 0.9.133 — Snapshot Discovery Envelope.
//
// content/ArweaveContentStore.js (0.9.132) closed the STORAGE half of the
// gap tests/SnapshotDistributionBoundary.test.js (0.9.131) named — a
// Snapshot's bytes can now be placed on Arweave and handed back a real
// `ContentReference{ hash, uri: ar://<tx-id>, storage: 'ar' }`. Nothing in
// this codebase yet lets a second replica, who was never handed that
// `ContentReference` directly, learn it exists at all. This file names the
// wire shape that closes THAT gap: a small, JSON, content-hash-keyed
// envelope a publisher can announce on Nostr (or any substrate willing to
// carry free-form JSON) so that a caller who only knows a discovery tag
// and a `contentReference.hash` can learn where the bytes for that hash
// claim to be retrievable from.
//
//   ArweaveContentStore#put(bytes) -> ContentReference{ hash, uri, storage }
//                    │
//                    │   { contentHash: reference.hash,
//                    │     locator: reference.uri,
//                    │     storage: reference.storage }
//                    ▼
//   core/SnapshotDiscoveryEnvelope.js   ★ (THIS)
//        describeSnapshotDiscoveryEnvelope()
//        parseSnapshotDiscoveryEnvelope()
//                    │
//                    ▼
//   application/NostrSnapshotDiscoveryPublisher.js / NostrSnapshotDiscoveryQueryService.js
//        (0.9.133, siblings — write this shape into a Nostr event's own
//        `content`, and read it back out)
//
// A DELIBERATELY DIFFERENT SHAPE FROM core/DecentralizedDiscoveryEnvelope.js
// (0.9.30) — NOT A REUSE, NOT AN EXTENSION. That envelope answers "which
// OBJECT (a signed Publication, keyed by `objectId`) does this uri claim to
// be for" — it exists to let a Signed Claim be found by something that
// only has a location, and its own `kind`/`objectId`/`uri` vocabulary is
// shaped around `publisher/Publication.js`'s own identity. A Snapshot has
// no `objectId` of that kind — a `PublicationSnapshotPlacement` (0.8.18)
// is already keyed by `contentHash`, never by a Publication's own id, and
// `application/SnapshotDistributionBoundary.test.js`'s own point 1
// (0.9.131) already proved `contentReference.hash` is the ONE fact a
// Signed Claim's own distribution and a Snapshot's own placement could
// ever share. This envelope is keyed the same way `PublicationSnapshotPlacement`
// already is — `contentHash`/`storage`/`locator`, the identical three field
// names, reused rather than renamed, for the identical reason 0.9.30's own
// header already gave for reusing `uri`/`storage` from 0.9.24: so a future
// milestone bridging the two never needs a field-renaming step first. This
// file's own `protocol` string (`forkbuild-snapshot-discovery`) is
// deliberately distinct from `core/DecentralizedDiscoveryEnvelope.js`'s own
// `forkbuild` — two different envelopes, on the wire, are never
// ambiguous about which contract they claim to satisfy.
//
// A SELF-DECLARED CLAIM, NEVER EVIDENCE, NEVER VERIFICATION. Exactly the
// posture `core/DecentralizedDiscoveryEnvelope.js`'s own header already
// holds, held here for the identical reason: this file validates an
// envelope's own SHAPE only — that it names a recognized protocol/version
// and carries a non-empty `contentHash`/`locator`/`storage` — and nothing
// about whether the locator actually serves those bytes, or whether
// whoever announced it is who they claim to be. Whether a discovered
// locator's own bytes actually hash to the announced `contentHash` remains
// entirely the consuming side's own concern (see application/
// NostrSnapshotDiscoveryQueryService.js's own header, "discovery is not
// verification") — the identical line 0.9.132's own `ArweaveContentStore`
// already drew between "a store can place/retrieve content" and "a store
// forms no opinion about whether a placement is trusted."
//
// TWO ENTRY POINTS, ONE VALIDATION ALGORITHM — mirrors `core/
// DecentralizedDiscoveryEnvelope.js`'s own split exactly.
// `describeSnapshotDiscoveryEnvelope()` validates an already-parsed,
// plain-object candidate. `parseSnapshotDiscoveryEnvelope()` accepts a RAW
// payload — a JSON string (a Nostr event's own `content`) or an
// already-parsed plain object — and describes whichever it ends up with.
//
// MALFORMED INPUT DEGRADES TO `null`, NEVER THROWS — inherited unchanged
// from every file in this family.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO SIGNATURE.
// Every value this file returns is `Object.freeze()`'d; nothing passed in
// is ever mutated. This file never imports `content/ArweaveContentStore.js`,
// `core/PublicationSnapshotPlacement.js`, or anything Nostr-shaped — it
// only names a JSON contract, the identical restraint `core/
// DecentralizedDiscoveryEnvelope.js`'s own header already holds.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. Any signature/authenticity
// mechanism for an envelope; any registry, cache, or deduplication pass
// over more than one; wiring an envelope into `core/
// PublicationSnapshotPlacement.js`'s own signing/catalog machinery or
// `application/SnapshotPlacementResolver.js`'s own resolution path — see
// tests/SnapshotDistributionBoundary.test.js's own point 4: a Snapshot's
// own placement/resolution family stays peer-based and never references
// Nostr; this envelope is consumed only by this milestone's own
// application/NostrSnapshotDiscovery* siblings, never by that family.

const SUPPORTED_ENVELOPE_PROTOCOL = 'forkbuild-snapshot-discovery';
const SUPPORTED_ENVELOPE_VERSION = 1;

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Pure. Describes ONE Snapshot Discovery Envelope out of an already-parsed,
// plain-object `candidate` — see this file's own header for the full shape
// and why it is a self-declared claim, never evidence. Returns `null`,
// never throws, when `candidate` is missing/not a plain object; when
// `candidate.protocol` is not exactly `SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL`;
// when `candidate.version` is not exactly `SNAPSHOT_DISCOVERY_ENVELOPE_VERSION`;
// or when `candidate.contentHash`, `candidate.locator`, or
// `candidate.storage` is missing, empty, or not a string.
export function describeSnapshotDiscoveryEnvelope(candidate) {
    if (!isPlainObject(candidate)) {
        return null;
    }
    if (candidate.protocol !== SUPPORTED_ENVELOPE_PROTOCOL) {
        return null;
    }
    if (candidate.version !== SUPPORTED_ENVELOPE_VERSION) {
        return null;
    }
    if (!isNonEmptyString(candidate.contentHash)) {
        return null;
    }
    if (!isNonEmptyString(candidate.locator)) {
        return null;
    }
    if (!isNonEmptyString(candidate.storage)) {
        return null;
    }
    return Object.freeze({
        protocol: candidate.protocol,
        version: candidate.version,
        contentHash: candidate.contentHash,
        locator: candidate.locator,
        storage: candidate.storage
    });
}

// Pure. Parses `rawPayload` — a JSON string, or an already-parsed plain
// object — and describes it via `describeSnapshotDiscoveryEnvelope()`.
// Returns `null`, never throws, when `rawPayload` is neither a string nor
// a plain object, when a string `rawPayload` fails to parse as JSON, or
// when the resulting object fails validation.
export function parseSnapshotDiscoveryEnvelope(rawPayload) {
    let candidate;
    if (typeof rawPayload === 'string') {
        if (rawPayload.length === 0) {
            return null;
        }
        try {
            candidate = JSON.parse(rawPayload);
        } catch {
            return null;
        }
    } else if (isPlainObject(rawPayload)) {
        candidate = rawPayload;
    } else {
        return null;
    }
    return describeSnapshotDiscoveryEnvelope(candidate);
}

export const SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL = SUPPORTED_ENVELOPE_PROTOCOL;
export const SNAPSHOT_DISCOVERY_ENVELOPE_VERSION = SUPPORTED_ENVELOPE_VERSION;
