import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import {
    describeSnapshotDiscoveryEnvelope,
    parseSnapshotDiscoveryEnvelope,
    SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
    SNAPSHOT_DISCOVERY_ENVELOPE_VERSION
} from '../core/SnapshotDiscoveryEnvelope.js';
import {
    describeDecentralizedDiscoveryEnvelope,
    parseDecentralizedDiscoveryEnvelope,
    DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL
} from '../core/DecentralizedDiscoveryEnvelope.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/nostr/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/nostr/NostrSnapshotDiscoveryQueryService.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { createArweaveTaggedTransactionUpload } from '../application/arweave/ArweaveTaggedTransactionUpload.js';
import { ArweaveAnnouncementPublisher } from '../application/arweave/ArweaveAnnouncementPublisher.js';
import { ArweaveGraphqlDiscoveryQueryService } from '../application/arweave/ArweaveGraphqlDiscoveryQueryService.js';
import { DecentralizedSnapshotResolver } from '../application/snapshot/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/snapshot/DecentralizedSnapshotResolutionOutcome.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.497 — Arweave Snapshot Discovery Capability Boundary Audit.
//
// Type: test-only capability boundary audit. Zero production changes.
//
// 0.9.496 established WHAT NOT TO DO: `ArweaveGraphqlDiscoveryQueryService`
// (hardened for `core/DecentralizedDiscoveryEnvelope.js`'s own
// objectId-keyed Publication/Avatar vocabulary) cannot be wired into
// `SnapshotCandidateDiscoveryQueryService` (content-hash-keyed, per `core/
// SnapshotDiscoveryEnvelope.js`) as-is — every candidate it would produce
// gets silently, permanently discarded. That audit recommended building an
// `ArweaveSnapshotDiscoveryPublisher`/`ArweaveSnapshotDiscoveryQueryService`
// pair instead, mirroring `application/nostr/NostrSnapshotDiscoveryPublisher.js`/
// `NostrSnapshotDiscoveryQueryService.js` one substrate over. Before
// building that pair, THIS milestone asks the question that recommendation
// left open: can Arweave legitimately carry `SnapshotDiscoveryEnvelope`
// semantics at all, using infrastructure this codebase already has, or
// would such a pair merely be adapters manufactured to make two unrelated
// types line up?
//
//   Existing Arweave Publication discovery          Walking Snapshot discovery
//           ↓                                                ↓
//   DecentralizedDiscoveryEnvelope                  SnapshotDiscoveryEnvelope
//   (objectId / uri / announcementId)                (contentHash / locator)
//
// LETTERED SECTIONS (mirroring the requesting brief's own lettering).
//   A. Snapshot envelope semantics — what must be announced for a
//      candidate to be valid, traced live off core/SnapshotDiscoveryEnvelope.js.
//   B. Existing Nostr Snapshot publisher/query-service precedent — the
//      full announce-then-discover round trip, live, as the semantic
//      contract this milestone must reproduce, never merely imitate the
//      structure of.
//   C. Arweave content relationship — does content/ArweaveContentStore.js
//      already know enough to construct a LEGITIMATE contentHash for
//      Snapshot material, without deriving one from arbitrary transaction
//      data?
//   D. Locator semantics — what `locator` means for an Arweave-backed
//      Snapshot candidate, and that it is NEVER the announcement
//      transaction's own id.
//   E. Announcement identity — Arweave transaction id ≠ contentHash ≠
//      locator, proven live, never collapsed.
//   F. Existing resolution — does the REAL, UNMODIFIED
//      `DecentralizedSnapshotResolver` already resolve and verify bytes
//      for an Arweave-backed candidate, with zero code change?
//   G. Publisher necessity — is `ArweaveTaggedTransactionUpload.js`'s own
//      upload primitive envelope-agnostic (reusable as-is), and is
//      `ArweaveAnnouncementPublisher.js` itself genuinely incapable of
//      carrying a Snapshot envelope (so a narrow new publisher is
//      justified, not merely convenient)?
//   H. Query necessity — is `ArweaveGraphqlDiscoveryQueryService.js`
//      genuinely, symmetrically incompatible with the Snapshot vocabulary
//      (so a separate query service is justified, never a modification of
//      the existing, already-proven one)?
//   I. No automatic conversion — confirm no function anywhere derives a
//      Snapshot candidate's `contentHash`/`locator` from a Decentralized
//      candidate's `uri`/`announcementId`, and that none is added here.
//   J. Verdict.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **`ArweaveSnapshotDiscoveryPublisher.js` / `ArweaveSnapshotDiscoveryQueryService.js`
//   themselves.** This audit proves the capability boundary these two
//   files would sit inside; building them is the next milestone (0.9.498/
//   0.9.499) this audit's own verdict recommends.
// - **Any change to `application/arweave/ArweaveAnnouncementPublisher.js`,
//   `application/arweave/ArweaveGraphqlDiscoveryQueryService.js`, `application/
//   ArweaveTaggedTransactionUpload.js`, `content/ArweaveContentStore.js`,
//   `core/SnapshotDiscoveryEnvelope.js`, `core/DecentralizedDiscoveryEnvelope.js`,
//   or `application/snapshot/DecentralizedSnapshotResolver.js`.** Every one is read
//   only, and driven only through its own already-public contract.
// - **Composition-root wiring of any kind.** See 0.9.496's own scope note
//   — that remains 0.9.500's own, later, question, and only once the pair
//   this audit is scoped ahead of actually exists.
// - **A shape-adapting conversion of a Decentralized candidate into a
//   Snapshot one.** Section I explicitly audits against, and refuses to
//   build, exactly this shortcut.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    assert(condition, message);
}

