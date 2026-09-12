import { describeDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';

const DEFAULT_GATEWAY_URL = 'https://arweave.net';
// Deliberately the exact literal application/ArweaveGraphqlDiscoveryQueryService.js's
// own DEFAULT_TAG_NAME already uses — duplicated, never imported, the same
// "mirrors this file's own default, matching that file's own default"
// convention application/NostrPublicationDiscoveryPublisher.js already
// follows for its own DEFAULT_TAG_NAME ('t'). A caller who never overrides
// either default gets a publisher and a reader that already agree.
const DEFAULT_TAG_NAME = 'ForkBuild-Discovery-Tag';
const DEFAULT_TIMEOUT_MS = 15000;
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// 0.9.428 — Arweave Announcement Publisher Implementation.
//
// 0.9.427's own audit named the exact, minimal shape this class needed to
// satisfy — proven live against a throwaway `TestOnlyArweaveAnnouncementPublisher`,
// never exported, never shipped. This is that class, for real: the concrete
// Arweave-flavored `discoveryPublisher` `application/
// PublicationDistributionExecutor.js` (0.9.49) already accepts, with zero
// change to that file, `application/PublicationDistributionDescriptor.js`
// (0.9.44), or `application/PublicationDistributionResult.js` (0.9.48) — the
// exact three files 0.9.427 Section G already proved need none.
//
//   Discovery Envelope   (application/PublicationDistributionDescriptor.js,
//        { protocol, version, kind, objectId, uri }   0.9.44, unmodified)
//              │
//              ▼
//   application/ArweaveAnnouncementPublisher.js   ★ (THIS)
//        ArweaveAnnouncementPublisher#publish(envelope)
//              │
//              │   material = JSON.stringify(described envelope)
//              │   tag = { name: tagName, value: discoveryTag }
//              │
//              ▼
//   injected uploadTaggedTransaction(material, tag)   (signing, tagging, and
//        broadcast — never performed by this file itself; see "No wallet
//        management," below)
//              │
//              ▼
//   { id } | null
//              │
//              ▼
//   { published: true, relayUrl: gatewayUrl, id } | null
//
// THE ANNOUNCEMENT FACT, NEVER PUBLICATION CONTENT. This class publishes
// exactly the same `discoveryEnvelope` `application/
// NostrPublicationDiscoveryPublisher.js` already publishes — a small JSON
// object naming where a Publication's material CLAIMS to live (`protocol`,
// `version`, `kind`, `objectId`, `uri`). It never receives, uploads, or
// re-uploads a Publication's own serialized material — that remains entirely
// `application/ArweavePublicationMaterialUploader.js`'s own concern (0.9.45),
// finished before this file is ever called, exactly as `application/
// PublicationDistributionExecutor.js`'s own "stop-on-failure ordering"
// already sequences the two. An announcement transaction this class produces
// and a content transaction `ArweavePublicationMaterialUploader` separately
// produces for the SAME publication remain two distinct Arweave transactions
// — this file never conflates the two roles merely because both happen to
// use the same substrate; see docs/Principles.md's own "External Anchoring
// Provides Evidence; It Does Not Establish Authority" line, held here one
// role over: Arweave already storing CONTENT never implies, and is never
// caused by, an ANNOUNCEMENT.
//
// ONE PROTOCOL ENVELOPE, NEVER TWO — THE SAME RESTRAINT `application/
// NostrPublicationDiscoveryPublisher.js`'s OWN HEADER ALREADY HOLDS. This
// file never builds its own "announcement" shape. `publish()` re-validates
// its own `envelope` argument through `core/DecentralizedDiscoveryEnvelope.js`'s
// own `describeDecentralizedDiscoveryEnvelope()`, unmodified, and serializes
// exactly THAT canonical, already-frozen result via `JSON.stringify()` —
// never the caller's raw argument, never a hand-picked subset of its fields.
// The bytes handed to `uploadTaggedTransaction` are therefore byte-identical,
// field for field, to what `NostrPublicationDiscoveryPublisher#publish()`
// already puts into a Nostr event's own `content` for the identical
// envelope — one shape, defined once by 0.9.30, ridden unmodified by both
// discovery-substrate publishers this codebase now has.
//
// A DISCOVERY TAG BECOMES A REAL ARWEAVE TAG — THE PRIMITIVE 0.9.427 SECTION
// C ALREADY NAMED, NEVER A NEW ONE. `application/
// ArweaveGraphqlDiscoveryQueryService.js` already matches transactions by an
// Arweave Tag's own `name`/`value` pair; this class is the write-side
// counterpart that actually attaches one. Exactly one tag is ever attached —
// `{ name: tagName, value: discoveryTag }`, `tagName` defaulting to the
// identical `ForkBuild-Discovery-Tag` the reader already defaults to — the
// same "a discovery tag, never an envelope field" restraint `application/
// NostrPublicationDiscoveryPublisher.js`'s own header already draws for its
// own Nostr tag, held here for an Arweave Tag instead. `discoveryTag` is
// supplied at construction, once per instance, exactly as it already is for
// Nostr — a publisher announcing many envelopes under one running discovery
// campaign names that campaign's own tag once, not per `publish()` call.
//
// `uploadTaggedTransaction` IS ONE INJECTION POINT, NOT SPLIT INTO A
// `signer`/`fetchImpl` PAIR THE WAY `application/
// ArweavePublicationMaterialUploader.js` AND `anchoring/ArweaveAnchorPublisher.js`
// ALREADY SPLIT THEIRS. Both of those classes delegate ONLY signing to an
// injected `signer` and perform the gateway POST themselves, because neither
// needs an Arweave Tag on the transaction it produces. This class does — an
// announcement transaction is useless for discovery without one — and
// Arweave Tags are bound into a transaction's own signed fields, so tagging
// cannot be added after signing the way a caller might otherwise expect to
// bolt it on post hoc. Rather than widening either existing class's own
// `signer.sign(material)` contract (neither of which this milestone touches
// — see "Deliberately excluded," below) to grow a second, tagging-aware
// shape only this one class would ever use, this class asks for the whole
// sign-tag-broadcast sequence as one opaque collaborator instead — the
// identical reasoning `NostrPublicationDiscoveryPublisher`'s own header
// already gives for treating "sign the event... open transport... send it"
// as one indivisible `publishImpl` step rather than two. A
// `uploadTaggedTransaction` has exactly this shape:
//
//   (material: string, tag: { name: string, value: string }) ->
//       Promise<{ id: string } | null>
//
// where `material` is the announcement's own serialized JSON (never a
// Publication's content), `tag` is the single Arweave Tag this class needs
// attached, and `id` is the Arweave transaction id the signing step already
// deterministically computed — a property of the signed transaction itself,
// never something a gateway assigns on receipt, the same fact `application/
// ArweavePublicationMaterialUploader.js`'s own header already states one
// layer earlier for the identical reason.
//
// NO WALLET MANAGEMENT, NO KEY MANAGEMENT, NO ARWEAVE TRANSACTION-FORMAT
// KNOWLEDGE OF ANY KIND — THE SAME RESTRAINT EVERY OTHER ARWEAVE CLASS IN
// THIS CODEBASE ALREADY HOLDS FOR ITSELF. This class never generates keys,
// never signs a transaction, and never knows what an Arweave transaction's
// own JSON shape (owner, tags, signature, reward, last_tx, …) actually looks
// like — `uploadTaggedTransaction` owns all of it, completely opaque to this
// file. A concrete implementation — real signing, real Arweave Tag
// attachment, a real gateway POST — is later, unscheduled work, the
// identical line `NostrPublicationDiscoveryPublisher`'s own header already
// draws one layer over for its own `publishImpl`.
//
// ONE GATEWAY, ONE DISCOVERY TAG, PER INSTANCE — NO FAN-OUT, NO GATEWAY OR
// TAG SELECTION. `gatewayUrl` names only which gateway this instance's own
// `relayUrl` field identifies itself as (see "The relayUrl field," below);
// it performs no network call of its own and is never itself forwarded into
// `uploadTaggedTransaction`, whose own concrete implementation owns that
// choice. A caller wanting a second discovery tag or a second gateway
// identity constructs a second instance and calls `publish()` again — this
// class never ranks, prefers, or automatically retries anything.
//
// THE `relayUrl` FIELD — A NOSTR WIRE TERM, KNOWINGLY REUSED, NEVER AN
// ARWEAVE RELAY. 0.9.427 Section D found that `application/
// PublicationDistributionExecutor.js` and `application/
// PublicationDistributionResult.js` both read/require a field literally
// named `relayUrl` off whatever a `discoveryPublisher.publish()` call
// resolves with — a Nostr wire term leaking one and two layers up,
// respectively. Rather than rename that field at either layer (an executor/
// result-boundary change this milestone deliberately does not make — see
// "Deliberately excluded," below), this class satisfies the existing
// contract exactly as 0.9.427 Section G's own stand-in already proved
// works: `relayUrl` holds this instance's own `gatewayUrl`, an Arweave
// gateway identity, never a Nostr relay. A future milestone renaming that
// field to something substrate-neutral (e.g. `announcementOrigin`) remains
// real, bounded, and entirely separate from this one.
//
// MALFORMED INPUT DEGRADES TO `null` BEFORE `uploadTaggedTransaction` IS
// EVER CONSULTED — THE SAME BOUNDARY EVERY OTHER FILE IN THIS FAMILY
// ALREADY DRAWS. An `envelope` that fails `describeDecentralizedDiscoveryEnvelope()`'s
// own validation resolves to `null` immediately; `uploadTaggedTransaction`
// is never called, and no network activity of any kind occurs.
//
// AN ORDINARY DECLINE ALSO DEGRADES TO `null` — COLLAPSED TOGETHER WITH
// MALFORMED INPUT, THE SAME "TWO CAUSES, ONE OUTCOME" RESTRAINT
// `NostrPublicationDiscoveryPublisher`'s OWN HEADER ALREADY HOLDS. A
// `uploadTaggedTransaction` that resolves `null` or `undefined` (the
// collaborator could not presently place this transaction) is exactly as
// unpublished, from this file's own caller's perspective, as an envelope
// that never made it to `uploadTaggedTransaction` at all — `publish()`
// returns a simple `success | null` result, never a third "declined" status
// a caller must handle specially.
//
// A GENUINE TRANSPORT/SIGNING FAILURE PROPAGATES, NEVER SWALLOWED INTO
// `null` — one of the two ways this file keeps "an infrastructure exception"
// from silently becoming an application-level announcement fact (see
// `application/PublicationDistributionExecutor.js`'s own header, "genuine
// failure propagates, ordinary decline composes," which this class is
// deliberately built to slot into unchanged). `uploadTaggedTransaction`
// itself rejecting (no signing key available, no connectivity, a gateway
// that never answers before this class's own `timeoutMs` elapses) is not
// "this publish did not succeed," it is "could not find out" — it
// propagates to this class's own caller unchanged. `PublicationDistributionExecutor.js`
// never catches it either, by design; a caller further up decides what a
// rejected distribution attempt means.
//
// A `uploadTaggedTransaction` THAT RESOLVES BUT VIOLATES ITS OWN CONTRACT
// THROWS — THE SECOND WAY. If `uploadTaggedTransaction` resolves with a
// truthy value but a missing/malformed `id` (failing the identical
// `[A-Za-z0-9_-]+` transaction-id charset `application/
// ArweavePublicationMaterialUploader.js` and `anchoring/ArweaveAnchorPublisher.js`
// already enforce), this class throws rather than returning `null` — a
// malformed collaborator response is a bug in how this class was wired, not
// a fact about Arweave, and never allowed to silently masquerade as a real
// announcement.
//
// NEVER DISCOVERY, NEVER CONTENT UPLOAD, NEVER SIGNING A PUBLICATION. This
// file never imports `application/ArweaveGraphqlDiscoveryQueryService.js`,
// `application/DecentralizedWorldDiscoveryQuery.js`, or any verification
// file in this family — it only ever writes, never reads, a discovery
// substrate. It never imports `application/
// ArweavePublicationMaterialUploader.js` or performs any content upload of
// its own — `materialUri` is 0.9.45's own finished output, arriving here
// only as a field already folded into the `envelope` this file is handed.
// It never imports `publisher/Publication.js` or touches a Publication's own
// `signature` — that remains entirely `application/
// PublicationDistributionDescriptor.js`'s own concern, finished before this
// file is ever called.
//
// SYNCHRONOUS CONSTRUCTION, ASYNCHRONOUS PUBLISH, NO CACHING, NO RETRY, NO
// DEDUPLICATION, NO FAN-OUT TO NOSTR OR ANY OTHER SUBSTRATE. Every call to
// `publish()` builds a fresh material string and calls `uploadTaggedTransaction`
// fresh; this class never constructs, imports, or calls `application/
// NostrPublicationDiscoveryPublisher.js` — selecting Arweave announces to
// Arweave alone, exactly once per `publish()` call.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A concrete `uploadTaggedTransaction` implementation — real Arweave Tag
//   attachment, real signing, a real gateway POST, or wallet/key management
//   of any kind.** This file depends only on the `uploadTaggedTransaction(material,
//   tag) -> Promise<{ id } | null>` contract documented above; a concrete
//   implementation is later, unscheduled work, the identical line
//   `NostrPublicationDiscoveryPublisher`'s own header already draws for its
//   own `publishImpl`.
// - **Widening `application/ArweavePublicationMaterialUploader.js`'s or
//   `anchoring/ArweaveAnchorPublisher.js`'s own `signer.sign(material)`
//   contract to accept Arweave Tags.** See "uploadTaggedTransaction is one
//   injection point," above — this milestone touches neither file.
// - **Renaming `relayUrl` to a substrate-neutral field name anywhere.** See
//   "The relayUrl field," above — a real, separate, future change.
// - **Any change to `application/PublicationDistributionExecutor.js`,
//   `application/PublicationDistributionDescriptor.js`, or `application/
//   PublicationDistributionResult.js`.** 0.9.427 Section G already proved
//   none of the three needs one for this class to work.
// - **Multi-substrate fan-out, substrate selection policy, or a fallback
//   from Arweave to Nostr (or vice versa) of any kind.** Selecting which
//   `discoveryPublisher` a caller hands `PublicationDistributionExecutor.js`
//   remains entirely that caller's own decision; this class never makes it
//   and never calls another substrate's own publisher.
// - **Extending `application/ArweaveGraphqlDiscoveryQueryService.js`'s own
//   GraphQL query to request `tags` or a transaction's own data, or any
//   `kind`/`objectId` reconstruction beyond the bare tagged `uri` bar 0.9.427
//   Section A/E already proved is the one actually live today.** Unchanged,
//   unscheduled — this class already fully satisfies that live bar.
// - **A runtime composition wiring this class together with `application/
//   ArweavePublicationMaterialUploader.js` and `application/
//   PublicationDistributionDescriptor.js`.** `application/
//   PublicationDistributionRuntimeComposition.js` already exists for that
//   role and is updated, separately, to be able to construct this class —
//   see that file's own header for exactly what changed.
// - **Verifying that a published transaction later confirms on Arweave, or
//   is ever actually retained.** A successful `publish()` means only "the
//   collaborator accepted this for broadcast" — the identical "broadcast
//   acceptance is not confirmation" line every other write-side Arweave
//   class in this codebase already draws for itself.
export class ArweaveAnnouncementPublisher {
    // discoveryTag: the free-form tag VALUE attached to every transaction
    //   this instance publishes — required; see this file's own header, "a
    //   discovery tag becomes a real Arweave tag."
    // gatewayUrl: which Arweave gateway this instance identifies itself as
    //   having announced through — never itself contacted by this class; see
    //   this file's own header, "the relayUrl field."
    // tagName: which Arweave Tag NAME the discovery tag is attached under —
    //   defaults to the identical name `application/
    //   ArweaveGraphqlDiscoveryQueryService.js`'s own reader defaults to.
    // uploadTaggedTransaction: see this file's own header, "uploadTaggedTransaction
    //   is one injection point." Required — there is no ambient default.
    // timeoutMs: how long to wait for `uploadTaggedTransaction` to settle
    //   before treating it as a genuine failure; see this file's own header,
    //   "a genuine transport/signing failure propagates."
    constructor({
        discoveryTag,
        gatewayUrl = DEFAULT_GATEWAY_URL,
        tagName = DEFAULT_TAG_NAME,
        uploadTaggedTransaction = null,
        timeoutMs = DEFAULT_TIMEOUT_MS
    } = {}) {
        if (typeof discoveryTag !== 'string' || discoveryTag.length === 0) {
            throw new Error('ArweaveAnnouncementPublisher: a non-empty discoveryTag is required');
        }
        if (typeof gatewayUrl !== 'string' || gatewayUrl.trim().length === 0) {
            throw new Error('ArweaveAnnouncementPublisher: a non-empty gatewayUrl is required');
        }
        if (typeof tagName !== 'string' || tagName.length === 0) {
            throw new Error('ArweaveAnnouncementPublisher: a non-empty tagName is required');
        }
        if (typeof uploadTaggedTransaction !== 'function') {
            throw new Error('ArweaveAnnouncementPublisher: no uploadTaggedTransaction implementation available — pass one explicitly');
        }
        this._discoveryTag = discoveryTag;
        this._gatewayUrl = gatewayUrl.replace(/\/+$/, '');
        this._tagName = tagName;
        this._uploadTaggedTransaction = uploadTaggedTransaction;
        this._timeoutMs = timeoutMs;

        // Bound so `publisher.publish` survives being passed around as a
        // bare function reference — the identical reason application/
        // NostrPublicationDiscoveryPublisher.js's own `publish` is bound in
        // its own constructor.
        this.publish = this.publish.bind(this);
    }

    get discoveryTag() { return this._discoveryTag; }
    get gatewayUrl() { return this._gatewayUrl; }
    get tagName() { return this._tagName; }

    // publish(envelope) -> Promise<{ published: true, relayUrl, id } |
    //   null>. See this file's own header for the full contract: `null` for
    //   an `envelope` that fails `describeDecentralizedDiscoveryEnvelope()`'s
    //   own validation, and `null` for a `uploadTaggedTransaction` that
    //   resolves `null`/`undefined` (the collaborator declined); a genuine
    //   `uploadTaggedTransaction` failure (including this class's own
    //   timeout) propagates as a rejection; a `uploadTaggedTransaction` that
    //   resolves truthy but with a missing/malformed `id` throws rather than
    //   degrading to `null`.
    async publish(envelope) {
        const described = describeDecentralizedDiscoveryEnvelope(envelope);
        if (described === null) {
            return null;
        }

        const material = JSON.stringify(described);
        const tag = Object.freeze({ name: this._tagName, value: this._discoveryTag });

        const result = await withTimeout(this._uploadTaggedTransaction(material, tag), this._timeoutMs);

        if (result === null || result === undefined) {
            return null;
        }
        if (typeof result.id !== 'string' || !TRANSACTION_ID_PATTERN.test(result.id)) {
            throw new Error('ArweaveAnnouncementPublisher: uploadTaggedTransaction resolved with no valid transaction id');
        }

        return Object.freeze({ published: true, relayUrl: this._gatewayUrl, id: result.id });
    }
}

ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL = DEFAULT_GATEWAY_URL;
ArweaveAnnouncementPublisher.DEFAULT_TAG_NAME = DEFAULT_TAG_NAME;

// Races `promise` against `timeoutMs`; rejects if the timer fires first — a
// timeout is a genuine failure here, never collapsed to `null`. Byte-for-byte
// the same helper application/NostrPublicationDiscoveryPublisher.js already
// defines for itself — not imported from it, since that helper is not
// exported and the two publishers, though structurally similar, remain two
// independent files by this whole family's own convention. The timer is
// always cleared, whichever settles first.
function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('ArweaveAnnouncementPublisher: uploadTaggedTransaction timed out')), timeoutMs);
        Promise.resolve(promise).then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); }
        );
    });
}
