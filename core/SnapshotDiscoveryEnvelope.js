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
// DELIBERATELY EXCLUDED — NOT THE 0.9.133 MILESTONE THAT ORIGINALLY WROTE
// THIS FILE. Any signature/authenticity mechanism for an envelope; any
// registry, cache, or deduplication pass over more than one; wiring an
// envelope into `core/PublicationSnapshotPlacement.js`'s own
// signing/catalog machinery or `application/SnapshotPlacementResolver.js`'s
// own resolution path — see tests/SnapshotDistributionBoundary.test.js's
// own point 4: a Snapshot's own placement/resolution family stays
// peer-based and never references Nostr; this envelope is consumed only by
// this milestone's own application/NostrSnapshotDiscovery* siblings, never
// by that family.
//
// 0.9.171 — DECENTRALIZED SNAPSHOT WORLD POSITION CLAIM.
//
// Every field this file validated through 0.9.170 answers a question
// about BYTES: what they hash to (`contentHash`), and where they can be
// retrieved from (`locator`/`storage`). None of it ever answered a
// question about SPACE — a stranger's Snapshot, once discovered and
// verified, has always arrived with its spatial meaning already lost (see
// `application/SnapshotWorldPlacement.js`'s own 0.9.159 header: a
// materialized Snapshot is placed only by borrowing the RECEIVER's own,
// already-existing `WorldPlacement` for the same Publication — the
// PUBLISHER's own placement is never consulted at all). This milestone
// adds the two OPTIONAL fields that let a publisher announce it instead:
// `publicationId` (WHICH Publication this Snapshot represents — the exact
// identity `core/WorldPlacement.js` already keys its own placements by)
// and `claimedPosition` (WHERE that publisher's own World currently places
// it — a plain `{x,y,z}`, never a `WorldPlacement`/`Position` instance;
// see "never a domain object," below).
//
// A CLAIM, NEVER A COMMITMENT TO PLACE — restated for a fourth field
// family, the identical posture this file's own header already holds for
// `contentHash`/`locator`/`storage`. `describeSnapshotDiscoveryEnvelope()`
// validates `claimedPosition`'s own SHAPE only (three finite numbers) —
// never that the claimed position is correct, current, or the same one
// the publisher's own World actually shows. Nothing in this file, or in
// `application/NostrSnapshotDiscoveryQueryService.js`, ever turns a
// `claimedPosition` into a `WorldPlacement`, a registry entry, or anything
// rendered — see that file's own header, "consumption is a separate,
// later, unscheduled question," and `application/SnapshotWorldPlacement.js`,
// deliberately UNMODIFIED by this milestone.
//
// `publicationId` AND `claimedPosition` TRAVEL TOGETHER, OR NOT AT ALL —
// THE ONE VALIDATION RULE THIS MILESTONE ADDS. A bare position with no
// named Publication is exactly the ambiguity the brief that requested this
// milestone named directly: two different Publications can share one
// `contentHash` (0.9.163's own collision), so a position claim with no
// `publicationId` to bind it to could belong to either. Rather than
// default a missing `publicationId` to some invented value, or accept a
// position "loosely" attached to a Snapshot's content identity alone, this
// file refuses to describe an envelope carrying ONE of the two fields
// without the other — see `describeSnapshotDiscoveryEnvelope()`'s own
// contract, below. An envelope naming neither field remains exactly the
// 0.9.133-through-0.9.170 shape, byte-for-byte.
//
// BOTH FIELDS ARE OMITTED FROM THE DESCRIBED ENVELOPE ENTIRELY WHEN ABSENT
// — NEVER PRESENT AS `null`. A caller who never supplies a position claim
// gets back the exact same five-key object (`protocol`, `version`,
// `contentHash`, `locator`, `storage`) 0.9.133 already produced — not a
// seven-key object with two `null`s bolted on. This is what keeps every
// pre-0.9.171 announcement, and every pre-0.9.171 test asserting an
// envelope's or a candidate's own exact key set
// (`tests/NostrSnapshotDiscovery.test.js`'s own Section 3c,
// `tests/SnapshotLifecycleSemanticBoundaryAudit.test.js`'s own Section C,
// `tests/SnapshotDiscoverySemanticsAudit.test.js`'s own Section B) passing
// completely unmodified — an announcement that never claims a position
// looks, on the wire, EXACTLY as it always has.
//
// NEVER A DOMAIN OBJECT — `claimedPosition` IS A PLAIN `{x,y,z}`, NEVER A
// `core/WorldPlacement.js` OR `core/Position.js` INSTANCE SERIALIZED
// DIRECTLY. This file never imports either class. A future publisher
// wiring this field to a real `WorldPlacement` reads that placement's own
// `position.toJSON()` (or destructures its own `{x,y,z}` getters) and
// hands THIS file the resulting plain values — the identical
// "protocol-neutral, never a domain class" restraint `application/
// PublicationDistributionDescriptor.js`'s own header already holds for
// `publisher/Publication.js`, one field family over.
//
// STILL NO VERSION BUMP. Both new fields are OPTIONAL additions to the
// existing `SNAPSHOT_DISCOVERY_ENVELOPE_VERSION = 1` shape, not a second,
// competing version — an envelope naming `version: 2` remains exactly as
// undescribable as it always was (see "protocol and version are a
// namespace gate," inherited unchanged). A version bump is warranted only
// when a REQUIRED field's own meaning changes; adding two fields a reader
// is free to ignore is not that.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Consuming `publicationId`/`claimedPosition` anywhere.** See
//   `application/NostrSnapshotDiscoveryQueryService.js`'s own header,
//   "preserved, never consumed" — this milestone only defines and carries
//   the claim; whether a materialized Snapshot's claim should ever become
//   its `WorldPlacement` is `application/SnapshotWorldPlacement.js`'s own,
//   entirely separate, unscheduled next question.
// - **A signature over `claimedPosition`, or any stronger evidence than
//   the self-declared claim every other field here already is.**
// - **Reusing an existing signed position — a `WorldPlacement`'s own
//   `.id`/`.position`, or `core/PublicationAnchor.js` — as the SOURCE this
//   file reads `claimedPosition` from.** That remains entirely a future
//   publisher-side caller's own concern; this file only validates
//   whatever plain `{x,y,z}` it is handed.

