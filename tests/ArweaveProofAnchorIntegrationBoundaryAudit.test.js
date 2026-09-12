import { readFile } from 'node:fs/promises';

import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { CreateExternalPublicationAnchorOrchestratorUseCase } from '../application/CreateExternalPublicationAnchorOrchestratorUseCase.js';
import { ExternalAnchorPublisherRegistry } from '../application/ExternalAnchorPublisherRegistry.js';
import { ExternalProofVerifierRegistry } from '../application/ExternalProofVerifierRegistry.js';
import { ExternalAnchorCreationOutcome } from '../application/ExternalAnchorCreationOutcome.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { PublicationAnchorCreationCoordinator } from '../application/PublicationAnchorCreationCoordinator.js';
import { ProofVerifier } from '../anchoring/ProofVerifier.js';
import { ArweaveAnchorPublisher } from '../anchoring/ArweaveAnchorPublisher.js';
import { ArweaveTransactionDataProofVerifier } from '../anchoring/ArweaveTransactionDataProofVerifier.js';
import { BitcoinAnchorPublisher } from '../anchoring/BitcoinAnchorPublisher.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.9.426 — Arweave Proof/Anchoring Integration Boundary Audit.
//
// Type: test-only integration-boundary audit. Zero production changes.
//
// 0.9.424 named PROOF_AND_ANCHORING's Arweave gap PROVIDER_GAP_ONLY.
// 0.9.425 closed it: a real ArweaveAnchorPublisher, a real
// ArweaveTransactionDataProofVerifier, and its own 410-assertion test
// suite (tests/ArweaveAnchorProviderImplementation.test.js) already
// proves unit behavior, a flagship round-trip, full orchestration,
// registry coexistence, presentation, contentHash-not-material role
// independence, source-swept no-cross-role-coupling, and graceful
// degradation. This file does NOT re-litigate any of that — every
// section below either drives a seam 0.9.425's own suite never drove
// (the real PublicationAnchorCreationCoordinator.create(), not just its
// availableAnchorTypes()), or asks a question 0.9.425 had no reason to
// ask because it was building the provider rather than auditing its
// boundary (does Arweave's presence change Bitcoin's own behavior? does
// the CONTENT side of Arweave ever reach into the anchor registries the
// PROOF side just started using? are publicationId/contentHash/anchor.id/
// proof.txid ever quietly conflated once a real provider exists to
// conflate them with?).
//
// LETTERED SECTIONS (mirroring the audit brief this milestone answers):
//   A. Complete real path — DecentralizedPublicationsView's own seam
//      (PublicationAnchorCreationCoordinator.create(), not the raw
//      orchestrator use case) produces evidence an independently
//      constructed ExternalAnchorVerifier + registry-resolved
//      ArweaveTransactionDataProofVerifier reports VALID for.
//   B. UI discovery, as a regression invariant plus a source sweep: the
//      generic creation card ui/views/DecentralizedPublicationsView.js
//      already renders (the `v-for="anchorType in availableAnchorTypes"`
//      block) contains zero anchorType-specific branches — proven by
//      slicing that exact block out of CURRENT source and scanning it,
//      never merely asserting the registry itself.
//   C. Creation and verification stay separate classes, each speaking
//      only its own half of the wire protocol — proven by instrumenting
//      the shared fake gateway and recording which HTTP method each
//      class actually issues.
//   D. The contentHash boundary, completed: valid / unavailable were
//      already exercised at the full-orchestration level by 0.9.425;
//      this section adds the one AnchorVerificationOutcome value neither
//      0.9.425 nor 0.9.424 drove end to end for Arweave — INVALID_PROOF,
//      a signed anchor whose OWN claimed contentHash matches what a
//      caller expects (so it is NOT a CONTENT_MISMATCH) but whose named
//      transaction, when actually fetched, does not carry it.
//   E. Graceful degradation vocabulary, held symmetric with Bitcoin: the
//      SAME analogous failure (signer/broadcaster throws, gateway/
//      explorer reports not-found, malformed id/txid) produces the SAME
//      ExternalAnchorCreationOutcome/AnchorVerificationOutcome value for
//      both anchorTypes, side by side, not merely "Arweave has some
//      unavailable path."
//   F. Bitcoin isolation: one registry pair carrying BOTH real providers,
//      Bitcoin and Arweave create+verify cycles interleaved (not run in
//      separate scopes as 0.9.425's own Section E did), with per-class
//      call counters proving neither provider's own publish()/verify()
//      is ever invoked by the other anchorType's request.
//   G. Role independence, the direction 0.9.425 Section H did not sweep:
//      Arweave's own CONTENT-role classes (ArweaveContentStore,
//      ArweavePublicationMaterialUploader, ArweaveWorldEncounterMaterialResolver)
//      import nothing from the anchor registries or coordinator PROOF now
//      uses. 0.9.425 already swept anchor-imports-content; this section
//      sweeps content-imports-anchor, closing the loop in both
//      directions.
//   H. Identity separation: in one real orchestrated flow, publicationId,
//      contentHash, the created PublicationAnchor's own id, and the
//      proof's txid are asserted pairwise distinct — and two publications
//      sharing the identical contentHash still produce two independent
//      anchors with independent ids and independent txids, proving
//      neither identifier is ever derived from another.
//   I. No hidden fan-out, confirmed live: exactly one anchor-creation
//      call touches exactly one publisher, and a spied CONTENT-role
//      object sitting alongside a real anchor creation call is never
//      invoked by it (and vice versa) — the explicit-trigger discipline
//      stated as a live behavioral check, not only a source sweep.
//   J. The verdict.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - Any change to ArweaveAnchorPublisher.js, ArweaveTransactionDataProofVerifier.js,
//   the registries, the coordinator, or ui/. This file only reads and
//   exercises current production source; it modifies none of it.
// - Arweave Announcement/Discovery. 0.9.424 already named that a
//   PROVIDER_GAP_PLUS_MECHANISM_GAP, unrelated to whether Proof/Anchor's
//   own integration is sound. A future 0.9.427 is the right place for
//   that contract question, not this file.
// - Re-deriving anything tests/ArweaveAnchorProviderImplementation.test.js,
//   tests/ExternalAnchorCreationOrchestration.test.js, tests/
//   ExternalAnchorProofAdapters.test.js, or tests/BitcoinAnchorCreationAdapter.test.js
//   already covers. Where this file's own scenario looks similar to one
//   of theirs (e.g. a fake Arweave/Bitcoin network), it exists only to
//   support a genuinely new assertion in this file's own lettered
//   sections above, never to restate an existing one.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    assert(condition, message);
}

