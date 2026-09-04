// 0.9.136 — Snapshot Distribution Command.
//
// 0.9.131 named the boundary between Signed Claim distribution and
// Snapshot distribution. 0.9.132 through 0.9.135 then built, connected,
// and audited the entire decentralized Snapshot path —
// `content/ArweaveContentStore.js` (placement), `application/
// NostrSnapshotDiscoveryPublisher.js` (discovery), `application/
// DecentralizedSnapshotResolver.js` (retrieval) — and proved, in
// `tests/SnapshotDistributionAudit.test.js`, that the whole chain
// genuinely works end to end. Every one of those milestones' own headers
// closed with the identical refusal: none of them decides WHEN a
// Snapshot is placed and announced, and 0.9.135's own Section H proved,
// structurally, that nothing wires the chain into any composition root.
// A caller wanting to place-and-announce a Snapshot today has to already
// know to call `contentStore.put()`, read its own `ContentReference`
// back apart, and call `discoveryPublisher.publish()` with exactly the
// right three fields, in exactly the right order — the same "two
// collaborators, one seam nobody has built" gap 0.9.49's own header
// named for the Signed Claim family before it built
// `PublicationDistributionExecutor.js`. This file is that seam, built
// for the Snapshot family instead, and nothing more.
//
//   Snapshot bytes   (a caller already has these — see "bytes are
//        │             supplied, never produced," below)
//        ▼
//   application/SnapshotDistributionCommand.js   ★ (THIS)
//        executeSnapshotDistributionCommand({ bytes, contentStore, discoveryPublisher })
//        │
//        ├──► contentStore.put(bytes)   (content/ArweaveContentStore.js, unmodified —
//        │        or any content/ContentStore.js implementation a caller supplies)
//        │        │
//        │        ▼   ContentReference{ hash, uri, storage }   (never null — see
//        │            content/ContentStore.js's own contract: put() succeeds or throws)
//        │
//        └──► discoveryPublisher.publish({   (application/
//                 contentHash: reference.hash,   NostrSnapshotDiscoveryPublisher.js,
//                 locator: reference.uri,        unmodified)
//                 storage: reference.storage
//             })
//                 │
//                 ▼   { published: true, relayUrl, id } | null
//        │
//        ▼
//   { contentReference, announcement }
//
// AN ASSEMBLY BOUNDARY, NEVER A THIRD STORAGE ADAPTER OR A THIRD
// DISCOVERY PUBLISHER. This file contains no Arweave transaction
// construction, no signing, no gateway HTTP calls, no Nostr event
// construction, and no relay I/O of its own. It calls `contentStore.put()`
// exactly once and `discoveryPublisher.publish()` at most once (only when
// placement actually produced a locator to announce — which, per
// `content/ContentStore.js`'s own contract, is always, since `put()`
// never resolves to anything but a real `ContentReference` or a
// rejection). Every behavior a caller observes through this file is
// entirely `contentStore`'s and `discoveryPublisher`'s own.
//
// COLLABORATORS ARE INJECTED, NEVER IMPORTED CONCRETE — THE SAME
// RESTRAINT `application/PublicationDistributionExecutor.js`'s OWN HEADER
// ALREADY HOLDS FOR THE SIGNED CLAIM FAMILY. `contentStore` and
// `discoveryPublisher` arrive as parameters, duck-typed exactly like
// every other collaborator in the Snapshot distribution family — this
// file never imports `content/ArweaveContentStore.js`, never imports
// `application/NostrSnapshotDiscoveryPublisher.js`, and never performs an
// `instanceof` check against either. A caller most naturally supplies a
// real `ArweaveContentStore` and a real `NostrSnapshotDiscoveryPublisher`,
// but this file works identically against any pair of collaborators that
// satisfy the same two narrow contracts — `content/IpfsContentStore.js`
// included.
//
// PLACEMENT FAILURE PREVENTS DISCOVERY — NOSTR NEVER RECEIVES A LOCATOR
// FOR CONTENT THAT DOES NOT EXIST. If `contentStore.put()` rejects (a
// down gateway, a signer declining, any genuine placement failure), this
// file never calls `discoveryPublisher.publish()` at all — there is no
// `ContentReference` to announce. The rejection propagates to this file's
// own caller unchanged; see "Genuine failure propagates, ordinary decline
// composes," below.
//
// A SUCCESSFUL PLACEMENT IS NEVER ROLLED BACK BECAUSE DISCOVERY DECLINES
// OR FAILS. This file has no `try`/`catch` around `discoveryPublisher.publish()`
// for the purpose of undoing `contentStore.put()`, issues no delete/undo
// call against `contentStore` of any kind, and forms no opinion that a
// missing discovery announcement makes the placement itself
// unsuccessful. A `discoveryPublisher.publish()` call that resolves
// `null` — `application/NostrSnapshotDiscoveryPublisher.js`'s own
// documented "ordinary decline" (malformed input, or the relay itself
// declining) — is composed into this file's own return value as
// `{ contentReference, announcement: null }`, never discarded and never
// treated as a reason to have failed the whole command. The Snapshot IS
// on Arweave; a caller reading this result can still act on
// `contentReference` directly even when `announcement` is `null`.
//
// GENUINE FAILURE PROPAGATES, ORDINARY DECLINE COMPOSES — THE SAME LINE
// `application/PublicationDistributionExecutor.js`'s OWN HEADER ALREADY
// DRAWS FOR THE SIGNED CLAIM FAMILY, HELD HERE UNCHANGED. A
// `discoveryPublisher.publish()` call REJECTING — no relay reachable, a
// timeout, or a caller-side contract violation this class's own
// constructor did not already catch — is not caught, not converted to a
// `null` announcement, and not retried; it propagates to this file's own
// caller unchanged. This is a deliberate, pre-existing codebase
// convention, not a new design decision this file introduces — a caller
// who wants placement recorded even when discovery genuinely fails
// already holds `contentReference` in scope up to the point of that
// rejection (having awaited `contentStore.put()` itself, if calling
// these two collaborators directly instead of through this command), and
// this file makes no attempt to hand that same value back inside a
// rejection, matching every other rejection in this codebase carrying no
// partial-result payload.
//
// `put()` NEVER RETURNS null OR A FAKE ContentReference, SO THIS FILE
// NEVER CHECKS FOR ONE. `content/ContentStore.js`'s own contract (held by
// every concrete implementation in this codebase, `content/
// ArweaveContentStore.js` included) is that `put()` either resolves to a
// real `ContentReference` or rejects — there is no third, degraded
// outcome for this file to compose around, unlike the Signed Claim
// family's own `materialUploader.upload()`, which can resolve `null`.
// This is the one place this file's own sequencing is SIMPLER than
// `application/PublicationDistributionExecutor.js`'s, not a divergence
// from its restraint.
//
// COLLABORATOR CONTRACT VIOLATIONS ARE CAUGHT AT THE START, NOT
// DISCOVERED MID-SEQUENCE. Before either collaborator is ever called,
// this file checks that `contentStore` exposes a `put` function and that
// `discoveryPublisher` exposes both a `publish` function and a non-empty
// `discoveryTag` — and throws immediately if either check fails. This is
// a wiring/configuration failure, not a distribution outcome, the same
// restraint `application/PublicationDistributionExecutor.js`'s own header
// already holds for its own collaborator parameters.
//
// BYTES ARE SUPPLIED, NEVER PRODUCED — THIS FILE NEVER IMPORTS
// `Document`/`World`/`Publication`, AND NEVER COMPUTES A CONTENT HASH OF
// ITS OWN. `bytes` is forwarded to `contentStore.put()` exactly as
// received; `contentStore` itself is the one and only place a content
// hash is ever computed (`content/ArweaveContentStore.js#put()`, via
// `serializer/contentHash.js`) — this file never imports
// `computeContentHash` and never re-derives, re-checks, or re-hashes
// anything `contentStore` already produced.
//
// NO COUPLING TO SIGNED CLAIM DISTRIBUTION. This file never imports
// `application/PublicationDistribution*.js`,
// `application/ArweavePublicationMaterialUploader.js`,
// `application/NostrPublicationDiscoveryPublisher.js`,
// `core/PublicationSnapshotPlacement.js`,
// `application/SnapshotPlacementResolver.js`, or
// `application/SnapshotPlacementStoreRegistry.js` — distributing a
// Snapshot through this command is never itself a Signed Claim
// distribution, and reads nothing from that family — the same boundary
// `content/ArweaveContentStore.js` and `application/
// NostrSnapshotDiscoveryPublisher.js` already hold for themselves,
// extended here to their own new caller.
//
// NO WALLET, BROWSER, OR TRANSPORT CODE OF ANY KIND. This file never
// touches `fetch`, `WebSocket`, a NIP-07 provider, or any Arweave/Nostr
// wire format — every one of those already lives entirely inside
// `contentStore` and `discoveryPublisher`, injected in from outside by
// this file's own caller, exactly as `content/ArweaveContentStore.js`'s
// own `signer`/`fetchImpl` and `application/
// NostrSnapshotDiscoveryPublisher.js`'s own `publishImpl` already require.
//
// NO UI OF ANY KIND. This file has no idea `ui/` exists — no `[E]
// Distribute` action, no World View control, no loading/progress/error
// presentation. Wiring a real UI trigger onto this command remains a
// separate, later, unscheduled step (see docs/Roadmap.md, 0.9.136,
// "Recommendation").
//
// NO RESULT DESCRIBER, NO NEW STATUS VOCABULARY. Unlike the Signed Claim
// family's own `PublicationDistributionResult.js`, this file introduces
// no dedicated result class, no `PENDING`/`PARTIAL`/`DISTRIBUTED`
// vocabulary, and no lifecycle of any kind. It resolves to a plain
// `{ contentReference, announcement }` object — `contentReference` is
// always `contentStore.put()`'s own, unmodified return value;
// `announcement` is always `discoveryPublisher.publish()`'s own,
// unmodified return value, either a real `{ published, relayUrl, id }`
// or `null`. Recording this result anywhere, or building a lifecycle on
// top of it, remains a separate, later, unscheduled step, exactly as
// `application/PublicationDistributionCommand.js`'s own `lifecycleStore`
// concern is for the Signed Claim family — deliberately not built here;
// see "Deliberately excluded," below.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A UI trigger of any kind.** See "No UI of any kind," above.
// - **Composition-root signer/relay configuration, or any concrete
//   Arweave gateway/Nostr relay choice.** `contentStore` and
//   `discoveryPublisher` remain entirely this file's own caller's job to
//   construct, per call.
// - **A `SnapshotDistributionResult` descriptor, a lifecycle store, or
//   any persistence of a distribution result.** See "No result
//   describer, no new status vocabulary," above.
// - **A composition/orchestrator file that builds `contentStore`/
//   `discoveryPublisher` from raw options** (mirroring `application/
//   PublicationDistributionRuntimeComposition.js`). Not needed yet — a
//   caller with real `signer`/`publishImpl` values can already construct
//   both collaborators directly; a composition convenience remains a
//   separate, later, unscheduled step if a real caller ever needs one.
// - **Retries of any kind**, for either `contentStore.put()` or
//   `discoveryPublisher.publish()`.
// - **A registration with `application/commands/`'s own `Command`/
//   `CommandRegistry` pair.** That family is specialized to undoable
//   spatial edits against a live `World` context — distributing a
//   Snapshot is neither undoable nor `World`-scoped, the same exclusion
//   `application/PublicationDistributionCommand.js`'s own header already
//   draws for the identical reason.
// - **Automatic distribution, background distribution, or polling of any
//   kind.** This file is called once per invocation, by a caller who
//   decides entirely for itself when to call it.
// - **Multi-store or multi-relay fan-out.** Exactly one `contentStore`
//   and one `discoveryPublisher` per call — a caller wanting a second
//   storage backend or a second relay calls this function again.
// - **Undoing a distribution, or any withdrawal semantics.**
// - **A "Publication package" combining a Signed Claim and a Snapshot
//   into one coordinated publication.** See "No coupling to Signed Claim
//   distribution," above — that remains a separate, higher-level,
//   unscheduled concern, if ever built at all.

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