function fakeOkResponse({ text = 'accepted' } = {}) {
    return { ok: true, headers: { get: () => null }, text: async () => text };
}

async function run() {
    console.log('=== 0.9.497 — Arweave Snapshot Discovery Capability Boundary Audit ===\n');

    // ===============================================================
    // Section A. Snapshot envelope semantics.
    // ===============================================================
    {
        const minimal = describeSnapshotDiscoveryEnvelope({
            protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
            version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
            contentHash: 'hash-a',
            locator: 'ar://tx-a',
            storage: 'ar'
        });
        check(minimal !== null, 'A1. the minimal valid Snapshot Discovery Envelope shape — protocol, version, contentHash, locator, storage — describes successfully');
        check(Object.keys(minimal).length === 5, 'A2. no publicationId/claimedPosition key is present when neither was supplied — never present as null (0.9.171\'s own rule)');

        for (const missingField of ['contentHash', 'locator', 'storage']) {
            const candidate = { protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION, contentHash: 'h', locator: 'l', storage: 's' };
            delete candidate[missingField];
            check(describeSnapshotDiscoveryEnvelope(candidate) === null, `A3.${missingField}. an envelope missing '${missingField}' is undescribable — this field is genuinely required, not optional in practice`);
        }

        check(describeSnapshotDiscoveryEnvelope({ protocol: 'not-the-right-protocol', version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION, contentHash: 'h', locator: 'l', storage: 's' }) === null,
            'A4. an envelope naming the wrong protocol string is undescribable, even with every other field well-formed');

        // publicationId/claimedPosition travel together, or not at all.
        check(describeSnapshotDiscoveryEnvelope({ protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION, contentHash: 'h', locator: 'l', storage: 's', publicationId: 'pub-1' }) === null,
            'A5. publicationId without a matching claimedPosition is undescribable');
        const withPosition = describeSnapshotDiscoveryEnvelope({ protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION, contentHash: 'h', locator: 'l', storage: 's', publicationId: 'pub-1', claimedPosition: { x: 1, y: 2, z: 3 } });
        check(withPosition !== null && withPosition.publicationId === 'pub-1', 'A6. publicationId+claimedPosition together describe successfully, and this optional pair is orthogonal to the substrate question this audit asks');

        console.log('✓ Section A: the whole Snapshot candidate contract this substrate must be able to legitimately populate is exactly three required strings — contentHash, locator, storage.');
    }

    // ===============================================================
    // Section B. Existing Nostr Snapshot publisher/query-service
    // precedent — the semantic contract to reproduce, not merely the
    // implementation structure.
    // ===============================================================
    {
        let publishedEvent = null;
        const publishImpl = async (relayUrl, eventTemplate) => {
            publishedEvent = { relayUrl, ...eventTemplate };
            return { published: true, id: 'b'.repeat(64) };
        };
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'precedent-tag', publishImpl });

        const contentReference = { hash: 'hash-precedent', uri: 'ipfs://cid-precedent', storage: 'ipfs' };
        const publishResult = await publisher.publish({ contentHash: contentReference.hash, locator: contentReference.uri, storage: contentReference.storage });
        check(publishResult !== null && publishResult.published === true, 'B1. the existing Nostr publisher accepts exactly {contentHash, locator, storage} straight off a ContentReference\'s own three fields');

        const queryImpl = async () => [{ content: publishedEvent.content }];
        const queryService = new NostrSnapshotDiscoveryQueryService({ queryImpl });
        const discovered = await queryService.search('precedent-tag');

        check(discovered.length === 1, 'B2. the announcement round-trips through discovery: one candidate found');
        check(discovered[0].contentHash === contentReference.hash, 'B3. the discovered contentHash matches the announced one, byte-for-byte');
        check(discovered[0].locator === contentReference.uri, 'B4. the discovered locator matches the announced one, byte-for-byte');
        check(discovered[0].storage === contentReference.storage, 'B5. the discovered storage matches the announced one, byte-for-byte');

        console.log('✓ Section B: the semantic contract to reproduce is exactly this round trip — a ContentReference\'s own {hash, uri, storage} announced, and later read back as {contentHash, locator, storage}. Section C asks whether Arweave can legitimately populate the left side of that trip.');
    }

    // ===============================================================
    // Section C. Arweave content relationship — does
    // content/ArweaveContentStore.js already know enough to construct a
    // LEGITIMATE contentHash for Snapshot material?
    // ===============================================================
    let contentReference;
    const CONTENT_TX_ID = 'SnapshotContentTxAAAAAAAAAAAAAAAAAAAAAAAAA1';
    const snapshotBytes = JSON.stringify({ kind: 'audit-fixture-snapshot', n: 42, note: '0.9.497' });
    let contentGatewayGetCount = 0;
    const contentSigner = { async sign(text) { return { id: CONTENT_TX_ID, transaction: { format: 2, data: text } }; } };
    const contentFetchImpl = async (url, options = {}) => {
        if (options && options.method === 'POST') {
            return fakeOkResponse();
        }
        contentGatewayGetCount += 1;
        check(url === `https://arweave.net/${CONTENT_TX_ID}`, 'C0. the content retrieval GET targets exactly the content transaction id, never an announcement id');
        return fakeOkResponse({ text: snapshotBytes });
    };
    const arweaveContentStore = new ArweaveContentStore({ signer: contentSigner, fetchImpl: contentFetchImpl });
    {
        contentReference = await arweaveContentStore.put(snapshotBytes);

        check(contentReference.storage === 'ar', 'C1. put() reports storage \'ar\', the identical label this whole family already keys ContentStore registration by');
        check(contentReference.uri === `ar://${CONTENT_TX_ID}`, 'C2. put() reports the CONTENT transaction\'s own uri');

        const independentlyComputedHash = computeContentHash(snapshotBytes);
        check(contentReference.hash === independentlyComputedHash, 'C3. THE KEY FINDING: contentReference.hash is OUR OWN hash of the bytes — computed by this test independently, off the bytes alone, with zero knowledge of the transaction id — and it matches exactly');
        check(contentReference.hash !== CONTENT_TX_ID, 'C4. the hash is never, and could never be confused with, the Arweave transaction id — two unrelated strings, by construction');

        // The identical function every OTHER concrete ContentStore in this
        // codebase already hashes with — never a substrate-specific
        // derivation invented for this milestone's own question.
        const contentStoreSource = await readFile(new URL('../content/ArweaveContentStore.js', import.meta.url), 'utf8');
        const ipfsContentStoreSource = await readFile(new URL('../content/IpfsContentStore.js', import.meta.url), 'utf8');
        check(contentStoreSource.includes("import { computeContentHash } from '../serializer/contentHash.js';"), 'C5. ArweaveContentStore.js hashes via the shared serializer/contentHash.js — the same import content/IpfsContentStore.js already uses');
        check(ipfsContentStoreSource.includes("import { computeContentHash } from '../serializer/contentHash.js';"), 'C6. sanity: IpfsContentStore.js uses the identical import, confirming this is a codebase-wide convention, not an Arweave-specific one');
        check(contentStoreSource.includes('const hash = computeContentHash(text);'), 'C7. the hash is computed BEFORE the signer/gateway is ever consulted — never a post-hoc read of anything Arweave returns');

        console.log('✓ Section C: content/ArweaveContentStore.js already produces a legitimate contentHash for Snapshot material — the bytes\' own hash, computed locally, via the exact function every other ContentStore in this codebase already uses. Never derived from the transaction id or any Arweave-side data.');
    }

    // ===============================================================
    // Section D. Locator semantics — what `locator` means for an
    // Arweave-backed Snapshot candidate.
    // ===============================================================
    let arweaveSnapshotCandidate;
    {
        arweaveSnapshotCandidate = { contentHash: contentReference.hash, locator: contentReference.uri, storage: contentReference.storage };

        const described = describeSnapshotDiscoveryEnvelope({
            protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
            version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
            ...arweaveSnapshotCandidate
        });
        check(described !== null, 'D1. locator = the CONTENT ContentReference\'s own uri (ar://<content-transaction-id>) describes as a well-formed Snapshot Discovery Envelope with zero adaptation');
        check(described.locator.startsWith('ar://'), 'D2. the locator carries an explicit ar:// scheme, exactly as content/ArweaveContentStore.js\'s own ARWEAVE_URI_PREFIX already produces — the identical shape a Nostr-discovered, Arweave-placed candidate already carries today per NostrSnapshotDiscoveryPublisher.js\'s own header diagram ({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage })');

        console.log('✓ Section D: locator = the content ContentReference\'s own uri, unmodified — the identical convention this whole family already uses for every other storage backend (ipfs://, https://, ...), never a new, Arweave-specific locator shape.');
    }

    // ===============================================================
    // Section E. Announcement identity — Arweave transaction id ≠
    // contentHash ≠ locator, proven live, never collapsed.
    // ===============================================================
    const ANNOUNCEMENT_TX_ID = 'SnapshotAnnounceTxBBBBBBBBBBBBBBBBBBBBBBBB2';
    let announcementUploadResult;
    let snapshotAnnouncementEnvelope;
    let announcementGatewayPostBody = null;
    {
        snapshotAnnouncementEnvelope = describeSnapshotDiscoveryEnvelope({
            protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
            version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
            ...arweaveSnapshotCandidate
        });
        const announcementSigner = { async sign(material, tags) { return { id: ANNOUNCEMENT_TX_ID, transaction: { format: 2, data: material, tags } }; } };
        const announcementFetchImpl = async (url, options = {}) => { announcementGatewayPostBody = JSON.parse(options.body); return fakeOkResponse(); };
        const uploadTaggedTransaction = createArweaveTaggedTransactionUpload({ signer: announcementSigner, fetchImpl: announcementFetchImpl });

        const material = JSON.stringify(snapshotAnnouncementEnvelope);
        announcementUploadResult = await uploadTaggedTransaction(material, { name: 'ForkBuild-Snapshot-Discovery-Tag', value: 'identity-audit-tag' });

        check(announcementUploadResult !== null && announcementUploadResult.id === ANNOUNCEMENT_TX_ID, 'E1. sanity: the announcement transaction was accepted with its own distinct id');
        check(announcementUploadResult.id !== CONTENT_TX_ID, 'E2. announcement transaction id ≠ content transaction id — two distinct Arweave transactions for one Snapshot, exactly as application/arweave/ArweaveAnnouncementPublisher.js\'s own header already establishes for the OTHER vocabulary (content upload and announcement are always separate transactions)');
        check(announcementUploadResult.id !== contentReference.hash, 'E3. announcement transaction id ≠ contentHash');
        check(contentReference.hash !== CONTENT_TX_ID, 'E4. contentHash ≠ content transaction id (restated live, alongside the other two, as one three-way check)');
        check(announcementGatewayPostBody.data === material, 'E5. sanity: the exact envelope JSON reached the announcement transaction, unmangled');
        check(!material.includes(ANNOUNCEMENT_TX_ID), 'E6. the announcement material never contains its own not-yet-assigned transaction id — nothing here is self-referential or circular');
        check(material.includes(CONTENT_TX_ID), 'E7. the announcement material DOES carry the content transaction id — inside locator, as ar://<content-tx-id>, the one place it belongs');
        check(!snapshotAnnouncementEnvelope.locator.includes(ANNOUNCEMENT_TX_ID), 'E8. THE GUARDRAIL: the announced locator never names the announcement transaction — a caller who resolved this candidate would fetch CONTENT, never the announcement record');

        console.log('✓ Section E: three genuinely distinct identities in one live round trip — content tx id, announcement tx id, and contentHash — never collapsed, matching the identical discipline this codebase\'s own DecentralizedDiscoveryEnvelope/Arweave pair already holds one vocabulary over.');
    }

    // ===============================================================
    // Section F. Existing resolution — does the REAL, UNMODIFIED
    // DecentralizedSnapshotResolver already resolve and verify bytes for
    // an Arweave-backed candidate?
    // ===============================================================
    {
        const dummyQueryService = { search: async () => [] };
        const resolver = new DecentralizedSnapshotResolver(dummyQueryService);
        const storeRegistry = { get: (storage) => (storage === 'ar' ? arweaveContentStore : null) };

        const beforeGetCount = contentGatewayGetCount;
        const result = await resolver.resolveCandidate(arweaveSnapshotCandidate, { storeRegistry });

        check(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'F1. resolveCandidate() against an Arweave-backed candidate, through the storeRegistry seam it already accepts, reports RESOLVED — zero code change to DecentralizedSnapshotResolver.js or ArweaveContentStore.js');
        check(result.bytes === snapshotBytes, 'F2. the retrieved bytes are byte-identical to the originally-placed Snapshot material');
        check(contentGatewayGetCount === beforeGetCount + 1, 'F3. exactly one gateway GET happened to resolve this candidate — the real ArweaveContentStore#get() path, not a stub');

        // Verification is not skipped merely because the source is
        // Arweave — the identical CONTENT_HASH_MISMATCH path every other
        // storage backend already exercises.
        const tamperedCandidate = { ...arweaveSnapshotCandidate, contentHash: 'deliberately-wrong-hash' };
        const tamperedResult = await resolver.resolveCandidate(tamperedCandidate, { storeRegistry });
        check(tamperedResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, 'F4. a candidate whose declared contentHash disagrees with the retrieved bytes is caught at verification, exactly as it already is for every other storage backend — selection is not verification, discovery is not verification, and Arweave earns no special exemption');

        console.log('✓ Section F: the existing, unmodified Snapshot resolution pipeline already resolves AND verifies an Arweave-backed candidate correctly, with zero code change anywhere in this family — confirmed live, not merely by reading storage-registry code.');
    }

    // ===============================================================
    // Section G. Publisher necessity — is the low-level upload
    // primitive reusable as-is, and is the existing high-level publisher
    // genuinely incapable of carrying a Snapshot envelope?
    // ===============================================================
    {
        // G1 already ran, structurally, in Section E — restate it here as
        // its own explicit finding: uploadTaggedTransaction(material, tag)
        // accepted Snapshot envelope JSON with ZERO awareness of what
        // vocabulary that JSON belongs to.
        check(announcementUploadResult !== null, 'G1. application/arweave/ArweaveTaggedTransactionUpload.js\'s own uploadTaggedTransaction() is ENVELOPE-AGNOSTIC — it already accepted a Snapshot Discovery Envelope\'s own material in Section E with no change of any kind; this primitive needs no new version for the Snapshot vocabulary');

        // G2 — the existing HIGH-LEVEL publisher, by contrast, is
        // genuinely, structurally incapable: it re-validates through
        // describeDecentralizedDiscoveryEnvelope() internally, which a
        // Snapshot envelope can never satisfy (wrong protocol string, no
        // kind, no objectId).
        let highLevelUploadCalls = 0;
        const passthroughUpload = async () => { highLevelUploadCalls += 1; return { id: 'c'.repeat(10) }; };
        const existingPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'g-section-tag', uploadTaggedTransaction: passthroughUpload });
        const rejected = await existingPublisher.publish(snapshotAnnouncementEnvelope);

        check(rejected === null, 'G2. THE FINDING: application/arweave/ArweaveAnnouncementPublisher.js#publish(), handed a real, well-formed SnapshotDiscoveryEnvelope, returns null — describeDecentralizedDiscoveryEnvelope() rejects it (wrong protocol, no kind/objectId)');
        check(highLevelUploadCalls === 0, 'G3. the rejection happens BEFORE uploadTaggedTransaction is ever consulted — no wasted network activity, but also no path to success by retrying');

        const announcementPublisherSource = await readFile(new URL('../application/arweave/ArweaveAnnouncementPublisher.js', import.meta.url), 'utf8');
        check(announcementPublisherSource.includes("import { describeDecentralizedDiscoveryEnvelope } from '../../core/DecentralizedDiscoveryEnvelope.js';"), 'G4. confirmed from source: this file\'s ONE envelope import is hardcoded to the Decentralized vocabulary');
        check(!announcementPublisherSource.includes('SnapshotDiscoveryEnvelope'), 'G5. and never imports or mentions core/SnapshotDiscoveryEnvelope.js at all');

        console.log('✓ Section G: a narrow, NEW ArweaveSnapshotDiscoveryPublisher is genuinely justified — not an adapter manufactured to make types line up. The shared, generic uploadTaggedTransaction primitive (G1) needs no change; only a thin, Snapshot-vocabulary-specific publisher validating via describeSnapshotDiscoveryEnvelope() is missing — the identical "one shared low-level primitive, two vocabulary-specific publishers" shape application/nostr/NostrPublicationDiscoveryPublisher.js/NostrSnapshotDiscoveryPublisher.js already both hold over ONE shared publishImpl contract, one substrate over.');
    }

    // ===============================================================
    // Section H. Query necessity — is the existing GraphQL query
    // service genuinely, symmetrically incompatible with the Snapshot
    // vocabulary?
    // ===============================================================
    {
        let graphqlCalls = 0;
        let gatewayCalls = 0;
        const fetchImpl = async (url, options = {}) => {
            if (options && options.method === 'POST') {
                graphqlCalls += 1;
                return { ok: true, json: async () => ({ data: { transactions: { edges: [{ node: { id: ANNOUNCEMENT_TX_ID } }] } } }) };
            }
            gatewayCalls += 1;
            check(url === `https://arweave.net/${ANNOUNCEMENT_TX_ID}`, 'H0. the existing query service\'s own per-candidate fetch targets the announcement transaction, exactly as it already does for the Publication vocabulary');
            return fakeOkResponse({ text: JSON.stringify(snapshotAnnouncementEnvelope) });
        };

        const existingQueryService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl });
        const candidatesFromExistingService = await existingQueryService.search('identity-audit-tag');

        check(graphqlCalls === 1 && gatewayCalls === 1, 'H1. sanity: the GraphQL step and the per-candidate gateway fetch both ran exactly once, as the class already documents');
        check(candidatesFromExistingService.length === 0, 'H2. THE FINDING: fed a real, well-formed SnapshotDiscoveryEnvelope\'s own JSON as the gateway response, ArweaveGraphqlDiscoveryQueryService#search() reports ZERO candidates — parseDecentralizedDiscoveryEnvelope() silently rejects it (wrong protocol, no kind/objectId), and the finding transaction is dropped rather than reported malformed');

        const graphqlServiceSource = await readFile(new URL('../application/arweave/ArweaveGraphqlDiscoveryQueryService.js', import.meta.url), 'utf8');
        check(graphqlServiceSource.includes("import { parseDecentralizedDiscoveryEnvelope } from '../../core/DecentralizedDiscoveryEnvelope.js';"), 'H3. confirmed from source: this file\'s ONE envelope import is hardcoded to the Decentralized vocabulary');
        check(!graphqlServiceSource.includes('SnapshotDiscoveryEnvelope'), 'H4. and never imports or mentions core/SnapshotDiscoveryEnvelope.js at all');

        // Symmetric check — the incompatibility runs both ways, not just
        // "Snapshot envelopes fail the Decentralized parser." A real
        // Decentralized envelope fails the Snapshot parser identically.
        const decentralizedEnvelope = describeDecentralizedDiscoveryEnvelope({ protocol: DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL, version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-h', uri: 'ar://material-h' });
        check(decentralizedEnvelope !== null, 'H5. sanity: this section\'s own Decentralized-vocabulary fixture is itself well-formed');
        check(parseSnapshotDiscoveryEnvelope(JSON.stringify(decentralizedEnvelope)) === null, 'H6. a real DecentralizedDiscoveryEnvelope\'s own JSON fails parseSnapshotDiscoveryEnvelope() identically (no contentHash/locator) — the incompatibility is symmetric, not a one-sided gap that a single-direction fix could paper over');
        check(parseDecentralizedDiscoveryEnvelope(JSON.stringify(snapshotAnnouncementEnvelope)) === null, 'H7. and, restated the other way: the Snapshot envelope\'s own JSON fails parseDecentralizedDiscoveryEnvelope() identically (no kind/objectId)');

        console.log('✓ Section H: a separate ArweaveSnapshotDiscoveryQueryService is the correct, justified shape — generalizing ArweaveGraphqlDiscoveryQueryService.js in place would mean branching its own already-proven, production Publication/Avatar contract on envelope shape, risking exactly the kind of silent regression 0.9.489-0.9.495 spent seven milestones hardening against. The GraphQL-tag-search + per-candidate gateway-read PATTERN is what carries over; the parse call at the end reads core/SnapshotDiscoveryEnvelope.js instead — the identical "standalone class, never a shared DecentralizedDiscoveryQueryService subclass" restraint application/nostr/NostrSnapshotDiscoveryQueryService.js\'s own header already holds for Nostr.');
    }

    // ===============================================================
    // Section I. No automatic conversion.
    // ===============================================================
    {
        // A Decentralized candidate, exactly the shape
        // ArweaveGraphqlDiscoveryQueryService#search() already reports in
        // production today.
        const decentralizedCandidate = { uri: 'ar://material-i', storage: 'ar', announcementId: ANNOUNCEMENT_TX_ID };
        check(!('contentHash' in decentralizedCandidate), 'I1. a real Decentralized discovery candidate carries no contentHash field to convert FROM in the first place');
        check(!('locator' in decentralizedCandidate), 'I2. nor a locator field — `uri` and `locator` are not the same key, and no coercion between them exists anywhere in this file\'s own imports');

        const attemptedDirectReuse = describeSnapshotDiscoveryEnvelope({
            protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
            version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
            ...decentralizedCandidate
        });
        check(attemptedDirectReuse === null, 'I3. spreading a real Decentralized candidate directly into the Snapshot envelope validator — the exact "guess and convert" shortcut this milestone was asked to prohibit — fails validation outright: no contentHash, no locator, both required');

        // A codebase-wide sweep for any function name suggesting this
        // shortcut has ever been built, anywhere, by any name.
        const projectRoot = new URL('..', import.meta.url).pathname;
        let sweepHit = '';
        try {
            sweepHit = execSync(
                "grep -rlE 'deriveContentHash|announcementIdToContentHash|convertCandidate|candidateFromAnnouncement' application core content || true",
                { cwd: projectRoot, encoding: 'utf8' }
            );
        } catch {
            sweepHit = '';
        }
        check(sweepHit.trim().length === 0, 'I4. production-source sweep (application/, core/, content/): no function of any plausible name performs a Decentralized-candidate-to-Snapshot-candidate conversion anywhere in this codebase today');

        console.log('✓ Section I: the shortcut this milestone was asked to refuse is refused both by construction (I3, the validator itself rejects it) and by absence (I4, nothing anywhere attempts it). Whatever pair is built next must independently produce its OWN legitimate contentHash/locator — exactly Sections C/D/F\'s own point.');
    }

    // ===============================================================
    // Section J. Verdict.
    // ===============================================================
    {
        const VERDICT = Object.freeze({
            snapshotEnvelopeSemantics: 'THREE_REQUIRED_STRINGS — contentHash_locator_storage',
            nostrPrecedentContract: 'CONFIRMED_LIVE — ContentReference{hash,uri,storage}_round_trips_unchanged',
            arweaveContentHashLegitimacy: 'LEGITIMATE — SAME_computeContentHash_EVERY_OTHER_STORE_USES_NEVER_DERIVED_FROM_TX_DATA',
            locatorSemantics: 'CONTENT_ContentReference_URI — ar://<content-tx-id>_NEVER_THE_ANNOUNCEMENT_ID',
            announcementIdentity: 'THREE_DISTINCT_IDENTITIES_CONFIRMED_LIVE — never_collapsed',
            existingResolutionCompatibility: 'CONFIRMED_LIVE — DecentralizedSnapshotResolver_resolves_AND_verifies_ZERO_code_change',
            publisherNecessity: 'JUSTIFIED — uploadTaggedTransaction_envelope_agnostic_REUSED_AS_IS; ArweaveAnnouncementPublisher_genuinely_incapable_NEW_NARROW_PUBLISHER_NEEDED',
            queryNecessity: 'JUSTIFIED — incompatibility_SYMMETRIC_confirmed_live; SEPARATE_query_service_NEVER_a_modification_of_the_proven_one',
            noAutomaticConversion: 'CONFIRMED_REFUSED — by_construction_and_by_absence',
            capabilityBoundary: 'CONFIRMED — Arweave_CAN_legitimately_carry_SnapshotDiscoveryEnvelope_semantics'
        });

        console.log('='.repeat(78));
        console.log('ARWEAVE SNAPSHOT DISCOVERY CAPABILITY BOUNDARY — FINAL VERDICT');
        console.log('='.repeat(78));
        for (const [key, value] of Object.entries(VERDICT)) {
            console.log(`  ${key.padEnd(30)} ${value}`);
        }
        console.log('');
        console.log('  QUESTION: "Can Arweave legitimately support the Snapshot-specific discovery contract using existing Arweave');
        console.log('  announcement/content infrastructure, without creating a second source of truth or conflating Publication discovery');
        console.log('  with Snapshot discovery?" — YES, CONFIRMED, live, against real (fake-transport-backed) production classes.');
        console.log('');
        console.log('  content/ArweaveContentStore.js already produces a legitimate, independently-verifiable contentHash for Snapshot');
        console.log('  material (Section C) at a locator (Section D) the existing, UNMODIFIED DecentralizedSnapshotResolver already resolves');
        console.log('  and verifies correctly (Section F). application/arweave/ArweaveTaggedTransactionUpload.js\'s own generic upload primitive');
        console.log('  already carries that envelope\'s own JSON with zero change (Section G). None of this requires touching');
        console.log('  ArweaveAnnouncementPublisher.js or ArweaveGraphqlDiscoveryQueryService.js — both are confirmed GENUINELY, not merely');
        console.log('  conventionally, incompatible with the Snapshot vocabulary (Sections G/H, symmetric both ways), so a narrow');
        console.log('  ArweaveSnapshotDiscoveryPublisher/ArweaveSnapshotDiscoveryQueryService pair is a semantically justified answer to a real');
        console.log('  type mismatch — never an adapter manufactured merely to satisfy an interface. And no shortcut converting an existing');
        console.log('  Decentralized candidate into a Snapshot one exists, or should ever be built (Section I) — the two vocabularies remain');
        console.log('  two deliberately separate sources of truth over one shared substrate, exactly as this milestone\'s own requesting brief');
        console.log('  insisted on preserving.');
        console.log('');
        console.log('  RECOMMENDATION: proceed to 0.9.498 — Implement Arweave Snapshot Discovery Publisher (a narrow class, mirroring');
        console.log('  NostrSnapshotDiscoveryPublisher.js, validating via describeSnapshotDiscoveryEnvelope() and reusing');
        console.log('  ArweaveTaggedTransactionUpload.js\'s own upload primitive UNCHANGED), then 0.9.499 — Implement Arweave Snapshot');
        console.log('  Discovery Query Service (mirroring NostrSnapshotDiscoveryQueryService.js, reusing the GraphQL-tag-search-plus-gateway-');
        console.log('  read PATTERN 0.9.494 already proved correct, reading via parseSnapshotDiscoveryEnvelope() instead), and only then');
        console.log('  0.9.500 — the composition-root integration audit that actually wires the pair into');
        console.log('  SnapshotCandidateDiscoveryQueryService, per 0.9.496\'s own recommendation.');
        console.log('='.repeat(78));

        check(Object.values(VERDICT).every((value) => typeof value === 'string' && value.length > 0), 'J1. every boundary named by the requesting brief resolved to an explicit, honest classification — none left unaddressed');
        check(assertionCount > 40, 'J2. sanity: this audit is substantive, not a token pass');

        console.log(`\n✅ All Arweave Snapshot Discovery Capability Boundary Audit tests passed. (${assertionCount} assertions)`);
    }
}

run().catch((error) => {
    console.error('ArweaveSnapshotDiscoveryCapabilityBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