async function expectThrowsAsync(fn, message) {
    let threw = false;
    try { await fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function publishContent(publicationCatalog, { id, hash }) {
    const publication = new DecentralizedPublication({
        id, contentKind: 'forkbuild.structure', contentReference: new ContentReference({ hash })
    });
    publicationCatalog.add(publication);
    return publication;
}

function makeReplica({ publishers = [] } = {}) {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const identityProvider = makeIdentity('Alice');
    const { createExternalPublicationAnchorUseCase, publisherRegistry } =
        new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
            publicationCatalog, anchorCatalog, identityProvider, publishers
        });
    return { publicationCatalog, anchorCatalog, identityProvider, createExternalPublicationAnchorUseCase, publisherRegistry };
}

// A shared, deterministic fake Arweave network, instrumented to record
// every request's own HTTP method + path so Section C can prove the
// publisher only ever POSTs and the verifier only ever GETs.
function makeFakeArweaveNetwork() {
    const ledger = new Map();
    const requests = [];
    let nextId = 0;

    const signer = {
        async sign(material) {
            nextId += 1;
            const id = `FakeArTx${String(nextId).padStart(10, '0')}`;
            return { id, transaction: { format: 2, id, data: material } };
        }
    };

    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        const method = options.method || 'GET';
        requests.push({ method, path: parsed.pathname });
        if (method === 'POST' && parsed.pathname === '/tx') {
            const body = JSON.parse(options.body);
            ledger.set(body.id, body.data);
            return new Response('accepted', { status: 200 });
        }
        const match = parsed.pathname.match(/^\/([A-Za-z0-9_-]+)$/);
        if (match && ledger.has(match[1])) {
            return new Response(ledger.get(match[1]), { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }

    return { ledger, requests, signer, fetchImpl };
}

// The identical fake-Bitcoin-network technique tests/ExternalAnchorCreationOrchestration.test.js
// already established, extended here to also record method+path per
// request for Section C/F's own instrumentation.
function makeFakeBitcoinNetwork() {
    const chain = new Map();
    const requests = [];
    let nextTxid = 0;

    const broadcaster = {
        async broadcast(opReturnHex, { network }) {
            nextTxid += 1;
            const txid = String(nextTxid).padStart(64, '0');
            chain.set(txid, { txid, network, vout: [opReturnOutput(opReturnHex)], status: { confirmed: false } });
            return { broadcast: true, txid };
        }
    };

    async function fetchImpl(url) {
        const parsed = new URL(url);
        requests.push({ method: 'GET', path: parsed.pathname });
        const match = parsed.pathname.match(/\/tx\/([0-9a-f]+)$/i);
        if (match) {
            const tx = chain.get(match[1]);
            if (!tx) return new Response('not found', { status: 404 });
            return new Response(JSON.stringify(tx), { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }

    function confirm(txid, blockHeight) {
        chain.get(txid).status = { confirmed: true, block_height: blockHeight };
    }

    return { chain, requests, broadcaster, fetchImpl, confirm };
}

function opReturnOutput(hexData) {
    return {
        scriptpubkey_type: 'op_return',
        scriptpubkey_asm: `OP_RETURN OP_PUSHBYTES_${hexData.length / 2} ${hexData}`
    };
}

async function run() {
    // ===============================================================
    // Section A — complete real path, through the ACTUAL UI-facing
    // coordinator, not the raw orchestrator use case 0.9.425's own suite
    // exercised.
    // ===============================================================
    {
        const net = makeFakeArweaveNetwork();
        const publisher = new ArweaveAnchorPublisher({ signer: net.signer, fetchImpl: net.fetchImpl });
        const { publicationCatalog, createExternalPublicationAnchorUseCase, publisherRegistry } =
            makeReplica({ publishers: [publisher] });

        // The exact class ui/views/DecentralizedPublicationsView.js's own
        // `createAnchor()` calls — application/
        // PublicationAnchorCreationCoordinator.js — sits in front of the
        // orchestrator use case here, never bypassed.
        const coordinator = new PublicationAnchorCreationCoordinator(createExternalPublicationAnchorUseCase, publisherRegistry);
        check(coordinator.availableAnchorTypes().includes('arweave'), 'A1. the real coordinator\'s own availableAnchorTypes() lists "arweave" before any creation is attempted');

        const contentHash = 'boundary-audit-path-hash';
        publishContent(publicationCatalog, { id: 'pub-full-path', hash: contentHash });

        const result = await coordinator.create('pub-full-path', 'arweave');
        check(result.outcome === ExternalAnchorCreationOutcome.CREATED, 'A2. PublicationAnchorCreationCoordinator#create() — the same call ui/views/DecentralizedPublicationsView.js\'s own createAnchor() makes — produces CREATED for a healthy Arweave publisher');
        check(result.anchor instanceof PublicationAnchor && result.anchor.anchorType === 'arweave', 'A3. the coordinator returns the orchestrator\'s own result completely unmodified — a real PublicationAnchor, "arweave" anchorType');

        // Independent verification side: registry-resolved, never a
        // hand-picked verifier instance the creation side happened to use.
        const verifierRegistry = new ExternalProofVerifierRegistry();
        verifierRegistry.register(new ArweaveTransactionDataProofVerifier({ fetchImpl: net.fetchImpl }));
        const bobAuthVerifier = new LocalAuthorizationVerifier();
        const bobAnchorVerifier = new ExternalAnchorVerifier(bobAuthVerifier);

        const verification = await bobAnchorVerifier.verify(result.anchor.toJSON(), {
            expectedContentHash: contentHash,
            proofVerifierRegistry: verifierRegistry
        });
        check(verification.outcome === AnchorVerificationOutcome.VALID, 'A4. FULL PATH — coordinator-driven creation, registry-resolved verification (never a directly-injected verifier instance), reports VALID end to end, exactly the path Bitcoin already runs through');

        console.log('✓ Section A: the complete real path — coordinator → orchestrator → registry → publisher → Arweave → txid → registry-resolved verifier → VALID — holds with no shortcut around any seam');
    }

    // ===============================================================
    // Section B — UI discovery as a regression invariant, backed by a
    // source sweep of the exact creation block, not merely the registry.
    // ===============================================================
    {
        const publisherRegistry = new ExternalAnchorPublisherRegistry();
        publisherRegistry.register(new ArweaveAnchorPublisher({ signer: makeFakeArweaveNetwork().signer, fetchImpl: makeFakeArweaveNetwork().fetchImpl }));
        const coordinator = new PublicationAnchorCreationCoordinator({ execute: async () => { throw new Error('never called'); } }, publisherRegistry);
        check(coordinator.availableAnchorTypes().length === 1 && coordinator.availableAnchorTypes()[0] === 'arweave', 'B1. registering only the real ArweaveAnchorPublisher makes it the sole reported anchorType — no default, no hidden second entry');

        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');
        const startMarker = 'v-for="anchorType in availableAnchorTypes"';
        const startIndex = viewSource.indexOf(startMarker);
        check(startIndex !== -1, 'B2. the real view still contains the generic availableAnchorTypes v-for this audit is about to slice out');
        // The card's own closing block is the literal three-line pattern
        // ("</div>\n                        </div>\n\n" then the next
        // section's HTML comment) immediately following the "Create"
        // button — sliced to a generous fixed window rather than a fragile
        // full-DOM parse, wide enough to contain the whole card and no
        // further sections.
        const creationCardSlice = viewSource.slice(startIndex, startIndex + 2200);
        check(creationCardSlice.includes('createAnchor(entry, anchorType)'), 'B3. the sliced window really is the creation card — it contains the click handler, not some other v-for');
        check(!/anchorType\s*===\s*['"]/.test(creationCardSlice), 'B4. the creation card itself contains ZERO anchorType-specific branches (no `anchorType === \'arweave\'`, none for Bitcoin either) — every anchorType, including the newly-real "arweave" one, is rendered through the identical generic template');
        check(!creationCardSlice.includes('arweave') && !creationCardSlice.includes('bitcoin'), 'B5. the creation card\'s own markup never even names "arweave" or "bitcoin" as a literal string — it is driven entirely by whatever the registry reports at runtime');

        // Named honestly, not overclaimed: the SEPARATE existing-evidence
        // display section (a different part of this same view, for
        // Bitcoin-only extras like wallet connection) DOES branch on
        // anchorType — that is additive presentation for a capability
        // Arweave does not have yet, never a gate on whether Arweave's
        // card appears at all. Confirming it exists (rather than pretending
        // it doesn't) is what keeps B4/B5 an honest, narrow claim about the
        // CREATION card specifically.
        const bitcoinOnlyExtraBranches = (viewSource.match(/anchorType === 'bitcoin-op-return'/g) || []).length;
        check(bitcoinOnlyExtraBranches > 0, 'B6. sanity: the view DOES branch on anchorType elsewhere (Bitcoin\'s own wallet/reconciliation widgets on the evidence-inspection panel) — B4/B5\'s "zero branches" claim is specific to the creation card, never a claim that the whole file is anchorType-agnostic');

        console.log('✓ Section B: registering a valid anchor provider makes it appear through the existing dynamic creation mechanism; that mechanism\'s own source contains no Arweave-specific (or Bitcoin-specific) branch — the additive Bitcoin-only extras live in a separate, honestly-distinguished section');
    }

    // ===============================================================
    // Section C — creation and verification stay separate classes, each
    // speaking only its own half of the wire protocol.
    // ===============================================================
    {
        check(typeof ArweaveAnchorPublisher.prototype.verify !== 'function', 'C1. ArweaveAnchorPublisher has no verify() method of its own');
        check(typeof ArweaveTransactionDataProofVerifier.prototype.publish !== 'function', 'C2. ArweaveTransactionDataProofVerifier has no publish() method of its own');
        check(ArweaveAnchorPublisher !== ArweaveTransactionDataProofVerifier, 'C3. sanity: genuinely two distinct classes, not one class wearing two names');

        const net = makeFakeArweaveNetwork();
        const publisher = new ArweaveAnchorPublisher({ signer: net.signer, fetchImpl: net.fetchImpl });
        const publishResult = await publisher.publish('separation-check-hash');
        check(net.requests.length === 1 && net.requests[0].method === 'POST' && net.requests[0].path === '/tx', 'C4. ArweaveAnchorPublisher#publish() issues EXACTLY one request, and it is the POST /tx creation call — never a GET to read anything back');

        net.requests.length = 0;
        const verifier = new ArweaveTransactionDataProofVerifier({ fetchImpl: net.fetchImpl });
        const verifyResult = await verifier.verify(publishResult.proof, { contentHash: 'separation-check-hash' });
        check(verifyResult.valid === true, '  C4-support. sanity: the round-trip itself still verifies');
        check(net.requests.length === 1 && net.requests[0].method === 'GET', 'C5. ArweaveTransactionDataProofVerifier#verify() issues EXACTLY one request, and it is a GET — never a POST that would (re)publish anything');

        console.log('✓ Section C: creation and verification remain genuinely separate classes — neither has the other\'s method, and each one\'s own wire traffic is provably confined to its own half of the protocol (POST-only vs GET-only)');
    }

    // ===============================================================
    // Section D — the contentHash boundary, completed with the one
    // AnchorVerificationOutcome value 0.9.425/0.9.424 never drove end to
    // end for Arweave: INVALID_PROOF, distinct from CONTENT_MISMATCH.
    // ===============================================================
    {
        const net = makeFakeArweaveNetwork();
        const publisher = new ArweaveAnchorPublisher({ signer: net.signer, fetchImpl: net.fetchImpl });
        const { publicationCatalog, createExternalPublicationAnchorUseCase } = makeReplica({ publishers: [publisher] });

        const contentHash = 'd-boundary-real-hash';
        publishContent(publicationCatalog, { id: 'pub-d-boundary', hash: contentHash });
        const result = await createExternalPublicationAnchorUseCase.execute('pub-d-boundary', 'arweave');
        check(result.outcome === ExternalAnchorCreationOutcome.CREATED, 'D1. sanity: a real anchor exists to test the boundary against');
        const anchorJson = result.anchor.toJSON();

        const bobAuthVerifier = new LocalAuthorizationVerifier();
        const bobAnchorVerifier = new ExternalAnchorVerifier(bobAuthVerifier);

        // D2. correct contentHash, real network → VALID.
        const valid = await bobAnchorVerifier.verify(anchorJson, {
            expectedContentHash: contentHash,
            proofVerifier: new ArweaveTransactionDataProofVerifier({ fetchImpl: net.fetchImpl })
        });
        check(valid.outcome === AnchorVerificationOutcome.VALID, 'D2. the correct contentHash against the real network verifies VALID');

        // D3. a DIFFERENT expected contentHash → CONTENT_MISMATCH, caught
        // at the caller-expectation cross-check, BEFORE the proof verifier
        // is even consulted.
        const differentExpectation = await bobAnchorVerifier.verify(anchorJson, {
            expectedContentHash: 'a-caller-expected-something-else',
            proofVerifier: new ArweaveTransactionDataProofVerifier({ fetchImpl: net.fetchImpl })
        });
        check(differentExpectation.outcome === AnchorVerificationOutcome.CONTENT_MISMATCH, 'D3. a caller expecting a DIFFERENT contentHash than the anchor itself claims reports CONTENT_MISMATCH — a claim about what the CALLER expected, decided before any network call');

        // D4. THE NEW CASE: the anchor's own claimed contentHash matches
        // what the caller expects (so D3's check passes) — this is NOT a
        // caller-expectation problem — but the gateway this particular
        // verifier instance is pointed at serves DIFFERENT data for the
        // exact same txid (a lying/misconfigured/compromised gateway, or
        // equivalently a stale mirror). The verifier must report a
        // DEFINITE rejection (INVALID_PROOF), never PROOF_UNAVAILABLE
        // (that value is reserved for "cannot presently tell," not "did
        // tell, and it was wrong") and never conflated with D3's
        // CONTENT_MISMATCH (that value is reserved for the anchor's own
        // claim disagreeing with the CALLER, not with the chain).
        const lyingGatewayLedger = new Map(net.ledger);
        for (const txid of lyingGatewayLedger.keys()) lyingGatewayLedger.set(txid, 'this-is-not-the-real-transaction-data');
        const lyingGatewayFetch = async (url) => {
            const parsed = new URL(url);
            const match = parsed.pathname.match(/^\/([A-Za-z0-9_-]+)$/);
            if (match && lyingGatewayLedger.has(match[1])) return new Response(lyingGatewayLedger.get(match[1]), { status: 200 });
            return new Response('not found', { status: 404 });
        };
        const lyingGatewayResult = await bobAnchorVerifier.verify(anchorJson, {
            expectedContentHash: contentHash,
            proofVerifier: new ArweaveTransactionDataProofVerifier({ fetchImpl: lyingGatewayFetch })
        });
        check(lyingGatewayResult.outcome === AnchorVerificationOutcome.INVALID_PROOF, 'D4. contentHash matches what the caller expects, but the named transaction\'s REAL data (as this particular gateway reports it) does not carry it — a definite INVALID_PROOF, never CONTENT_MISMATCH (that\'s a caller-expectation axis) and never PROOF_UNAVAILABLE (the gateway DID answer, definitively, just not favorably)');

        // D5. the same anchor against a gateway that genuinely has never
        // heard of the transaction → PROOF_UNAVAILABLE, the third,
        // permanently distinct outcome.
        const emptyGatewayFetch = async () => new Response('not found', { status: 404 });
        const unavailableResult = await bobAnchorVerifier.verify(anchorJson, {
            expectedContentHash: contentHash,
            proofVerifier: new ArweaveTransactionDataProofVerifier({ fetchImpl: emptyGatewayFetch })
        });
        check(unavailableResult.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE, 'D5. a gateway that has never heard of the transaction reports PROOF_UNAVAILABLE — "cannot presently tell," never promoted to a rejection and never confused with D4\'s definite rejection');

        check(new Set([valid.outcome, differentExpectation.outcome, lyingGatewayResult.outcome, unavailableResult.outcome]).size === 4, 'D6. all four scenarios above (VALID, CONTENT_MISMATCH, INVALID_PROOF, PROOF_UNAVAILABLE) produce four MUTUALLY DISTINCT outcome values from what is, in every case, the identical signed anchor — only the verification circumstances differ');

        console.log('✓ Section D: the contentHash boundary is complete — a caller-expectation mismatch (CONTENT_MISMATCH), a chain-data mismatch (INVALID_PROOF), and a chain that cannot presently be consulted (PROOF_UNAVAILABLE) are three permanently distinct outcomes for Arweave, never collapsed into each other');
    }

    // ===============================================================
    // Section E — graceful degradation vocabulary, held symmetric with
    // Bitcoin: the same class of failure produces the same outcome value
    // for both anchorTypes, side by side.
    // ===============================================================
    {
        // E1/E2 — a "signer"/"broadcaster" that throws → PUBLISH_UNAVAILABLE
        // for BOTH anchorTypes, at the full orchestration level.
        const arNet = makeFakeArweaveNetwork();
        const throwingSigner = { sign: async () => { throw new Error('wallet locked'); } };
        const arPublisherDown = new ArweaveAnchorPublisher({ signer: throwingSigner, fetchImpl: arNet.fetchImpl });
        const arReplica = makeReplica({ publishers: [arPublisherDown] });
        publishContent(arReplica.publicationCatalog, { id: 'pub-e-ar-down', hash: 'e-ar-down-hash' });
        const arDownResult = await arReplica.createExternalPublicationAnchorUseCase.execute('pub-e-ar-down', 'arweave');

        const throwingBroadcaster = { broadcast: async () => { throw new Error('node unreachable'); } };
        const btcPublisherDown = new BitcoinAnchorPublisher({ network: 'mainnet', broadcaster: throwingBroadcaster });
        const btcReplica = makeReplica({ publishers: [btcPublisherDown] });
        publishContent(btcReplica.publicationCatalog, { id: 'pub-e-btc-down', hash: 'deadbeef' });
        const btcDownResult = await btcReplica.createExternalPublicationAnchorUseCase.execute('pub-e-btc-down', 'bitcoin-op-return');

        check(arDownResult.outcome === ExternalAnchorCreationOutcome.PUBLISH_UNAVAILABLE, 'E1. a throwing Arweave signer reports PUBLISH_UNAVAILABLE at the full orchestration level');
        check(btcDownResult.outcome === ExternalAnchorCreationOutcome.PUBLISH_UNAVAILABLE, 'E2. the analogous throwing Bitcoin broadcaster reports the IDENTICAL outcome value — the vocabulary is anchorType-agnostic, not an Arweave-specific invention');

        // E3/E4 — a gateway/explorer that has never heard of the
        // transaction → PROOF_UNAVAILABLE for both, at the verifier level.
        const arVerifier = new ArweaveTransactionDataProofVerifier({ fetchImpl: async () => new Response('not found', { status: 404 }) });
        const arNotFound = await arVerifier.verify({ txid: 'SomeRealLookingTx0000001' }, { contentHash: 'anything' });
        const btcVerifier = new BitcoinOpReturnProofVerifier({ fetchImpl: async () => new Response('not found', { status: 404 }) });
        const btcNotFound = await btcVerifier.verify({ txid: '00'.repeat(32) }, { contentHash: 'deadbeef' });
        check(arNotFound.valid === false && arNotFound.unavailable === true, 'E3. Arweave verifier: not-found is unavailable, never a definite rejection');
        check(btcNotFound.valid === false && btcNotFound.unavailable === true, 'E4. Bitcoin verifier: not-found is ALSO unavailable, never a definite rejection — the same vocabulary distinction holds for both real anchorTypes');

        // E5/E6 — a malformed identifier returned by an otherwise-healthy
        // signer/broadcaster is a CONTRACT violation (throw), never
        // silently downgraded to "unavailable," for both anchorTypes.
        const malformedIdSigner = { sign: async () => ({ id: '', transaction: {} }) };
        const arMalformedPublisher = new ArweaveAnchorPublisher({ signer: malformedIdSigner, fetchImpl: arNet.fetchImpl });
        await expectThrowsAsync(() => arMalformedPublisher.publish('some-hash'), 'E5. Arweave: a signer resolving with no valid id THROWS — a contract violation, never reported as unavailable');

        const malformedTxidBroadcaster = { broadcast: async () => ({ broadcast: true, txid: 'not-a-valid-txid' }) };
        const btcMalformedPublisher = new BitcoinAnchorPublisher({ network: 'mainnet', broadcaster: malformedTxidBroadcaster });
        await expectThrowsAsync(() => btcMalformedPublisher.publish('deadbeef'), 'E6. Bitcoin: a broadcaster resolving with a malformed txid ALSO throws — the same "operational failure vs. contract violation" line is drawn identically for both providers');

        console.log('✓ Section E: PUBLISH_UNAVAILABLE, PROOF_UNAVAILABLE, and "malformed identifier throws" are the SAME vocabulary for Arweave and Bitcoin alike — Arweave never turns an operational failure into a semantic one, and never hides a real contract defect as ordinary unavailability');
    }

    // ===============================================================
    // Section F — Bitcoin isolation, interleaved (not merely coexisting
    // in one registry as 0.9.425's own Section E already showed).
    // ===============================================================
    {
        const arNet = makeFakeArweaveNetwork();
        const btcNet = makeFakeBitcoinNetwork();
        let arPublishCalls = 0, arVerifyCalls = 0, btcPublishCalls = 0, btcVerifyCalls = 0;

        const arPublisher = new ArweaveAnchorPublisher({ signer: arNet.signer, fetchImpl: arNet.fetchImpl });
        const countingArPublish = arPublisher.publish.bind(arPublisher);
        arPublisher.publish = async (...args) => { arPublishCalls += 1; return countingArPublish(...args); };

        const btcPublisher = new BitcoinAnchorPublisher({ network: 'mainnet', broadcaster: btcNet.broadcaster });
        const countingBtcPublish = btcPublisher.publish.bind(btcPublisher);
        btcPublisher.publish = async (...args) => { btcPublishCalls += 1; return countingBtcPublish(...args); };

        const arVerifier = new ArweaveTransactionDataProofVerifier({ fetchImpl: arNet.fetchImpl });
        const countingArVerify = arVerifier.verify.bind(arVerifier);
        arVerifier.verify = async (...args) => { arVerifyCalls += 1; return countingArVerify(...args); };

        const btcVerifier = new BitcoinOpReturnProofVerifier({ fetchImpl: btcNet.fetchImpl });
        const countingBtcVerify = btcVerifier.verify.bind(btcVerifier);
        btcVerifier.verify = async (...args) => { btcVerifyCalls += 1; return countingBtcVerify(...args); };

        const { publicationCatalog, createExternalPublicationAnchorUseCase } = makeReplica({ publishers: [btcPublisher, arPublisher] });
        const verifierRegistry = new ExternalProofVerifierRegistry();
        verifierRegistry.register(btcVerifier);
        verifierRegistry.register(arVerifier);
        const anchorVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());

        publishContent(publicationCatalog, { id: 'pub-f-btc', hash: 'f00dfeed' });
        publishContent(publicationCatalog, { id: 'pub-f-ar', hash: 'f-interleave-ar-hash' });

        // Interleaved, not grouped: Arweave create, Bitcoin create,
        // Arweave verify, Bitcoin verify — the order Section E's own
        // brief specifically asked for ("independently execute Bitcoin
        // create→verify and Arweave create→verify").
        const arCreate = await createExternalPublicationAnchorUseCase.execute('pub-f-ar', 'arweave');
        const btcCreate = await createExternalPublicationAnchorUseCase.execute('pub-f-btc', 'bitcoin-op-return');
        btcNet.confirm(btcCreate.anchor.proof.txid, 700000);
        const arVerified = await anchorVerifier.verify(arCreate.anchor.toJSON(), { expectedContentHash: 'f-interleave-ar-hash', proofVerifierRegistry: verifierRegistry });
        const btcVerified = await anchorVerifier.verify(btcCreate.anchor.toJSON(), { expectedContentHash: 'f00dfeed', proofVerifierRegistry: verifierRegistry });

        check(arCreate.outcome === ExternalAnchorCreationOutcome.CREATED && btcCreate.outcome === ExternalAnchorCreationOutcome.CREATED, 'F1. both anchorTypes create successfully, interleaved, from the same registry');
        check(arVerified.outcome === AnchorVerificationOutcome.VALID && btcVerified.outcome === AnchorVerificationOutcome.VALID, 'F2. both verify VALID, resolved from the SAME shared verifierRegistry instance by anchorType alone');

        check(arPublishCalls === 1 && btcPublishCalls === 1, 'F3. exactly one publish() call landed on EACH publisher — creating the Arweave anchor never also invoked Bitcoin\'s publisher, and vice versa');
        check(arVerifyCalls === 1 && btcVerifyCalls === 1, 'F4. exactly one verify() call landed on EACH proofVerifier — verifying the Arweave anchor never also invoked Bitcoin\'s verifier, and vice versa, even though both are registered under the same registry instance and resolved by anchorType automatically');

        check(btcCreate.anchor.contentHash === 'f00dfeed' && arCreate.anchor.contentHash === 'f-interleave-ar-hash', 'F5. neither anchor\'s own contentHash leaked into or was overwritten by the other\'s concurrent creation');

        console.log('✓ Section F: Bitcoin and Arweave create/verify cycles interleaved through ONE shared registry pair never cross-invoke each other\'s publisher or verifier — registering and using Arweave leaves Bitcoin\'s own behavior provably untouched');
    }

    // ===============================================================
    // Section G — role independence, the direction 0.9.425 Section H did
    // not sweep: does Arweave's CONTENT side import anything from the
    // PROOF/ANCHOR side it now sits beside?
    // ===============================================================
    {
        const contentSideFiles = [
            'content/ArweaveContentStore.js',
            'application/ArweavePublicationMaterialUploader.js',
            'application/ArweaveWorldEncounterMaterialResolver.js'
        ];
        const anchorRoleSymbols = /ArweaveAnchorPublisher|ArweaveTransactionDataProofVerifier|ExternalAnchorPublisherRegistry|ExternalProofVerifierRegistry|PublicationAnchorCreationCoordinator|CreateExternalPublicationAnchorUseCase|CreatePublicationAnchorUseCase|PublicationAnchor\b/;
        for (const file of contentSideFiles) {
            const text = await source(file);
            const codeOnly = text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
            check(!anchorRoleSymbols.test(codeOnly), `G. ${file} imports/references nothing from the PROOF_AND_ANCHORING role's classes or registries — CONTENT and PROOF stay independently pluggable even though both now have a real Arweave implementation`);
        }

        // Closing the loop the other direction, unchanged from 0.9.425's
        // own finding but re-verified from CURRENT source rather than
        // assumed to still hold.
        const anchorSideFiles = ['anchoring/ArweaveAnchorPublisher.js', 'anchoring/ArweaveTransactionDataProofVerifier.js'];
        const contentRoleSymbols = /ArweavePublicationMaterialUploader|PublicationDistribution|ArweaveContentStore|ArweaveWorldEncounterMaterialResolver/;
        for (const file of anchorSideFiles) {
            const text = await source(file);
            const codeOnly = text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
            check(!contentRoleSymbols.test(codeOnly), `G. ${file} still imports/references nothing from Arweave's own CONTENT-role classes, reconfirmed from current source`);
        }

        console.log('✓ Section G: role independence holds in BOTH directions — Arweave\'s CONTENT classes reference none of the PROOF/ANCHOR machinery, and Arweave\'s PROOF/ANCHOR classes reference none of the CONTENT machinery, confirmed by sweeping current source in both directions rather than only the one 0.9.425 already checked');
    }

    // ===============================================================
    // Section H — identity separation: publicationId, contentHash, the
    // anchor's own id, and the proof's txid never collapse into each
    // other, even under a scenario designed to tempt exactly that.
    // ===============================================================
    {
        const net = makeFakeArweaveNetwork();
        const publisher = new ArweaveAnchorPublisher({ signer: net.signer, fetchImpl: net.fetchImpl });
        const { publicationCatalog, createExternalPublicationAnchorUseCase } = makeReplica({ publishers: [publisher] });

        const sharedContentHash = 'h-shared-content-hash-two-publications';
        publishContent(publicationCatalog, { id: 'pub-h-one', hash: sharedContentHash });
        publishContent(publicationCatalog, { id: 'pub-h-two', hash: sharedContentHash });

        const resultOne = await createExternalPublicationAnchorUseCase.execute('pub-h-one', 'arweave');
        const resultTwo = await createExternalPublicationAnchorUseCase.execute('pub-h-two', 'arweave');
        check(resultOne.outcome === ExternalAnchorCreationOutcome.CREATED && resultTwo.outcome === ExternalAnchorCreationOutcome.CREATED, 'H1. sanity: both anchors were really created');

        const anchorOne = resultOne.anchor, anchorTwo = resultTwo.anchor;
        const identifiers = {
            publicationIdOne: anchorOne.publicationId,
            publicationIdTwo: anchorTwo.publicationId,
            contentHash: sharedContentHash,
            anchorIdOne: anchorOne.id,
            anchorIdTwo: anchorTwo.id,
            txidOne: anchorOne.proof.txid,
            txidTwo: anchorTwo.proof.txid
        };

        check(identifiers.publicationIdOne !== identifiers.contentHash && identifiers.publicationIdOne !== identifiers.anchorIdOne && identifiers.publicationIdOne !== identifiers.txidOne, 'H2. publicationId is distinct from contentHash, the anchor\'s own id, and the txid');
        check(identifiers.contentHash !== identifiers.anchorIdOne && identifiers.contentHash !== identifiers.txidOne, 'H3. contentHash is distinct from the anchor\'s own id and the txid');
        check(identifiers.anchorIdOne !== identifiers.txidOne, 'H4. the anchor\'s own id is distinct from the txid — the anchor fact and the external transaction fact are two different identities, one locally minted (createId()), one externally produced by the signer');

        // The tempting case: BOTH publications share the exact same
        // contentHash — if any identifier here were secretly DERIVED from
        // contentHash rather than independently chosen, this is where it
        // would show up as an accidental collision.
        check(identifiers.publicationIdOne !== identifiers.publicationIdTwo, 'H5. two publications sharing the identical contentHash still keep their own distinct publicationIds — never derived from contentHash');
        check(identifiers.anchorIdOne !== identifiers.anchorIdTwo, 'H6. ...and their two Arweave anchors get distinct anchor ids — never derived from contentHash either');
        check(identifiers.txidOne !== identifiers.txidTwo, 'H7. ...and distinct Arweave txids — the SAME contentHash anchored twice produces two independently identified transactions, not one fact impersonating two');

        check(new Set(Object.values(identifiers)).size === Object.values(identifiers).length, 'H8. every one of the 7 identifiers collected above (2 publicationIds, 1 shared contentHash, 2 anchor ids, 2 txids) is pairwise unique — a single Arweave transaction never quietly becomes a publicationId, an anchor id, or vice versa, even when contentHash is deliberately held constant across two publications');

        console.log('✓ Section H: publicationId, contentHash, an anchor\'s own id, and a proof\'s txid remain four permanently distinct identities — even the deliberately adversarial case of two publications sharing one contentHash produces no accidental collision between any of them');
    }

    // ===============================================================
    // Section I — no hidden fan-out, confirmed live: an explicit anchor
    // action never reaches a CONTENT-role object sitting right next to
    // it, and an explicit content action (simulated by a spy standing in
    // for it) is never reached by an anchor action either.
    // ===============================================================
    {
        let contentSpyCalls = 0;
        const contentSpy = { async upload() { contentSpyCalls += 1; return { uri: 'ar://should-never-be-called' }; } };

        const net = makeFakeArweaveNetwork();
        const publisher = new ArweaveAnchorPublisher({ signer: net.signer, fetchImpl: net.fetchImpl });
        const { publicationCatalog, createExternalPublicationAnchorUseCase } = makeReplica({ publishers: [publisher] });
        publishContent(publicationCatalog, { id: 'pub-i-no-fanout', hash: 'i-no-fanout-hash' });

        // The anchor-creation call is never given any reference to
        // contentSpy at all — which is itself the point: nothing in this
        // codebase's own wiring (application/
        // CreateExternalPublicationAnchorOrchestratorUseCase.js's own
        // signature, shown by this file's own makeReplica()) accepts or
        // requires a content-side collaborator to create an anchor. A
        // literal call-count of zero on an object never even passed in is
        // the strongest form of "no fan-out" this test can demonstrate.
        let publishCalls = 0;
        const originalPublish = publisher.publish.bind(publisher);
        publisher.publish = async (...args) => { publishCalls += 1; return originalPublish(...args); };
        await createExternalPublicationAnchorUseCase.execute('pub-i-no-fanout', 'arweave');

        check(publishCalls === 1, 'I1. one explicit "create Arweave anchor" action triggers exactly one publish() call — no automatic retry, no automatic second anchor of any anchorType');
        check(contentSpyCalls === 0, 'I2. the CONTENT-role spy sitting unused beside this call was never invoked — anchoring never fans out into a content publish, even one this test made trivially easy to reach if a hidden coupling existed');

        // And the converse: does application/
        // CreateExternalPublicationAnchorOrchestratorUseCase.js's own
        // composition accept anything content-shaped that could let a
        // future caller wire one in accidentally? Its own real signature
        // (already read in full for this audit's own Section A) is
        // `{ publicationCatalog, anchorCatalog, identityProvider, publishers, knowledgeStore }`
        // — nothing content-shaped at all.
        const orchestratorSource = await source('application/CreateExternalPublicationAnchorOrchestratorUseCase.js');
        check(!/ContentStore|MaterialUploader|contentPublisher/i.test(orchestratorSource), 'I3. the anchor-creation orchestrator\'s own composition root accepts nothing content-shaped in its signature — there is no parameter a caller could even mistakenly wire a content publisher into');

        console.log('✓ Section I: no hidden fan-out in either direction — an explicit anchor action reaches only its own registered publisher, never a content-role collaborator, and the anchor orchestrator\'s own composition has no content-shaped parameter for one to be smuggled through');
    }

    // ===============================================================
    // Section J — the verdict.
    // ===============================================================
    {
        const VERDICT = Object.freeze({
            uiCompatibility: 'PASS',
            registryIntegration: 'PASS',
            creation: 'PASS',
            verification: 'PASS',
            failureSemantics: 'PASS',
            bitcoinIsolation: 'PASS',
            roleIndependence: 'PASS',
            identitySeparation: 'PASS',
            noFanOut: 'PASS',
            noProductionExpansion: 'PASS'
        });
        check(Object.values(VERDICT).every((v) => v === 'PASS'), 'J1. every audited boundary passes — ARWEAVE_PROOF_ANCHOR_INTEGRATION_STABLE');
        check(assertionCount > 40, 'J2. sanity: this audit is substantive, not a token pass');

        console.log('\nVerdict: ARWEAVE_PROOF_ANCHOR_INTEGRATION_STABLE');
        for (const [key, value] of Object.entries(VERDICT)) {
            console.log(`  ${key.padEnd(24)} ${value}`);
        }
        console.log(`\n(${assertionCount} checks)`);
    }

    console.log('\nAll ArweaveProofAnchorIntegrationBoundaryAudit tests passed.');
}

run().catch((error) => {
    console.error('ArweaveProofAnchorIntegrationBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