// executeSnapshotDistributionCommand({ bytes, contentStore,
//   discoveryPublisher }) -> Promise<{ contentReference, announcement }>.
//
// Sequences `contentStore.put(bytes)` and `discoveryPublisher.publish()`
// — see this file's own header, "Placement failure prevents discovery,"
// for what happens when placement itself fails, and "A successful
// placement is never rolled back," for what happens when discovery
// declines. Throws synchronously, before either collaborator is called
// or any I/O occurs, when `contentStore` does not expose a `put()`
// function or `discoveryPublisher` does not expose both a `publish()`
// function and a non-empty `discoveryTag`. The returned promise rejects
// exactly when `contentStore.put()` or `discoveryPublisher.publish()`
// itself rejects — see "Genuine failure propagates, ordinary decline
// composes," above.
export function executeSnapshotDistributionCommand({
    bytes,
    contentStore,
    discoveryPublisher
} = {}) {
    if (!contentStore || typeof contentStore.put !== 'function') {
        throw new Error('executeSnapshotDistributionCommand: a contentStore with a put() method is required');
    }
    if (!discoveryPublisher || typeof discoveryPublisher.publish !== 'function') {
        throw new Error('executeSnapshotDistributionCommand: a discoveryPublisher with a publish() method is required');
    }
    if (!isNonEmptyString(discoveryPublisher.discoveryTag)) {
        throw new Error('executeSnapshotDistributionCommand: discoveryPublisher must expose a non-empty discoveryTag');
    }

    return runSnapshotDistribution({ bytes, contentStore, discoveryPublisher });
}

// The actual async sequence — split out of executeSnapshotDistributionCommand()
// itself so that collaborator-contract validation (above) throws
// synchronously, on the caller's own call stack, before this function's
// own first `await` ever suspends execution; see this file's own header,
// "Collaborator contract violations are caught at the start, not
// discovered mid-sequence."
async function runSnapshotDistribution({ bytes, contentStore, discoveryPublisher }) {
    const contentReference = await contentStore.put(bytes);

    const announcement = await discoveryPublisher.publish({
        contentHash: contentReference.hash,
        locator: contentReference.uri,
        storage: contentReference.storage
    });

    return { contentReference, announcement };
}
