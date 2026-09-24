import { describeSnapshotDiscoveryEnvelope, SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, SNAPSHOT_DISCOVERY_ENVELOPE_VERSION } from '../core/SnapshotDiscoveryEnvelope.js';
import { withTimeout } from '../utils/withTimeout.js';

const DEFAULT_GATEWAY_URL = 'https://arweave.net';
// Deliberately DISTINCT from application/ArweaveAnnouncementPublisher.js's
// own DEFAULT_TAG_NAME ('ForkBuild-Discovery-Tag') — the same "one Arweave
// Tag NAME per vocabulary" separation application/
// NostrSnapshotDiscoveryPublisher.js already holds against application/
// NostrPublicationDiscoveryPublisher.js one substrate over (that pair both
// default to the identical Nostr tag name 't', but are kept apart by
// `content` shape alone; Arweave has no equivalent free-form `content`
// field to lean on, so the two GraphQL-side query services this codebase
// runs — application/ArweaveGraphqlDiscoveryQueryService.js's own
// 'ForkBuild-Discovery-Tag' and this file's own future 0.9.499 sibling —
// must be able to search by Arweave Tag NAME alone without one vocabulary's
// own transactions leaking into the other's own results).
const DEFAULT_TAG_NAME = 'ForkBuild-Snapshot-Discovery-Tag';
const DEFAULT_TIMEOUT_MS = 15000;
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// 0.9.498 — Arweave Snapshot Discovery Publisher.
//
// 0.9.497's own capability boundary audit (tests/
// ArweaveSnapshotDiscoveryCapabilityBoundaryAudit.test.js) proved, live,
// that Arweave can legitimately carry `core/SnapshotDiscoveryEnvelope.js`
// semantics — a real `contentHash`/`locator`/`storage` candidate, placed by
// `content/ArweaveContentStore.js`, resolves and verifies correctly through
// the existing, UNMODIFIED `application/DecentralizedSnapshotResolver.js` —
// and that neither `application/ArweaveAnnouncementPublisher.js` (Section
// G) nor `application/ArweaveGraphqlDiscoveryQueryService.js` (Section H)
// can carry that vocabulary themselves, each being hardcoded to `core/
// DecentralizedDiscoveryEnvelope.js`'s own, unrelated, objectId-keyed
// shape. This file is the narrow, NEW publisher that audit's own verdict
// named: the Arweave-substrate sibling of `application/
// NostrSnapshotDiscoveryPublisher.js`, one substrate over.
//
//   ArweaveContentStore#put(bytes) -> ContentReference{ hash, uri, storage }
//        │
//        │   { contentHash: reference.hash, locator: reference.uri,
//        │     storage: reference.storage }
//        ▼
//   application/ArweaveSnapshotDiscoveryPublisher.js   ★ (THIS)
//        ArweaveSnapshotDiscoveryPublisher#publish({ contentHash, locator, storage })
//        │
//        │   described = describeSnapshotDiscoveryEnvelope({ protocol, version, ...fields })
//        │   material = JSON.stringify(described)
//        │   tag = { name: tagName, value: discoveryTag }
//        ▼
//   injected uploadTaggedTransaction(material, tag)   (signing, tagging,
//        and broadcast — never performed by this file itself; see "no
//        wallet management," below. The IDENTICAL contract application/
//        ArweaveAnnouncementPublisher.js already consumes, and 0.9.497
//        Section G already proved is envelope-agnostic — application/
//        ArweaveTaggedTransactionUpload.js's own `createArweaveTaggedTransactionUpload()`
//        satisfies it unchanged.)
//        │
//        ▼
//   { id } | null
//        │
//        ▼
//   { published: true, relayUrl: gatewayUrl, id } | null
//
// THE PUBLISHER NEVER DECIDES SNAPSHOT SEMANTICS — THE ONE RULE THIS
// MILESTONE'S OWN REQUESTING BRIEF NAMED FIRST. This file receives an
// already-prepared `contentHash`/`locator`/`storage` (0.9.497 Section
// C/D already traced exactly where those three fields legitimately come
// from — `content/ArweaveContentStore.js#put()`'s own `ContentReference`)
// and does nothing more than describe, serialize, and hand that envelope to
// an injected upload primitive. It never computes a hash (no import of
// `serializer/contentHash.js`), never uploads or re-uploads Snapshot
// content (no import of `content/ArweaveContentStore.js` or `content/
// IpfsContentStore.js`), never invents or rewrites a `locator`, never
// infers `storage`, never resolves material, never queries GraphQL (no
// import of `application/ArweaveGraphqlDiscoveryQueryService.js` or any
// query service in this family), never deduplicates, never retries or
// falls back to a second gateway or a second substrate, never coordinates
// with Nostr (no import of `application/NostrSnapshotDiscoveryPublisher.js`
// — a caller choosing Arweave never also triggers Nostr, and vice versa),
// and never verifies ownership of anything it announces. Every one of
// those remains entirely its caller's concern, exactly as `application/
// NostrSnapshotDiscoveryPublisher.js`'s own header already draws the
// identical line for its own Nostr-facing twin.
//
// REUSES `application/ArweaveTaggedTransactionUpload.js`'S OWN UPLOAD
// PRIMITIVE, UNCHANGED — NEVER `application/ArweaveAnnouncementPublisher.js`
// ITSELF, AND NEVER A SECOND SIGNING/GATEWAY IMPLEMENTATION. 0.9.497
// Section G proved `uploadTaggedTransaction(material, tag) ->
// Promise<{ id } | null>` is genuinely envelope-agnostic — it already
// accepted a Snapshot Discovery Envelope's own material with zero
// awareness of what vocabulary that JSON belongs to. This file is
// therefore the second of two application-semantic publishers built
// directly on that one shared substrate-level adapter:
//
//   Publication announcement   -> application/ArweaveAnnouncementPublisher.js   -> uploadTaggedTransaction
//   Snapshot announcement      -> application/ArweaveSnapshotDiscoveryPublisher.js (THIS) -> uploadTaggedTransaction
//
// No transaction/signing/gateway machinery is duplicated, imported from, or
// delegated through `ArweaveAnnouncementPublisher.js` — that file's own
// `describeDecentralizedDiscoveryEnvelope()` re-validation (0.9.497 Section
// G2) makes it genuinely, structurally incapable of carrying a Snapshot
// envelope; this file is a sibling built beside it, never a wrapper around
// it, and this milestone makes no change to that file at all.
//
// `publish()` STAMPS `protocol`/`version` ITSELF — THE IDENTICAL POSTURE
// `application/NostrSnapshotDiscoveryPublisher.js`'s OWN HEADER ALREADY
// HOLDS, restated here because this file is handed the same bare
// `{ contentHash, locator, storage }` a `ContentReference` already carries,
// never an already-described envelope. `publish()` folds in
// `SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL`/`SNAPSHOT_DISCOVERY_ENVELOPE_VERSION`
// itself, then validates the whole candidate through
// `describeSnapshotDiscoveryEnvelope()` — the same "describe before you
// trust it" discipline every producer in this family already holds.
//
// A DISCOVERY TAG BECOMES A REAL ARWEAVE TAG — THE IDENTICAL PRIMITIVE
// `application/ArweaveAnnouncementPublisher.js`'s OWN HEADER ALREADY NAMES,
// HELD HERE FOR A DIFFERENT DEFAULT TAG NAME. Exactly one Arweave Tag is
// ever attached — `{ name: tagName, value: discoveryTag }` — carrying only
// the free-form search accelerator a caller supplies; `tagName` defaults to
// `ForkBuild-Snapshot-Discovery-Tag`, deliberately distinct from
// `ArweaveAnnouncementPublisher.js`'s own `ForkBuild-Discovery-Tag` default
// — see this file's own `DEFAULT_TAG_NAME` constant, above, for why the two
// vocabularies need separate Arweave Tag NAMES rather than sharing one the
// way the two Nostr publishers share `t`.
//
// `uploadTaggedTransaction` IS ONE INJECTION POINT, NOT SPLIT INTO A
// `signer`/`fetchImpl` PAIR — THE IDENTICAL REASONING `application/
// ArweaveAnnouncementPublisher.js`'s OWN HEADER ALREADY GIVES, held here
// unchanged. Arweave Tags are bound into a transaction's own signed
// fields, so tagging cannot be added after signing; this class asks for
// the whole sign-tag-broadcast sequence as one opaque collaborator. A
// `uploadTaggedTransaction` has exactly this shape:
//
//   (material: string, tag: { name: string, value: string }) ->
//       Promise<{ id: string } | null>
//
// MALFORMED INPUT DEGRADES TO `null` BEFORE `uploadTaggedTransaction` IS
// EVER CONSULTED — THE SAME BOUNDARY EVERY OTHER FILE IN THIS FAMILY
// ALREADY DRAWS. A candidate that fails `describeSnapshotDiscoveryEnvelope()`'s
// own validation resolves to `null` immediately; `uploadTaggedTransaction`
// is never called, and no network activity of any kind occurs.
//
// AN ORDINARY DECLINE ALSO DEGRADES TO `null` — COLLAPSED TOGETHER WITH
// MALFORMED INPUT, THE SAME "TWO CAUSES, ONE OUTCOME" RESTRAINT
// `ArweaveAnnouncementPublisher.js`'s OWN HEADER ALREADY HOLDS. A
// `uploadTaggedTransaction` that resolves `null`/`undefined` (the
// collaborator could not presently place this transaction) is exactly as
// unpublished, from this file's own caller's perspective, as a candidate
// that never made it to `uploadTaggedTransaction` at all — `publish()`
// returns a simple `success | null` result, never a third "declined"
// status a caller must handle specially.
//
// A GENUINE TRANSPORT/SIGNING FAILURE PROPAGATES, NEVER SWALLOWED INTO
// `null`. `uploadTaggedTransaction` itself rejecting (no signing key
// available, no connectivity, a gateway that never answers before this
// class's own `timeoutMs` elapses) is not "this publish did not succeed,"
// it is "could not find out" — it propagates to this class's own caller
// unchanged.
//
// A `uploadTaggedTransaction` THAT RESOLVES BUT VIOLATES ITS OWN CONTRACT
// THROWS — THE SECOND WAY, IDENTICAL TO `ArweaveAnnouncementPublisher.js`.
// If `uploadTaggedTransaction` resolves with a truthy value but a
// missing/malformed `id` (failing the identical `[A-Za-z0-9_-]+`
// transaction-id charset every write-side Arweave class in this codebase
// already enforces), this class throws rather than returning `null`.
//
// AN ANNOUNCEMENT TRANSACTION ID IS NEVER THE LOCATOR, AND THE LOCATOR IS
// NEVER REWRITTEN INTO IT — THE MOST VALUABLE FINDING 0.9.497 SECTION E
// PRODUCED, RESTATED HERE AS THIS FILE'S OWN INVARIANT. The `id` this
// file's own `publish()` returns identifies the ANNOUNCEMENT transaction
// this call itself just created; `described.locator` — carried into
// `material` unmodified — already identifies a wholly separate CONTENT
// transaction a caller placed earlier, entirely outside this file's own
// knowledge. `publish()` never reads its own upload result's `id` back
// into the envelope, never derives `locator` from it, and never confuses
// the two: `contentHash`/`locator`/`storage` describe BYTES already
// placed elsewhere; the returned `id` describes only the fact that THIS
// announcement was accepted for broadcast. See tests/
// ArweaveSnapshotDiscoveryPublisher.test.js's own Section D for the live
// assertion.
//
// SYNCHRONOUS CONSTRUCTION, ASYNCHRONOUS PUBLISH, NO CACHING, NO RETRY, NO
// DEDUPLICATION, NO FAN-OUT TO NOSTR OR ANY OTHER SUBSTRATE. Every call to
// `publish()` builds a fresh material string and calls
// `uploadTaggedTransaction` fresh; this class never constructs, imports,
// or calls `application/NostrSnapshotDiscoveryPublisher.js` — selecting
// Arweave announces to Arweave alone, exactly once per `publish()` call.
//
// A SIMPLE PUBLICATION RESULT, NEVER TRUST OR VERIFICATION SEMANTICS. A
// successful `publish()` means only "the gateway accepted this for
// broadcast" — never that the announced locator actually serves the
// announced content, never that whoever published it is trusted. See
// `core/SnapshotDiscoveryEnvelope.js`'s own header, "a self-declared
// claim, never evidence, never verification."
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **`ArweaveSnapshotDiscoveryQueryService.js`, the inverse read-side
//   transformation.** Named 0.9.499 by 0.9.497's own recommendation —
//   this file only writes, never reads, a discovery substrate.
// - **Any change to `application/ArweaveAnnouncementPublisher.js`,
//   `application/ArweaveTaggedTransactionUpload.js`, `application/
//   ArweaveGraphqlDiscoveryQueryService.js`, `content/ArweaveContentStore.js`,
//   or `core/SnapshotDiscoveryEnvelope.js`.** Every one is consumed only
//   through its own already-public, already-proven contract.
// - **A composition-root wiring this class together with `content/
//   ArweaveContentStore.js` at a real production entry point, or automatic
//   publication of every locally-placed Snapshot.** A caller — unbuilt
//   this milestone — decides WHEN a placed Snapshot is intended for
//   decentralized discovery; this class never decides that on its own.
//   0.9.500 is the later composition-root integration audit that wires
//   this pair into `application/SnapshotCandidateDiscoveryQueryService.js`,
//   per 0.9.496's own recommendation.
// - **Verifying that a published transaction later confirms on Arweave, or
//   is ever actually retained.** A successful `publish()` means only "the
//   collaborator accepted this for broadcast."
// - **Content hashing, content upload, discovery querying, resolution,
//   ownership verification, deduplication, retry/fallback policy, or
//   Nostr coordination of any kind.** See "the publisher never decides
//   Snapshot semantics," above.
export class ArweaveSnapshotDiscoveryPublisher {
    // discoveryTag: the free-form tag VALUE attached to every transaction
    //   this instance publishes — required; see this file's own header, "a
    //   discovery tag becomes a real Arweave tag."
    // gatewayUrl: which Arweave gateway this instance identifies itself as
    //   having announced through — never itself contacted by this class;
    //   mirrors `application/ArweaveAnnouncementPublisher.js`'s own
    //   `relayUrl` field.
    // tagName: which Arweave Tag NAME the discovery tag is attached under —
    //   defaults to `ForkBuild-Snapshot-Discovery-Tag`, deliberately
    //   distinct from `ArweaveAnnouncementPublisher.js`'s own default; see
    //   this file's own `DEFAULT_TAG_NAME` constant, above.
    // uploadTaggedTransaction: see this file's own header, "uploadTaggedTransaction
    //   is one injection point." Required — there is no ambient default.
    // timeoutMs: how long to wait for `uploadTaggedTransaction` to settle
    //   before treating it as a genuine failure.
    constructor({
        discoveryTag,
        gatewayUrl = DEFAULT_GATEWAY_URL,
        tagName = DEFAULT_TAG_NAME,
        uploadTaggedTransaction = null,
        timeoutMs = DEFAULT_TIMEOUT_MS
    } = {}) {
        if (typeof discoveryTag !== 'string' || discoveryTag.length === 0) {
            throw new Error('ArweaveSnapshotDiscoveryPublisher: a non-empty discoveryTag is required');
        }
        if (typeof gatewayUrl !== 'string' || gatewayUrl.trim().length === 0) {
            throw new Error('ArweaveSnapshotDiscoveryPublisher: a non-empty gatewayUrl is required');
        }
        if (typeof tagName !== 'string' || tagName.length === 0) {
            throw new Error('ArweaveSnapshotDiscoveryPublisher: a non-empty tagName is required');
        }
        if (typeof uploadTaggedTransaction !== 'function') {
            throw new Error('ArweaveSnapshotDiscoveryPublisher: no uploadTaggedTransaction implementation available — pass one explicitly');
        }
        this._discoveryTag = discoveryTag;
        this._gatewayUrl = gatewayUrl.replace(/\/+$/, '');
        this._tagName = tagName;
        this._uploadTaggedTransaction = uploadTaggedTransaction;
        this._timeoutMs = timeoutMs;

        // Bound so `publisher.publish` survives being passed around as a
        // bare function reference — the identical reason every sibling in
        // this family already binds its own equivalent method.
        this.publish = this.publish.bind(this);
    }