const SUPPORTED_ENVELOPE_PROTOCOL = 'forkbuild-snapshot-discovery';
const SUPPORTED_ENVELOPE_VERSION = 1;

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPresent(value) {
    return value !== undefined && value !== null;
}

// Pure. `true` only when `value` is a plain object carrying exactly three
// finite-number coordinates — the shape `claimedPosition` must have to be
// describable at all. Never coerces a numeric string, never accepts
// `NaN`/`Infinity`, and never accepts a `core/Position.js`/`core/
// WorldPosition.js` instance's own extra methods as evidence of validity —
// only the three own values matter.
function isFiniteCoordinates(value) {
    return isPlainObject(value)
        && Number.isFinite(value.x)
        && Number.isFinite(value.y)
        && Number.isFinite(value.z);
}

// Pure. Describes ONE Snapshot Discovery Envelope out of an already-parsed,
// plain-object `candidate` — see this file's own header for the full shape
// and why it is a self-declared claim, never evidence. Returns `null`,
// never throws, when `candidate` is missing/not a plain object; when
// `candidate.protocol` is not exactly `SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL`;
// when `candidate.version` is not exactly `SNAPSHOT_DISCOVERY_ENVELOPE_VERSION`;
// when `candidate.contentHash`, `candidate.locator`, or `candidate.storage`
// is missing, empty, or not a string; when exactly one of
// `candidate.publicationId`/`candidate.claimedPosition` is present without
// the other (0.9.171 — see this file's own header, "travel together, or
// not at all"); when a present `candidate.publicationId` is missing, empty,
// or not a string; or when a present `candidate.claimedPosition` is not a
// plain object with three finite `x`/`y`/`z` numbers.
//
// When both `publicationId` and `claimedPosition` are present and valid,
// the returned envelope carries both, verbatim (`claimedPosition` copied
// field by field into a freshly frozen `{x,y,z}`, never the input
// reference). When both are absent, the returned envelope carries neither
// key at all — see this file's own header, "never present as null."
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

    const hasPublicationId = isPresent(candidate.publicationId);
    const hasClaimedPosition = isPresent(candidate.claimedPosition);
    if (hasPublicationId !== hasClaimedPosition) {
        return null;
    }

    const described = {
        protocol: candidate.protocol,
        version: candidate.version,
        contentHash: candidate.contentHash,
        locator: candidate.locator,
        storage: candidate.storage
    };

    if (hasPublicationId) {
        if (!isNonEmptyString(candidate.publicationId)) {
            return null;
        }
        if (!isFiniteCoordinates(candidate.claimedPosition)) {
            return null;
        }
        described.publicationId = candidate.publicationId;
        described.claimedPosition = Object.freeze({
            x: candidate.claimedPosition.x,
            y: candidate.claimedPosition.y,
            z: candidate.claimedPosition.z
        });
    }

    return Object.freeze(described);
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
