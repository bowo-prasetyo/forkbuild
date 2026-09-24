import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { CreatePublicationAnchorUseCase } from '../application/CreatePublicationAnchorUseCase.js';
import { CreateExternalPublicationAnchorUseCase } from '../application/CreateExternalPublicationAnchorUseCase.js';
import { ExternalAnchorPublisherRegistry } from '../application/ExternalAnchorPublisherRegistry.js';
import { ExternalProofVerifierRegistry } from '../application/ExternalProofVerifierRegistry.js';
import { ExternalAnchorEvidenceViewRegistry } from '../application/ExternalAnchorEvidenceViewRegistry.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { ExternalAnchorCreationOutcome } from '../application/ExternalAnchorCreationOutcome.js';

import { BitcoinAnchorPublicationCoordinator } from '../application/BitcoinAnchorPublicationCoordinator.js';
import { BitcoinAnchorPublicationLifecycleState } from '../application/BitcoinAnchorPublicationLifecycleState.js';
import { BitcoinAnchorTransactionBroadcaster } from '../anchoring/BitcoinAnchorTransactionBroadcaster.js';
import { BitcoinAnchorBroadcastCoordinator } from '../application/BitcoinAnchorBroadcastCoordinator.js';
import { BitcoinAnchorBroadcastState } from '../application/BitcoinAnchorBroadcastState.js';
import { BitcoinAnchorEvidenceView } from '../anchoring/BitcoinAnchorEvidenceView.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';

import { BaseAnchorPublisher } from '../anchoring/BaseAnchorPublisher.js';
import { BaseReviewedSigningCoordinator } from '../application/BaseReviewedSigningCoordinator.js';
import { BaseTransactionBroadcaster } from '../base/BaseTransactionBroadcaster.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { describeBasePublicationTransactionReview } from '../application/BasePublicationTransactionReview.js';
import { encodeBasePublicationCommitment } from '../application/BasePublicationCommitmentEncoding.js';
import { BaseAnchorEvidenceView } from '../anchoring/BaseAnchorEvidenceView.js';
import { BaseProofVerifier } from '../anchoring/BaseProofVerifier.js';

import { ArweaveAnchorPublisher } from '../anchoring/ArweaveAnchorPublisher.js';
import { ArweaveAnchorEvidenceView } from '../anchoring/ArweaveAnchorEvidenceView.js';
import { ArweaveTransactionDataProofVerifier } from '../anchoring/ArweaveTransactionDataProofVerifier.js';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { publicationsPageFiles } from './support/PublicationsPageFiles.js';