    get discoveryTag() { return this._discoveryTag; }
    get gatewayUrl() { return this._gatewayUrl; }
    get tagName() { return this._tagName; }

    // publish({ contentHash, locator, storage, publicationId, claimedPosition }) ->
    //   Promise<{ published: true, relayUrl, id } | null>. See this file's
    //   own header for the full contract: `null` for a candidate that
    //   fails `describeSnapshotDiscoveryEnvelope()`'s own validation, and
    //   `null` for a `uploadTaggedTransaction` that resolves
    //   `null`/`undefined` (the collaborator declined); a genuine
    //   `uploadTaggedTransaction` failure (including this class's own
    //   timeout) propagates as a rejection; a `uploadTaggedTransaction`
    //   that resolves truthy but with a missing/malformed `id` throws
    //   rather than degrading to `null`.
    //
    //   `publicationId`/`claimedPosition` (both optional, mirroring
    //   `application/NostrSnapshotDiscoveryPublisher.js`'s own 0.9.171
    //   contract) — forwarded to `describeSnapshotDiscoveryEnvelope()`
    //   completely unchanged; this class adds no validation of its own and
    //   reads neither field for any other purpose.
    //
    //   `id` names the ANNOUNCEMENT transaction this call itself produced —
    //   never `contentHash`, never the CONTENT transaction id already
    //   folded into `locator`. See this file's own header, "an
    //   announcement transaction id is never the locator."
    async publish({ contentHash, locator, storage, publicationId, claimedPosition } = {}) {
        const described = describeSnapshotDiscoveryEnvelope({
            protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
            version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
            contentHash,
            locator,
            storage,
            publicationId,
            claimedPosition
        });
        if (described === null) {
            return null;
        }

        const material = JSON.stringify(described);
        const tag = Object.freeze({ name: this._tagName, value: this._discoveryTag });

        const result = await withTimeout(this._uploadTaggedTransaction(material, tag), this._timeoutMs, 'ArweaveSnapshotDiscoveryPublisher: uploadTaggedTransaction timed out');

        if (result === null || result === undefined) {
            return null;
        }
        if (typeof result.id !== 'string' || !TRANSACTION_ID_PATTERN.test(result.id)) {
            throw new Error('ArweaveSnapshotDiscoveryPublisher: uploadTaggedTransaction resolved with no valid transaction id');
        }

        return Object.freeze({ published: true, relayUrl: this._gatewayUrl, id: result.id });
    }
}

ArweaveSnapshotDiscoveryPublisher.DEFAULT_GATEWAY_URL = DEFAULT_GATEWAY_URL;
ArweaveSnapshotDiscoveryPublisher.DEFAULT_TAG_NAME = DEFAULT_TAG_NAME;