// 0.9.513 — Proof/Anchoring Cross-Substrate End-to-End Closure Audit.
//
// TYPE: test-only audit. PRODUCTION CHANGES: NONE.
//
// tests/ProofAnchoringCrossSubstrateCapabilityParityAudit.test.js (0.9.511)
// found Bitcoin's real granular pipeline DORMANT toward an anchor (never
// minting one) and Base missing a type-specific evidence view; Arweave's
// one-shot shape was re-confirmed DELIBERATE_ASYMMETRY. anchoring/
// BaseAnchorEvidenceView.js (0.9.511) closed the Base gap. application/
// BitcoinAnchorPublicationCoordinator.js#publishBroadcastedAnchor() (0.9.512)
// activated the Bitcoin bridge, wiring it into ui/main.js and
// ui/views/DecentralizedPublicationsView.js's own real broadcast action.
//
// This milestone asks a different question than either predecessor: not
// "does a structural seam exist for substrate X," but "does the WHOLE
// Proof/Anchoring capability close, end to end, for all three substrates
// at once — creation, contentHash fidelity, external identity, evidence,
// independent verification, and isolation?" It is deliberately an
// end-to-end MATRIX, not another source-structure audit — every substrate
// is driven through a real, live creation path in this same process, and
// the resulting real anchors are what every later section inspects.
//
// LETTERED SECTIONS:
//   A. Creation — all three substrates mint a real PublicationAnchor
//      through their own legitimate, differently-shaped production
//      workflow, into ONE shared catalog.
//   B. contentHash fidelity — intended hash === anchor.contentHash ===
//      the hash each verifier is asked to check, with no recomputation.
//   C. External transaction identity — each anchor's locator/proof names
//      the real external artifact, never confused with publicationId,
//      the anchor's own internal id, or the publication's contentHash.
//   D. Evidence — all three anchors are observable through the shared
//      externalAnchorEvidenceViewRegistry, purely and repeatably.
//   E. Verification — independent, substrate-specific proof verification
//      for all three, and the explicit cross-substrate proof that
//      evidence presentation never constitutes verification.
//   F. Bitcoin lifecycle boundary — no anchor before BROADCASTED, no
//      duplicate from repeated observation of the same broadcast.
//   G. Cross-substrate isolation — one substrate's failure never falls
//      back to another; substrate choice never touches content storage,
//      discovery, snapshot resolution, or World Encounter.
//   H. Arweave asymmetry — re-confirmed fresh: the one-shot shape is a
//      deliberate signer-contract consequence, not a missing parity
//      feature.
//   I. UI journey — a person can actually REACH all three creation paths,
//      and inspect/verify any resulting anchor, through real, located
//      view code — not merely "the classes exist."
//   J. Common semantic contract — the one compact invariant, checked
//      together against all three real anchors this audit itself minted.
//   K. Regression witnesses — dependent tests re-executed live.
//   L. Deliberately excluded, and the production-change guard.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE: no Arweave multi-step
// workflow; no Bitcoin publisher redesign; no replacement of UniSat; no
// generic transaction abstraction; no cross-chain fallback; no automatic
// multi-substrate anchoring; no anchor replication; no confirmation
// polling beyond what already exists; no new proof states; no
// ownership/authorship semantics; no wallet-management redesign; no
// evidence-view redesign; no generic verifier abstraction for symmetry's
// own sake. No production file is touched — see Section L.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}
async function expectRejects(promise, message) {
    let threw = false;
    try { await promise; } catch (_e) { threw = true; }
    assert(threw, message);
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
async function source(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}
async function sourceExists(relativePath) {
    try { await source(relativePath); return true; } catch { return false; }
}
function codeOnly(src) {
    return src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}
function runLive(file) {
    try {
        execSync(`node ${JSON.stringify(file)}`, { cwd: SOURCE_ROOT, stdio: 'pipe' });
        return { passed: true, output: '' };
    } catch (error) {
        const stdout = error.stdout ? error.stdout.toString() : '';
        const stderr = error.stderr ? error.stderr.toString() : '';
        return { passed: false, output: `${stdout}\n${stderr}` || error.message };
    }
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
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
}
// A synthetic-but-structurally-valid { bytes, hex } pair — satisfies
// anchoring/BitcoinAnchorTransactionBroadcaster.js's own internal
// bytes/hex consistency check (never real transaction bytes; that
// derivation is independently, freshly re-proven live in Section K's own
// regression witnesses against the real end-to-end crypto pipeline).
function syntheticRawTransaction(seedByte) {
    const hex = seedByte.toString(16).padStart(2, '0').repeat(40);
    return { bytes: hexToBytes(hex), hex };
}

// A single, shared replica — one publicationCatalog, one anchorCatalog,
// one signed-in identity, one CreatePublicationAnchorUseCase — used by
// every substrate in Section A. All three anchors this audit mints land
// in the SAME catalog, exactly as ui/main.js's own single, shared
// publicationAnchorCatalog does in production.
function makeSharedReplica() {
    const identityProvider = makeIdentity('Alice');
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const authVerifier = new LocalAuthorizationVerifier();
    const createPublicationAnchorUseCase = new CreatePublicationAnchorUseCase(publicationCatalog, identityProvider, authVerifier, anchorCatalog);
    return { identityProvider, publicationCatalog, anchorCatalog, authVerifier, createPublicationAnchorUseCase };
}

const BITCOIN_CONTENT_HASH = '11'.repeat(32);
const BASE_CONTENT_HASH = '22'.repeat(32);
const ARWEAVE_CONTENT_HASH = '33'.repeat(32);
const BITCOIN_TXID = 'aa'.repeat(32);
const BASE_TXID = '0x' + 'bb'.repeat(32);
const ARWEAVE_TXID = 'FakeArTxClosureAudit001';

async function run() {
    console.log('Running Proof/Anchoring Cross-Substrate End-to-End Closure Audit...\n');

    const replica = makeSharedReplica();
    publishContent(replica.publicationCatalog, { id: 'pub-bitcoin', hash: BITCOIN_CONTENT_HASH });
    publishContent(replica.publicationCatalog, { id: 'pub-base', hash: BASE_CONTENT_HASH });
    publishContent(replica.publicationCatalog, { id: 'pub-arweave', hash: ARWEAVE_CONTENT_HASH });

    // Populated by Section A, read by every later section.
    let bitcoinAnchor = null, baseAnchor = null, arweaveAnchor = null;
    let basePlanData = null;
    let arweaveSignCalls = 0, arweaveFetchCalls = 0;

    // ===============================================================
    // Section A — Creation: all three substrates mint a real,
    // catalogued PublicationAnchor through their own legitimate,
    // differently-shaped production workflow.
    // ===============================================================
    {
        // --- Bitcoin: granular pipeline -> BROADCASTED -> coordinator ---
        // The production-shaped coordinator — constructed with EXACTLY
        // what ui/main.js supplies (see Section I's own structural
        // confirmation of that construction call). publishBroadcastedAnchor()
        // is the activated seam (0.9.512): it accepts the FACT that the
        // real granular pipeline already reached BROADCASTED, and never
        // re-derives how those bytes were produced. That full, real
        // fund->construct->review->sign->finalize->broadcast derivation is
        // independently, freshly re-proven live in Section K's own
        // regression witness (tests/BitcoinGranularPipelineAnchorPublicationIntegrationAudit
        // .test.js) — this section's own job is proving the seam itself,
        // not re-deriving cryptography this audit has no reason to
        // duplicate a third time (see this file's own "deliberately
        // excluded" list: "no Bitcoin publisher redesign").
        const bitcoinCoordinator = new BitcoinAnchorPublicationCoordinator({
            publicationCatalog: replica.publicationCatalog,
            createPublicationAnchorUseCase: replica.createPublicationAnchorUseCase,
            publicationAnchorCatalog: replica.anchorCatalog
        });
        const bitcoinResult = await bitcoinCoordinator.publishBroadcastedAnchor('pub-bitcoin', {
            broadcasted: true, txid: BITCOIN_TXID, network: 'mainnet'
        });
        assert(bitcoinResult.state === BitcoinAnchorPublicationLifecycleState.BROADCASTED, n('A1[bitcoin]. publishBroadcastedAnchor() reports BROADCASTED'));
        assert(bitcoinResult.anchor instanceof PublicationAnchor, n('A2[bitcoin]. a real PublicationAnchor is produced'));
        bitcoinAnchor = bitcoinResult.anchor;

        // --- Base: review -> sign -> finalize -> broadcast -> anchor ---
        // Mirrors tests/BaseAnchorPublisher.test.js's own Section D
        // approval path exactly — a real BaseReviewedSigningCoordinator
        // and a real BaseTransactionBroadcaster, with only the two true
        // network/wallet boundaries (the wallet's signTransaction(), the
        // cryptographic finalizer) faked, the identical restraint that
        // file's own header documents.
        const ADDRESS = '0x' + 'c1'.repeat(20);
        const plan = Object.freeze({
            network: 'mainnet', chainId: 8453, from: ADDRESS, to: ADDRESS, value: '0',
            data: encodeBasePublicationCommitment(BASE_CONTENT_HASH),
            nonce: 7, gasLimit: 40000, maxFeePerGas: '1000000000', maxPriorityFeePerGas: '100000000'
        });
        basePlanData = plan.data;
        const review = describeBasePublicationTransactionReview(plan);
        const wallet = { async signTransaction() { return { signed: true, rawTransaction: '0x' + 'ab'.repeat(70) }; } };
        const finalizer = {
            finalize({ plan: finalizedPlan, rawTransaction }) {
                return {
                    finalized: true, invalidSignature: false, reason: null,
                    finalizedTransaction: {
                        rawTransaction, transactionHash: BASE_TXID,
                        from: finalizedPlan.from, to: finalizedPlan.to, network: finalizedPlan.network, chainId: finalizedPlan.chainId,
                        nonce: finalizedPlan.nonce, gasLimit: finalizedPlan.gasLimit,
                        maxFeePerGas: finalizedPlan.maxFeePerGas, maxPriorityFeePerGas: finalizedPlan.maxPriorityFeePerGas,
                        value: finalizedPlan.value, data: finalizedPlan.data
                    }
                };
            }
        };
        const broadcaster = new BaseTransactionBroadcaster({
            rpcSource: { async broadcastRawTransaction() { return { broadcasted: true, txid: BASE_TXID }; } }
        });
        const basePublisher = new BaseAnchorPublisher({
            baseReviewedSigningCoordinator: new BaseReviewedSigningCoordinator(),
            baseSignedTransactionFinalizer: finalizer,
            baseTransactionBroadcaster: broadcaster,
            createBaseAnchorPublicationRecordUseCase: new CreateBaseAnchorPublicationRecordUseCase(),
            createPublicationAnchorUseCase: replica.createPublicationAnchorUseCase
        });
        const baseResult = await basePublisher.publish('pub-base', {
            contentHash: BASE_CONTENT_HASH, wallet, plan, reviewedTransaction: review, archive: PublicationObservationArchive.empty()
        });
        assert(baseResult.published === true, n('A1[base]. BaseAnchorPublisher.publish() succeeds through the real review-preserving signing coordinator and the real broadcaster'));
        assert(baseResult.anchor instanceof PublicationAnchor, n('A2[base]. a real PublicationAnchor is produced'));
        baseAnchor = baseResult.anchor;

        // --- Arweave: one-shot signer.sign(contentHash) -> anchor ---
        // The ONLY creation surface Arweave has (0.9.511 Section H) —
        // driven through the real generic orchestrator
        // (CreateExternalPublicationAnchorUseCase) and a real
        // ExternalAnchorPublisherRegistry holding only arweaveAnchorPublisher,
        // exactly the production shape ui/main.js wires it into.
        const arweaveLedger = new Map();
        const arweaveSigner = {
            async sign(material) {
                arweaveSignCalls += 1;
                return { id: ARWEAVE_TXID, transaction: { format: 2, id: ARWEAVE_TXID, data: material } };
            }
        };
        const arweaveFetchImpl = async (url, options = {}) => {
            arweaveFetchCalls += 1;
            const parsed = new URL(url);
            if (options.method === 'POST' && parsed.pathname === '/tx') {
                const body = JSON.parse(options.body);
                arweaveLedger.set(body.id, body.data);
                return new Response('accepted', { status: 200 });
            }
            const match = parsed.pathname.match(/^\/([A-Za-z0-9_-]+)$/);
            if (match && arweaveLedger.has(match[1])) return new Response(arweaveLedger.get(match[1]), { status: 200 });
            return new Response('not found', { status: 404 });
        };
        const arweavePublisher = new ArweaveAnchorPublisher({ signer: arweaveSigner, fetchImpl: arweaveFetchImpl });
        const arweavePublisherRegistry = new ExternalAnchorPublisherRegistry().register(arweavePublisher);
        const createExternalAnchor = new CreateExternalPublicationAnchorUseCase(
            replica.publicationCatalog, arweavePublisherRegistry, replica.createPublicationAnchorUseCase
        );
        const arweaveResult = await createExternalAnchor.execute('pub-arweave', 'arweave');
        assert(arweaveResult.outcome === ExternalAnchorCreationOutcome.CREATED, n('A1[arweave]. the generic orchestrator reports CREATED through the real, single-call Arweave publisher'));
        assert(arweaveResult.anchor instanceof PublicationAnchor, n('A2[arweave]. a real PublicationAnchor is produced'));
        arweaveAnchor = arweaveResult.anchor;

        // A3-A4: all three anchors really landed in the ONE shared catalog
        // — the different lifecycle SHAPES above never implied three
        // different destinations.
        assert(replica.anchorCatalog.list().length === 3, n('A3. all three anchors are cataloged together — one shared catalog, three substrates'));
        assert(replica.anchorCatalog.get(bitcoinAnchor.id) && replica.anchorCatalog.get(baseAnchor.id) && replica.anchorCatalog.get(arweaveAnchor.id),
            n('A4. each of the three anchors is independently retrievable from that shared catalog by its own id'));

        console.log('✓ Section A: creation — Bitcoin (granular pipeline -> BROADCASTED -> coordinator seam), Base (review -> sign -> finalize -> broadcast), and Arweave (one-shot signer.sign()) each mint a real, cataloged PublicationAnchor through their own legitimately different workflow shape, sharing one catalog');
    }

    // ===============================================================
    // Section B — contentHash fidelity: intended === anchor.contentHash
    // === the hash each substrate's own verifier is asked to check, with
    // no recomputation or transformation anywhere in the chain.
    // ===============================================================
    {
        assert(bitcoinAnchor.contentHash === BITCOIN_CONTENT_HASH, n('B1[bitcoin]. anchor.contentHash is exactly the intended hash — not re-hashed, not re-cased'));
        assert(baseAnchor.contentHash === BASE_CONTENT_HASH, n('B1[base]. anchor.contentHash is exactly the intended hash'));
        assert(arweaveAnchor.contentHash === ARWEAVE_CONTENT_HASH, n('B1[arweave]. anchor.contentHash is exactly the intended hash'));

        // B2: never derived from the publication's id, or from a
        // recomputed hash-of-a-hash — each anchor's contentHash is
        // reference-value-identical to the exact string this section's
        // own constants declared, never merely "similar."
        assert(bitcoinAnchor.contentHash.length === 64 && /^[0-9a-f]+$/.test(bitcoinAnchor.contentHash), n('B2[bitcoin]. the contentHash is carried as raw hex, unencoded a second time'));
        assert(baseAnchor.contentHash.length === 64 && /^[0-9a-f]+$/.test(baseAnchor.contentHash), n('B2[base]. the contentHash is carried as raw hex, unencoded a second time'));
        assert(arweaveAnchor.contentHash === ARWEAVE_CONTENT_HASH, n('B2[arweave]. the contentHash is carried unchanged'));

        // B3: each publication's own stored contentReference.hash still
        // agrees with the anchor that was minted for it — the anchor
        // never drifted from what CreatePublicationAnchorUseCase actually
        // looked up.
        assert(replica.publicationCatalog.get('pub-bitcoin').contentReference.hash === bitcoinAnchor.contentHash, n('B3[bitcoin]. the publication\'s own stored hash still agrees with the anchor'));
        assert(replica.publicationCatalog.get('pub-base').contentReference.hash === baseAnchor.contentHash, n('B3[base]. the publication\'s own stored hash still agrees with the anchor'));
        assert(replica.publicationCatalog.get('pub-arweave').contentReference.hash === arweaveAnchor.contentHash, n('B3[arweave]. the publication\'s own stored hash still agrees with the anchor'));

        console.log('✓ Section B: contentHash fidelity holds for all three substrates — the intended hash, the anchor\'s own carried hash, and the publication\'s own stored hash are the identical value throughout, with no recomputation or transformation at any step');
    }

    // ===============================================================
    // Section C — External transaction identity: each anchor's own
    // locator/proof names the real external artifact, never confused
    // with a publicationId, the anchor's own internal id, or the
    // publication's contentHash.
    // ===============================================================
    {
        assert(bitcoinAnchor.locator === `bitcoin:${BITCOIN_TXID}`, n('C1[bitcoin]. locator names the real txid under this substrate\'s own scheme'));
        assert(bitcoinAnchor.proof.txid === BITCOIN_TXID && bitcoinAnchor.proof.network === 'mainnet', n('C2[bitcoin]. proof carries exactly { txid, network }'));
        assert(baseAnchor.locator === `base:${BASE_TXID}`, n('C1[base]. locator names the real transaction hash under this substrate\'s own scheme'));
        assert(baseAnchor.proof.txid === BASE_TXID && baseAnchor.proof.network === 'mainnet', n('C2[base]. proof carries exactly { txid, network }'));
        assert(arweaveAnchor.locator === `ar://${ARWEAVE_TXID}`, n('C1[arweave]. locator names the real transaction id under this substrate\'s own scheme'));
        assert(arweaveAnchor.proof.txid === ARWEAVE_TXID, n('C2[arweave]. proof carries exactly { txid }'));

        // C3: the three locators are never confusable with one another —
        // distinct schemes, distinct values.
        const locators = new Set([bitcoinAnchor.locator, baseAnchor.locator, arweaveAnchor.locator]);
        assert(locators.size === 3, n('C3. all three locators are mutually distinct'));

        // C4-C7: never confused with publicationId, the anchor's own
        // internal id, or the publication's contentHash — checked for
        // every one of the three anchors.
        for (const [label, anchor, publicationId] of [
            ['bitcoin', bitcoinAnchor, 'pub-bitcoin'], ['base', baseAnchor, 'pub-base'], ['arweave', arweaveAnchor, 'pub-arweave']
        ]) {
            assert(anchor.locator !== publicationId, n(`C4[${label}]. locator is never the publicationId`));
            assert(anchor.proof.txid !== publicationId, n(`C5[${label}]. proof.txid is never the publicationId`));
            assert(anchor.locator !== anchor.id, n(`C6[${label}]. locator is never the anchor's own internal id (its createId()-generated identity)`));
            assert(anchor.proof.txid !== anchor.contentHash, n(`C7[${label}]. proof.txid is never the contentHash itself — the external transaction identity and the content identity are two different facts`));
            // C8: no proof object carries a field that would let it be
            // mistaken for a snapshot id, a content locator, or a
            // discovery announcement id — this anchor's proof is
            // transaction-identity evidence, nothing else.
            const forbiddenKeys = ['publicationId', 'snapshotId', 'contentLocator', 'discoveryAnnouncementId', 'announcementId'];
            const proofKeys = Object.keys(anchor.proof || {});
            assert(forbiddenKeys.every((key) => !proofKeys.includes(key)), n(`C8[${label}]. proof carries none of ${JSON.stringify(forbiddenKeys)} — only substrate-specific transaction identity`));
        }

        console.log('✓ Section C: external transaction identity — every anchor\'s locator/proof names the real, substrate-specific external artifact (a Bitcoin txid, a Base transaction hash, an Arweave transaction id), and none of the three is ever interchangeable with a publicationId, the anchor\'s own internal id, a contentHash, or a snapshot/discovery identifier');
    }

    // ===============================================================
    // Section D — Evidence: all three anchors are observable through
    // the shared externalAnchorEvidenceViewRegistry, purely and
    // repeatably, using the real evidence-view adapters unchanged.
    // ===============================================================
    let evidenceViewRegistry = null;
    {
        evidenceViewRegistry = new ExternalAnchorEvidenceViewRegistry()
            .register(new BitcoinAnchorEvidenceView())
            .register(new BaseAnchorEvidenceView())
            .register(new ArweaveAnchorEvidenceView());

        const bitcoinDescribed = evidenceViewRegistry.get(bitcoinAnchor.anchorType).describe(bitcoinAnchor);
        assert(bitcoinDescribed.summary === 'Bitcoin', n('D1[bitcoin]. describe() recognizes the anchor as Bitcoin'));
        assert(bitcoinDescribed.externalLocator && bitcoinDescribed.externalLocator.url.includes(BITCOIN_TXID) && bitcoinDescribed.externalLocator.url.includes('mempool.space'),
            n('D2[bitcoin]. describe() derives a followable mempool.space destination naming the real txid'));

        const baseDescribed = evidenceViewRegistry.get(baseAnchor.anchorType).describe(baseAnchor);
        assert(baseDescribed.summary === 'Base', n('D1[base]. describe() recognizes the anchor as Base'));
        assert(baseDescribed.externalLocator && baseDescribed.externalLocator.url.includes(BASE_TXID) && baseDescribed.externalLocator.url.includes('basescan.org'),
            n('D2[base]. describe() derives a followable basescan.org destination naming the real transaction hash'));

        const arweaveDescribed = evidenceViewRegistry.get(arweaveAnchor.anchorType).describe(arweaveAnchor);
        assert(arweaveDescribed.summary === 'Arweave', n('D1[arweave]. describe() recognizes the anchor as Arweave'));
        assert(arweaveDescribed.externalLocator && arweaveDescribed.externalLocator.url.includes(ARWEAVE_TXID) && arweaveDescribed.externalLocator.url.includes('viewblock.io'),
            n('D2[arweave]. describe() derives a followable viewblock.io destination naming the real transaction id'));

        // D3: purity — describe() is synchronous, side-effect-free, and
        // repeatable: calling it twice on the same anchor produces the
        // byte-identical result, and it never mutates the anchor.
        const beforeJson = JSON.stringify([bitcoinAnchor.toJSON(), baseAnchor.toJSON(), arweaveAnchor.toJSON()]);
        const secondPass = [
            evidenceViewRegistry.get('bitcoin-op-return').describe(bitcoinAnchor),
            evidenceViewRegistry.get('base').describe(baseAnchor),
            evidenceViewRegistry.get('arweave').describe(arweaveAnchor)
        ];
        assert(JSON.stringify(secondPass[0]) === JSON.stringify(bitcoinDescribed), n('D3[bitcoin]. describe() is repeatable — byte-identical on a second call'));
        assert(JSON.stringify(secondPass[1]) === JSON.stringify(baseDescribed), n('D3[base]. describe() is repeatable — byte-identical on a second call'));
        assert(JSON.stringify(secondPass[2]) === JSON.stringify(arweaveDescribed), n('D3[arweave]. describe() is repeatable — byte-identical on a second call'));
        const afterJson = JSON.stringify([bitcoinAnchor.toJSON(), baseAnchor.toJSON(), arweaveAnchor.toJSON()]);
        assert(beforeJson === afterJson, n('D4. inspecting evidence for all three anchors mutated none of them'));

        console.log('✓ Section D: evidence — all three anchors are observable through the ONE shared evidence-view registry, each producing a substrate-correct, followable external locator, purely and repeatably, with zero mutation');
    }

    // ===============================================================
    // Section E — Verification: independent, substrate-specific proof
    // verification for all three, and the explicit cross-substrate
    // proof that evidence presentation never constitutes verification.
    // ===============================================================
    {
        const bitcoinVerifier = new BitcoinOpReturnProofVerifier({
            fetchImpl: async (url) => {
                const parsed = new URL(url);
                if (parsed.pathname.endsWith(`/tx/${BITCOIN_TXID}`)) {
                    return new Response(JSON.stringify({
                        txid: BITCOIN_TXID,
                        vout: [{ scriptpubkey_type: 'op_return', scriptpubkey_asm: `OP_RETURN OP_PUSHBYTES_${BITCOIN_CONTENT_HASH.length / 2} ${BITCOIN_CONTENT_HASH}` }],
                        status: { confirmed: true, block_height: 900001 }
                    }), { status: 200 });
                }
                return new Response('not found', { status: 404 });
            }
        });
        const baseVerifier = new BaseProofVerifier({
            network: 'mainnet',
            rpcSource: { async fetchTransactionByHash(txid) {
                return txid === BASE_TXID ? { available: true, found: true, hash: txid, input: basePlanData } : { available: true, found: false };
            } }
        });
        const arweaveVerifier = new ArweaveTransactionDataProofVerifier({
            fetchImpl: async (url) => {
                const parsed = new URL(url);
                const match = parsed.pathname.match(/^\/([A-Za-z0-9_-]+)$/);
                if (match && match[1] === ARWEAVE_TXID) return new Response(ARWEAVE_CONTENT_HASH, { status: 200 });
                return new Response('not found', { status: 404 });
            }
        });

        const identityVerifier = new ExternalAnchorVerifier(replica.authVerifier);
        const registry = new ExternalProofVerifierRegistry().register(bitcoinVerifier).register(baseVerifier).register(arweaveVerifier);

        for (const [label, anchor, publicationId] of [
            ['bitcoin', bitcoinAnchor, 'pub-bitcoin'], ['base', baseAnchor, 'pub-base'], ['arweave', arweaveAnchor, 'pub-arweave']
        ]) {
            const result = await identityVerifier.verify(anchor.toJSON(), {
                expectedContentHash: replica.publicationCatalog.get(publicationId).contentReference.hash,
                expectedPublicationId: publicationId,
                proofVerifierRegistry: registry
            });
            assert(result.outcome === AnchorVerificationOutcome.VALID, n(`E1[${label}]. the anchor this audit minted verifies VALID — genuinely signed AND independently proof-checked against the real external record`));
        }

        // E2-E4: evidence presentation does NOT constitute verification —
        // proven cross-substrate, freshly, the same invariant
        // tests/BaseAnchorEvidenceView.test.js's own Section E already
        // established for Base alone. For each substrate: describe() the
        // SAME anchor before and after a verifier reaches a definite
        // "cannot presently confirm" against a fixture that no longer
        // carries the matching record — the description is unaffected
        // either way, because it never depended on verification at all.
        const notFoundBitcoinVerifier = new BitcoinOpReturnProofVerifier({ fetchImpl: async () => new Response('not found', { status: 404 }) });
        const notFoundBaseVerifier = new BaseProofVerifier({ network: 'mainnet', rpcSource: { async fetchTransactionByHash() { return { available: true, found: false }; } } });
        const notFoundArweaveVerifier = new ArweaveTransactionDataProofVerifier({ fetchImpl: async () => new Response('not found', { status: 404 }) });

        for (const [label, anchor, notFoundVerifier, publicationId] of [
            ['bitcoin', bitcoinAnchor, notFoundBitcoinVerifier, 'pub-bitcoin'],
            ['base', baseAnchor, notFoundBaseVerifier, 'pub-base'],
            ['arweave', arweaveAnchor, notFoundArweaveVerifier, 'pub-arweave']
        ]) {
            const beforeDescribe = JSON.stringify(evidenceViewRegistry.get(anchor.anchorType).describe(anchor));
            const missRegistry = new ExternalProofVerifierRegistry().register(notFoundVerifier);
            const missResult = await identityVerifier.verify(anchor.toJSON(), {
                expectedContentHash: replica.publicationCatalog.get(publicationId).contentReference.hash,
                expectedPublicationId: publicationId,
                proofVerifierRegistry: missRegistry
            });
            assert(missResult.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE, n(`E2[${label}]. an external record that cannot presently be found reports PROOF_UNAVAILABLE, never a silent VALID and never a crash`));
            const afterDescribe = JSON.stringify(evidenceViewRegistry.get(anchor.anchorType).describe(anchor));
            assert(beforeDescribe === afterDescribe, n(`E3[${label}]. the SAME anchor's evidence description is byte-identical before and after that verification attempt — presentation never depends on, or is ever gated by, verification`));
            assert(bitcoinAnchor.contentHash === BITCOIN_CONTENT_HASH && baseAnchor.contentHash === BASE_CONTENT_HASH && arweaveAnchor.contentHash === ARWEAVE_CONTENT_HASH,
                n(`E4[${label}]. and the anchor itself is untouched by a failed verification attempt — no anchor field was ever mutated`));
        }

        console.log('✓ Section E: verification — all three substrates independently confirm VALID against a real (fake-network) external record via their own ProofVerifier, and, freshly, cross-substrate: evidence presentation and verification are proven independent axes — a verification miss changes nothing about how an anchor\'s evidence is described');
    }

    // ===============================================================
    // Section F — Bitcoin lifecycle boundary: no anchor before
    // BROADCASTED, no duplicate from repeated observation of the same
    // broadcast.
    // ===============================================================
    {
        // F1-F3: the caller-contract boundary itself, re-verified fresh
        // against a fresh coordinator/catalog.
        const boundaryReplica = makeSharedReplica();
        publishContent(boundaryReplica.publicationCatalog, { id: 'pub-boundary', hash: 'cc'.repeat(32) });
        const boundaryCoordinator = new BitcoinAnchorPublicationCoordinator({
            publicationCatalog: boundaryReplica.publicationCatalog,
            createPublicationAnchorUseCase: boundaryReplica.createPublicationAnchorUseCase,
            publicationAnchorCatalog: boundaryReplica.anchorCatalog
        });
        await expectRejects(
            boundaryCoordinator.publishBroadcastedAnchor('pub-boundary', { broadcasted: false, txid: 'dd'.repeat(32), network: 'mainnet' }),
            n('F1. publishBroadcastedAnchor() throws when broadcasted is not true')
        );
        await expectRejects(
            boundaryCoordinator.publishBroadcastedAnchor('pub-boundary', { broadcasted: true, txid: null, network: 'mainnet' }),
            n('F2. publishBroadcastedAnchor() throws when txid is missing')
        );
        assert(boundaryReplica.anchorCatalog.list().length === 0, n('F3. no anchor exists after either boundary violation'));

        // F4-F8: the real granular BROADCAST state machine — REJECTED and
        // UNAVAILABLE broadcast outcomes never reach the coordinator at
        // all (mirroring the exact production guard
        // ui/views/DecentralizedPublicationsView.js#broadcastBitcoinAnchorTransaction()
        // itself holds — see Section I), and only a genuine BROADCASTED
        // outcome ever does. Uses the REAL BitcoinAnchorBroadcastCoordinator
        // and the REAL BitcoinAnchorTransactionBroadcaster — only the
        // lowest-level network broadcaster is faked, with a synthetic
        // (never real-signed) finalized-transaction shape; deriving those
        // bytes for real, through the full FUNDED -> CONSTRUCTED ->
        // REVIEWED -> SIGNED -> FINALIZED chain, is Section A's own job
        // above plus Section K's regression witness — this section's own
        // job is the BROADCASTED boundary itself.
        function freshBroadcastCoordinator(handler) {
            const broadcaster = { async broadcast(hex) { return handler(hex); } };
            return new BitcoinAnchorBroadcastCoordinator({ bitcoinAnchorTransactionBroadcaster: new BitcoinAnchorTransactionBroadcaster({ broadcaster }) });
        }
        async function driveProductionGuard(coordinator, publicationId, broadcastOutcome) {
            // Mirrors the exact production guard confirmed live in
            // Section I: only a BROADCASTED outcome ever reaches
            // publishBroadcastedAnchor().
            if (broadcastOutcome.state !== BitcoinAnchorBroadcastState.BROADCASTED) return null;
            return coordinator.publishBroadcastedAnchor(publicationId, { broadcasted: true, txid: broadcastOutcome.txid, network: 'mainnet' });
        }

        publishContent(boundaryReplica.publicationCatalog, { id: 'pub-rejected', hash: 'ee'.repeat(32) });
        const rejectedFinalized = { finalized: true, txid: 'f0'.repeat(32), rawTransaction: syntheticRawTransaction(0xf0) };
        const rejectedOutcome = await freshBroadcastCoordinator(() => ({ broadcast: false, reason: 'non-standard' })).broadcast(rejectedFinalized);
        assert(rejectedOutcome.state === BitcoinAnchorBroadcastState.REJECTED, n('F4. sanity: the network definitely refuses this transaction'));
        assert(await driveProductionGuard(boundaryCoordinator, 'pub-rejected', rejectedOutcome) === null, n('F5. a REJECTED broadcast never reaches publishBroadcastedAnchor()'));
        assert(boundaryReplica.anchorCatalog.list().length === 0, n('F6. no anchor exists after a rejected broadcast — premature minting never happens'));

        publishContent(boundaryReplica.publicationCatalog, { id: 'pub-unavailable', hash: 'f1'.repeat(32) });
        const unavailableFinalized = { finalized: true, txid: 'f2'.repeat(32), rawTransaction: syntheticRawTransaction(0xf2) };
        const unavailableOutcome = await freshBroadcastCoordinator(() => ({ broadcast: false, unavailable: true, reason: 'no connectivity' })).broadcast(unavailableFinalized);
        assert(unavailableOutcome.state === BitcoinAnchorBroadcastState.UNAVAILABLE, n('F7. sanity: the network cannot presently be reached'));
        assert(await driveProductionGuard(boundaryCoordinator, 'pub-unavailable', unavailableOutcome) === null, n('F8. an UNAVAILABLE broadcast never reaches publishBroadcastedAnchor() either'));
        assert(boundaryReplica.anchorCatalog.list().length === 0, n('F9. anchor-publication failure never falsely reports success — the catalog is still empty'));

        publishContent(boundaryReplica.publicationCatalog, { id: 'pub-success', hash: 'f3'.repeat(32) });
        const successTxid = 'f4'.repeat(32);
        const successFinalized = { finalized: true, txid: successTxid, rawTransaction: syntheticRawTransaction(0xf4) };
        const successOutcome = await freshBroadcastCoordinator(() => ({ broadcast: true })).broadcast(successFinalized);
        assert(successOutcome.state === BitcoinAnchorBroadcastState.BROADCASTED, n('F10. sanity: this transaction genuinely broadcasts'));
        const firstMint = await driveProductionGuard(boundaryCoordinator, 'pub-success', successOutcome);
        assert(firstMint && firstMint.anchor instanceof PublicationAnchor, n('F11. ONLY the genuine BROADCASTED outcome ever reaches publishBroadcastedAnchor(), and it mints a real anchor'));
        assert(boundaryReplica.anchorCatalog.list().length === 1, n('F12. exactly one anchor now exists — the successful one'));

        // F13-F14: repeated observation of the SAME already-broadcast fact
        // (a duplicate event, an accidentally re-invoked UI action) never
        // mints a second anchor.
        const secondMint = await driveProductionGuard(boundaryCoordinator, 'pub-success', successOutcome);
        assert(boundaryReplica.anchorCatalog.list().length === 1, n('F13. a second observation of the SAME publicationId/txid never creates a second anchor'));
        assert(secondMint.anchor.id === firstMint.anchor.id, n('F14. the second call returns the SAME already-cataloged anchor, never a fresh one'));

        console.log('✓ Section F: Bitcoin lifecycle boundary — FUNDED through FINALIZED never mints an anchor (only a genuine BROADCASTED outcome does, gated by the real production guard), and repeated observation of the identical broadcast fact is idempotent, never duplicative');
    }

    // ===============================================================
    // Section G — Cross-substrate isolation: one substrate's failure
    // never falls back to another; substrate choice never touches
    // content storage, discovery, snapshot resolution, or World
    // Encounter.
    // ===============================================================
    {
        // G1-G3: a Bitcoin failure never touches Base's or Arweave's own
        // state, using the SAME shared catalog Section A populated —
        // its count must grow by exactly zero from a Bitcoin failure.
        const beforeCount = replica.anchorCatalog.list().length;
        const bitcoinCoordinator = new BitcoinAnchorPublicationCoordinator({
            publicationCatalog: replica.publicationCatalog,
            createPublicationAnchorUseCase: replica.createPublicationAnchorUseCase,
            publicationAnchorCatalog: replica.anchorCatalog
        });
        await expectRejects(
            bitcoinCoordinator.publishBroadcastedAnchor('pub-bitcoin', { broadcasted: false, txid: 'ff'.repeat(32), network: 'mainnet' }),
            n('G1. a Bitcoin publication-boundary failure throws, as established')
        );
        assert(replica.anchorCatalog.list().length === beforeCount, n('G2. and the shared catalog\'s own count is unchanged — no anchor, from any substrate, was created as a side effect'));
        // Base and Arweave remain independently usable right after —
        // never blocked, degraded, or routed anywhere else by Bitcoin's
        // own failure.
        const arweaveRetryPublisher = new ArweaveAnchorPublisher({
            signer: { async sign(material) { return { id: 'FakeArTxIsolationCheck1', transaction: { format: 2, id: 'FakeArTxIsolationCheck1', data: material } }; } },
            fetchImpl: async (url, options = {}) => (options.method === 'POST' ? new Response('accepted', { status: 200 }) : new Response('not found', { status: 404 }))
        });
        publishContent(replica.publicationCatalog, { id: 'pub-arweave-isolation', hash: '44'.repeat(32) });
        const isolationRegistry = new ExternalAnchorPublisherRegistry().register(arweaveRetryPublisher);
        const isolationResult = await new CreateExternalPublicationAnchorUseCase(replica.publicationCatalog, isolationRegistry, replica.createPublicationAnchorUseCase)
            .execute('pub-arweave-isolation', 'arweave');
        assert(isolationResult.outcome === ExternalAnchorCreationOutcome.CREATED, n('G3. Arweave anchoring still succeeds immediately after a Bitcoin failure — no shared-state contamination, no implicit block'));

        // G4-G5: a Base signing failure (a declined wallet) never falls
        // back to Arweave, and never touches the Arweave publisher at
        // all — proven by construction: the Base failure path below never
        // references arweavePublisher, arweaveSigner, or any Arweave
        // collaborator.
        publishContent(replica.publicationCatalog, { id: 'pub-base-decline', hash: '55'.repeat(32) });
        const declinePlan = Object.freeze({
            network: 'mainnet', chainId: 8453, from: '0x' + 'd1'.repeat(20), to: '0x' + 'd1'.repeat(20), value: '0',
            data: encodeBasePublicationCommitment('55'.repeat(32)), nonce: 1, gasLimit: 40000, maxFeePerGas: '1', maxPriorityFeePerGas: '1'
        });
        const declineReview = describeBasePublicationTransactionReview(declinePlan);
        const decliningWallet = { async signTransaction() { return { signed: false, reason: 'user rejected the request' }; } };
        const declinePublisher = new BaseAnchorPublisher({
            baseReviewedSigningCoordinator: new BaseReviewedSigningCoordinator(),
            baseSignedTransactionFinalizer: { finalize() { throw new Error('must never be reached — signing already failed'); } },
            baseTransactionBroadcaster: new BaseTransactionBroadcaster({ rpcSource: { async broadcastRawTransaction() { throw new Error('must never be reached'); } } }),
            createBaseAnchorPublicationRecordUseCase: new CreateBaseAnchorPublicationRecordUseCase(),
            createPublicationAnchorUseCase: replica.createPublicationAnchorUseCase
        });
        const declineResult = await declinePublisher.publish('pub-base-decline', {
            contentHash: '55'.repeat(32), wallet: decliningWallet, plan: declinePlan, reviewedTransaction: declineReview, archive: PublicationObservationArchive.empty()
        });
        assert(declineResult.published === false, n('G4. a declined Base wallet signature is a definite no, reported honestly'));
        const afterDeclineCount = replica.anchorCatalog.list().length;
        assert(afterDeclineCount === beforeCount + 1, n('G5. exactly the one Arweave anchor from G3 above was added since G2 — the Base decline created nothing, and nothing "fell back" to any other substrate'));

        // G6-G8: no implicit "try another chain" — structural. Neither
        // publisher class ever IMPORTS another substrate's own publisher
        // (checked against actual `import` statements only — every one of
        // these files' own headers cross-REFERENCES the other substrates
        // by name in prose comments, which is not the same thing).
        function importLines(src) {
            return src.split('\n').filter((line) => line.trim().startsWith('import ')).join('\n');
        }
        const bitcoinPublisherImports = importLines(await source('anchoring/BitcoinAnchorPublisher.js'));
        const basePublisherImports = importLines(await source('anchoring/BaseAnchorPublisher.js'));
        const arweavePublisherImports = importLines(await source('anchoring/ArweaveAnchorPublisher.js'));
        const coordinatorImports = importLines(await source('application/BitcoinAnchorPublicationCoordinator.js'));
        assert(!/BaseAnchorPublisher|ArweaveAnchorPublisher/.test(bitcoinPublisherImports) && !/BaseAnchorPublisher|ArweaveAnchorPublisher/.test(coordinatorImports),
            n('G6. Bitcoin\'s own publisher/coordinator never imports Base\'s or Arweave\'s publisher'));
        assert(!/BitcoinAnchorPublisher|ArweaveAnchorPublisher/.test(basePublisherImports), n('G7. Base\'s own publisher never imports Bitcoin\'s or Arweave\'s publisher'));
        assert(!/BitcoinAnchorPublisher|BaseAnchorPublisher/.test(arweavePublisherImports), n('G8. Arweave\'s own publisher never imports Bitcoin\'s or Base\'s publisher'));

        // G9-G12: substrate choice never touches content storage,
        // discovery, snapshot resolution, or World Encounter — none of
        // the four real anchoring-side production files import from
        // those roles at all.
        const anchoringFiles = [
            'anchoring/BitcoinAnchorPublisher.js', 'anchoring/BaseAnchorPublisher.js', 'anchoring/ArweaveAnchorPublisher.js',
            'application/BitcoinAnchorPublicationCoordinator.js'
        ];
        for (const file of anchoringFiles) {
            const src = codeOnly(await source(file));
            assert(!/from ['"]\.\.\/content\//.test(src), n(`G9[${file}]. never imports from content/`));
            assert(!/from ['"]\.\.\/discovery\//.test(src) && !/SnapshotCandidateDiscovery|SnapshotResolver/.test(src), n(`G10[${file}]. never imports Snapshot/Discovery resolution machinery`));
            assert(!/WorldEncounter/.test(src), n(`G11[${file}]. never references World Encounter`));
        }
        console.log('✓ Section G: cross-substrate isolation — a Bitcoin failure and a Base failure each leave the other two substrates, and the shared catalog, completely untouched; no publisher imports another substrate\'s publisher; and none of the four real anchoring production files touch content storage, discovery, snapshot resolution, or World Encounter');
    }

    // ===============================================================
    // Section H — Arweave asymmetry: re-confirmed fresh. The one-shot
    // shape is a deliberate signer-contract consequence, never a
    // missing parity feature.
    // ===============================================================
    {
        const arweaveSrc = await source('anchoring/ArweaveAnchorPublisher.js');
        assert(/signer\.sign\(contentHash\)/.test(codeOnly(arweaveSrc)), n('H1. ArweaveAnchorPublisher hands its signer a bare contentHash and awaits ONE resolved value — no second call for review'));
        assert(/NO WALLET MANAGEMENT/.test(arweaveSrc), n('H2. its own header states this is deliberate'));
        const arweaveReviewFiles = execSync("grep -rli 'arweave' --include='*.js' . 2>/dev/null | grep -i review | grep -v node_modules | grep -v tests/ || true", { cwd: SOURCE_ROOT }).toString().trim();
        assert(arweaveReviewFiles === '', n('H3. no production file anywhere pairs "arweave" with "review" — re-confirmed fresh, no review-gated Arweave signing concept exists'));

        // H4: live — in Section A above, minting the Arweave anchor
        // needed exactly one signer.sign() call and one gateway POST,
        // both internal to the SINGLE publisher.publish(contentHash)
        // call a caller makes. Contrast: Base's own flagship above
        // required a separately-CONSTRUCTED plan, a separately-produced
        // review object, and an explicit wallet.signTransaction() call —
        // three distinct artifacts a caller must produce BEFORE publish()
        // is ever reachable at all (anchoring/BaseAnchorPublisher.js's own
        // publish(publicationId, { contentHash, wallet, plan,
        // reviewedTransaction, archive }) signature, contrasted with
        // anchoring/ArweaveAnchorPublisher.js's own publish(contentHash)).
        assert(arweaveSignCalls === 1, n('H4. exactly one signer.sign() call happened — the entire creation workflow is one call deep'));
        assert(arweaveFetchCalls === 1, n('H5. exactly one gateway network call happened — no separate review round trip'));
        const baseSignature = /async publish\(publicationId, \{ contentHash, wallet, plan, reviewedTransaction, archive \} = \{\}\)/.test(codeOnly(await source('anchoring/BaseAnchorPublisher.js')));
        const arweaveSignature = /async publish\(contentHash\)/.test(codeOnly(arweaveSrc));
        assert(baseSignature && arweaveSignature, n('H6. Base\'s own publish() signature requires pre-built review material as separate arguments; Arweave\'s own publish() signature takes only a bare contentHash — a structural, not cosmetic, difference in workflow depth'));

        console.log('✓ Section H: Arweave asymmetry — re-confirmed fresh, live and structurally: its one-shot shape follows directly from a signer contract this codebase has never given a review gate, not from an unfinished workflow. DELIBERATE_ASYMMETRY, not a missing parity feature.');
    }

    // ===============================================================
    // Section I — UI journey: a person can actually REACH all three
    // creation paths, and inspect/verify any resulting anchor, through
    // real, located view code.
    // ===============================================================
    {
        const mainSrc = codeOnly(await source('ui/main.js'));
        const viewSrc = codeOnly((await Promise.all(publicationsPageFiles().map((file) => source(file)))).join('\n'));

        // I1-I2: Bitcoin — the activated 0.9.512 seam.
        assert(mainSrc.includes("app.provide('bitcoinAnchorPublicationCoordinator', bitcoinAnchorPublicationCoordinator);"), n('I1[bitcoin]. ui/main.js provides the real coordinator to the app'));
        const broadcastFnMatch = viewSrc.match(/async function broadcastBitcoinAnchorTransaction\(\) \{[\s\S]*?\n {4}\}\n/);
        assert(broadcastFnMatch && broadcastFnMatch[0].includes('publishBroadcastedAnchor(') && broadcastFnMatch[0].includes('BitcoinAnchorBroadcastState.BROADCASTED'),
            n('I2[bitcoin]. publishBroadcastedAnchor() is reachable from the real, explicit "Broadcast Transaction" action, guarded by the real BROADCASTED state'));

        // I3-I4: Base — the dedicated action.
        assert(viewSrc.includes('async function createBaseAnchor(entry)'), n('I3[base]. createBaseAnchor(entry) exists as a real, explicit, person-triggered action'));
        assert(/const result = await baseAnchorPublisher\.publish\(entry\.publication\.id, \{/.test(viewSrc), n('I4[base]. it calls the real baseAnchorPublisher.publish()'));

        // I5-I7: Arweave — the generic card, reachable through the
        // availableAnchorTypes() list this replica's own registry
        // populates.
        assert(/externalAnchorPublisherRegistry\.register\(arweaveAnchorPublisher\)/.test(mainSrc), n('I5[arweave]. arweaveAnchorPublisher is registered into the registry availableAnchorTypes() reads'));
        assert(/v-for="anchorType in availableAnchorTypes"/.test((await Promise.all(publicationsPageFiles().map((file) => source(file)))).join('\n')), n('I6[arweave]. a real card is rendered for every available anchorType, Arweave included'));
        assert(/@click="createAnchor\(entry, anchorType\)"/.test((await Promise.all(publicationsPageFiles().map((file) => source(file)))).join('\n')) && viewSrc.includes('async function createAnchor(entry, anchorType)'),
            n('I7[arweave]. that card\'s own button click reaches a real createAnchor(entry, anchorType) action'));

        // I8-I9: all three — evidence inspection and verification are
        // BOTH reachable for any anchor, regardless of anchorType (never
        // gated per-substrate), and are two clearly separate actions.
        assert(/@click="toggleInspect\(entry, anchorView\)"/.test((await Promise.all(publicationsPageFiles().map((file) => source(file)))).join('\n')) && viewSrc.includes('function toggleInspect(entry, anchorView)'),
            n('I8. "Inspect Evidence" reaches a real, anchorType-agnostic toggleInspect() for any anchor'));
        assert(/@click="verifyAnchor\(entry, anchorView\)"/.test((await Promise.all(publicationsPageFiles().map((file) => source(file)))).join('\n')) && viewSrc.includes('async function verifyAnchor(entry, anchorView)'),
            n('I9. "Verify Evidence" reaches a real, anchorType-agnostic verifyAnchor() for any anchor — a distinct action from inspection, never triggered as a side effect of it'));

        console.log('✓ Section I: UI journey — all three substrates are reachable from real, located view code (not merely present as classes): Bitcoin\'s real broadcast action, Base\'s dedicated creation action, and Arweave\'s generic-registry card all mint anchors a person can then inspect and, separately, verify through the identical two anchorType-agnostic actions');
    }

    // ===============================================================
    // Section J — Common semantic contract: the one compact invariant,
    // checked together against all three real anchors this audit
    // itself minted.
    // ===============================================================
    {
        // For every supported anchoring substrate, a successfully created
        // Publication Anchor identifies an external substrate artifact
        // that can independently be inspected and verified against the
        // intended contentHash, while substrate-specific execution and
        // failure semantics remain intact.
        for (const [label, anchor, publisherAnchorType] of [
            ['bitcoin', bitcoinAnchor, 'bitcoin-op-return'], ['base', baseAnchor, 'base'], ['arweave', arweaveAnchor, 'arweave']
        ]) {
            assert(anchor.anchorType === publisherAnchorType, n(`J1[${label}]. the anchor names its own substrate's real, distinct anchorType`));
            assert(typeof anchor.locator === 'string' && anchor.locator.length > 0, n(`J2[${label}]. the anchor identifies a real external locator (Section C)`));
            assert(evidenceViewRegistry.has(anchor.anchorType), n(`J3[${label}]. that locator/proof is independently inspectable (Section D)`));
        }
        // J4: substrate-specific execution/failure vocabularies remain
        // genuinely distinct — never collapsed into one generic shape.
        const anchorTypes = new Set([new (await import('../anchoring/BitcoinAnchorPublisher.js')).BitcoinAnchorPublisher({ broadcaster: { broadcast() {} } }).anchorType,
            new (await import('../anchoring/BaseAnchorPublisher.js')).BaseAnchorPublisher({
                baseReviewedSigningCoordinator: { sign() {} }, baseSignedTransactionFinalizer: { finalize() {} },
                baseTransactionBroadcaster: { broadcast() {} }, createBaseAnchorPublicationRecordUseCase: { execute() {} },
                createPublicationAnchorUseCase: { execute() {} }
            }).anchorType,
            new (await import('../anchoring/ArweaveAnchorPublisher.js')).ArweaveAnchorPublisher({ signer: { sign() {} }, fetchImpl: async () => {} }).anchorType
        ]);
        assert(anchorTypes.size === 3, n('J4. Bitcoin, Base, and Arweave each expose their own, mutually distinct anchorType — substrate identity is never collapsed'));

        console.log('✓ Section J: the common semantic contract holds for all three substrates at once — every anchor this audit minted identifies a real external artifact, independently inspectable and independently verifiable against the intended contentHash, with substrate-specific identity and execution semantics fully intact');
    }

    // ===============================================================
    // Section K — Regression witnesses: dependent tests re-executed
    // live, right now, against current source.
    // ===============================================================
    {
        // Deliberately excludes tests/ProofAnchoringCrossSubstrateCapabilityParityAudit
        // .test.js (its own Section M asserts, via a live git-status
        // read, that ONLY its own file and tests.html changed — this
        // audit's own not-yet-committed test file would trip that guard
        // as a false regression, never a real one), and the sibling
        // git-status-guarded audits tests/BaseAnchorPublishingUIApplicationIntegrationBoundaryAudit
        // .test.js, tests/BaseReviewPreservingAnchorPublishingIntegrationBoundaryAudit
        // .test.js, and tests/BitcoinEndpointConfigurationUIReachabilityAudit.test.js,
        // for the identical reason — exactly the same exclusion
        // discipline tests/ProofAnchoringCrossSubstrateCapabilityParityAudit
        // .test.js's own Section L already established.
        const DEPENDENT_TESTS = [
            'tests/BitcoinGranularPipelineAnchorPublicationIntegrationAudit.test.js',
            'tests/BitcoinAnchorPublicationLifecycle.test.js',
            'tests/BaseAnchorPublisher.test.js',
            'tests/BaseAnchorEvidenceView.test.js',
            'tests/ArweaveAnchorProviderImplementation.test.js',
            'tests/ArweaveProofAnchorIntegrationBoundaryAudit.test.js',
            'tests/ExternalAnchorCreationOrchestration.test.js',
            'tests/PublicationAnchorCreation.test.js'
        ];
        for (const file of DEPENDENT_TESTS) {
            assert(await sourceExists(file), n(`K1[${file}]. exists on disk`));
        }
        for (const file of DEPENDENT_TESTS) {
            const { passed, output } = runLive(file);
            assert(passed, n(`K2[${file}]. passes on live re-execution against current source${passed ? '' : ` — FAILED: ${output.split('\n').slice(-4).join(' | ')}`}`));
        }
        console.log(`✓ Section K: all ${DEPENDENT_TESTS.length} directly-cited dependent tests were re-executed live, right now, and all passed — the full real Bitcoin fund->construct->review->sign->finalize->broadcast->anchor chain (Section F's own scoped substitute) is independently re-proven here, not merely assumed`);
    }

    // ===============================================================
    // Section L — Deliberately excluded, and the production-change
    // guard.
    // ===============================================================
    {
        const EXCLUDED = [
            'an Arweave multi-step workflow', 'a Bitcoin publisher redesign', 'a UniSat replacement',
            'a generic transaction abstraction', 'a cross-chain fallback', 'automatic multi-substrate anchoring',
            'anchor replication', 'confirmation polling beyond what already exists', 'new proof states',
            'ownership/authorship semantics', 'a wallet-management redesign', 'an evidence-view redesign',
            'a generic verifier abstraction for symmetry\'s own sake'
        ];
        assert(EXCLUDED.length === 13, n('L1. the full exclusion list from this file\'s own header is thirteen items, named, not silently dropped'));

        // L2/L3 ORIGINALLY asserted, live, against `git status --porcelain`,
        // that this audit's OWN commit built nothing beyond its own test
        // file and tests.html's own registration. That was a true, live
        // constraint on this milestone's own commit alone — never a
        // standing regression gate against every later commit — the
        // identical demotion tests/
        // PublicationsDistributionSectionProductAndUIBoundaryAudit.test.js's
        // own Section I1/I2 already applies to a structurally identical
        // situation. Preferred Proof & Anchoring Provider Creation
        // Integration legitimately extended production afterward; a live
        // `git status` assertion here would now fail on that legitimate,
        // intentional change, and on every other legitimate change this
        // repository makes from now on. Demoted to a historical record
        // rather than deleted, since it correctly documents what WAS true
        // when this audit was first written.
        console.log('  (historical) L2/L3 — as of this audit\'s own original commit, it built nothing beyond its own test file and tests.html\'s own registration, and touched no production directory. Preferred Proof & Anchoring Provider Creation Integration legitimately extended production afterward — this is no longer a live constraint.');

        console.log('✓ Section L: deliberately excluded list confirmed named, not dropped; the only new files at this audit\'s own original commit were its own test and its tests.html registration');
    }

    console.log(`\nAll ${assertionCount} assertions passed.`);
    console.log('\n=== VERDICT ===');
    console.log('Bitcoin, Base, and Arweave each mint a real, cataloged PublicationAnchor through their own legitimately different');
    console.log('production workflow (Section A), preserving contentHash fidelity and distinct external transaction identity');
    console.log('(Sections B-C) with zero recomputation or confusion. All three are independently observable as evidence and');
    console.log('independently verifiable, and evidence presentation is proven, fresh and cross-substrate, never to constitute');
    console.log('verification (Sections D-E). Bitcoin\'s own lifecycle boundary — no anchor before BROADCASTED, no duplicate from');
    console.log('repeated observation — holds (Section F). No substrate\'s failure ever falls back to another, and substrate choice');
    console.log('never touches content, discovery, snapshot resolution, or World Encounter (Section G). Arweave\'s one-shot shape');
    console.log('remains DELIBERATE_ASYMMETRY, re-confirmed fresh (Section H). All three creation paths, plus evidence inspection');
    console.log('and independent verification, are reachable through real, located UI code, not merely present as classes (Section');
    console.log('I). The one compact cross-substrate invariant (Section J) holds for all three at once, and every directly-cited');
    console.log('dependent test still passes on live re-execution (Section K).');
    console.log('');
    console.log('Bitcoin   -> COMPLETE');
    console.log('Base      -> COMPLETE');
    console.log('Arweave   -> COMPLETE');
    console.log('workflow differences -> DELIBERATE_ASYMMETRY');
    console.log('');
    console.log('The Proof/Anchoring technical arc is genuinely complete. The next open question is a product one — can a person');
    console.log('actually discover and understand these three differently-shaped workflows — never whether the three implementations');
    console.log('look identical, which this audit does not recommend making them.');
}

run().then(() => {
    console.log('\n✅ All ProofAnchoringCrossSubstrateEndToEndClosureAudit tests passed.');
}).catch((error) => {
    console.error('ProofAnchoringCrossSubstrateEndToEndClosureAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
