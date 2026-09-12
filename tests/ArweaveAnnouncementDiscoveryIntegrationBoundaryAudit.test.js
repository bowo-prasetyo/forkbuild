import { readFile } from 'node:fs/promises';

import { describeDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import { describePublicationDistribution } from '../application/PublicationDistributionDescriptor.js';
import { describePublicationDistributionResult } from '../application/PublicationDistributionResult.js';
import { ArweavePublicationMaterialUploader } from '../application/ArweavePublicationMaterialUploader.js';
import { ArweaveAnnouncementPublisher } from '../application/ArweaveAnnouncementPublisher.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { ArweaveGraphqlDiscoveryQueryService } from '../application/ArweaveGraphqlDiscoveryQueryService.js';
import { ArweaveWorldEncounterMaterialResolver } from '../application/ArweaveWorldEncounterMaterialResolver.js';
import { ArweaveAnchorPublisher } from '../anchoring/ArweaveAnchorPublisher.js';
import { ArweaveTransactionDataProofVerifier } from '../anchoring/ArweaveTransactionDataProofVerifier.js';
import { executePublicationDistribution } from '../application/PublicationDistributionExecutor.js';
import { composePublicationDistributionRuntime } from '../application/PublicationDistributionRuntimeComposition.js';
import { orchestratePublicationDistribution } from '../application/PublicationDistributionOrchestrator.js';

// 0.9.429 — Arweave Announcement/Discovery Integration Boundary Audit.
//
// Test-only, zero production changes. 0.9.428 built the first real
// ANNOUNCEMENT_AND_DISCOVERY provider — a real `ArweaveAnnouncementPublisher`,
// selectable via `PublicationDistributionRuntimeComposition.js`'s own new
// `discoveryProvider` option. That milestone's own test file already proved
// the CLASS is correct in isolation. This audit asks the question one layer
// up: can the actual, existing, unmodified publication-distribution pipeline
// — the real orchestrator, the real command, the real composition root
// `ui/main.js` calls at boot — ever actually select Arweave, and does doing
// so stay correctly isolated from Nostr, Content, and Proof/Anchor?
//
//   Section A. Real end-to-end path — every named collaborator is the
//              literal, unmodified production class, reached directly
//              through PublicationDistributionRuntimeComposition.js.
//   Section B. Provider selection boundary — exactly one publisher, never
//              a fan-out array, even with every option for both substrates
//              supplied simultaneously (the real ui/main.js shape).
//   Section C. Announcement → discovery round trip — the flagship new
//              test: publish via the real ArweaveAnnouncementPublisher,
//              rediscover via the real ArweaveGraphqlDiscoveryQueryService,
//              recover the full envelope via the real
//              ArweaveWorldEncounterMaterialResolver, and land back on the
//              exact publication that was distributed.
//   Section D. Identity separation — two publications sharing one
//              contentHash-equivalent (byte-identical material) stay
//              distinguishable through distinct announcement transactions
//              and remain independently recoverable via discovery.
//   Section E. Content independence — a Content transaction and an
//              Announcement transaction for the SAME publication, over the
//              SAME Arweave substrate, are distinct and only one is ever
//              found by a discovery search.
//   Section F. Proof/Anchor independence — publishing an announcement
//              creates no anchor and invokes no proof verifier, and the
//              converse: creating an anchor invokes no announcement.
//   Section G. Graceful-degradation boundary, through the REAL executor —
//              malformed announcement, ordinary decline, transport/signing
//              failure, and an invalid transaction response each keep
//              0.9.428's own distinctions intact one layer up, and the
//              compatibility `relayUrl` field never acquires Nostr-specific
//              semantics anywhere in the executor or result boundary.
//   Section H. Nostr isolation — interleaved nostr/arweave distribution
//              calls never cross-contaminate each other's configuration or
//              output.
//   Section I. UI reachability — traces the REAL call chain from
//              ui/main.js down through the orchestrator to
//              PublicationDistributionRuntimeComposition.js's own
//              discoveryProvider option, and proves, live, whether a
//              caller of the real production seam can ever actually select
//              Arweave.
//   Section J. relayUrl compatibility reassessment — confirms it remains a
//              documentation/naming concern, never a correctness gap.
//   Section K. The verdict.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - Any production code change. This file is test-only, exactly as its own
//   task requested; every finding below — including the one real gap this
//   audit confirms — is reported, never fixed, here.
// - Multi-substrate selection, Nostr+Arweave fan-out, automatic fallback,
//   provider health/ranking, a generic SubstrateProvider, new discovery
//   semantics, or `kind`/`objectId` reconstruction beyond the bare tagged
//   `uri` bar 0.9.427 already proved live — Section C proves the full
//   round trip is achievable WITHOUT any of these, using only
//   already-existing, unmodified classes.
// - Re-deriving anything tests/ArweaveAnnouncementPublisherImplementation.test.js
//   or tests/ArweaveAnnouncementDiscoveryPublicationContractAudit.test.js
//   already covers at the unit level. Where this file's own scenario looks
//   similar (e.g. a fake Arweave network), it exists only to support a
//   genuinely new, higher-layer assertion.
// - A new discovery reader class, a `node.tags` expansion, or an
//   Announcement/Discovery registry mirroring Proof/Anchor's own
//   `ExternalAnchorPublisherRegistry`. Section I documents the gap
//   precisely enough for a future milestone to close it, and stops there.

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
    try { await fn(); } catch { threw = true; }
    assert(threw, message);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// A window of `length` characters starting at `marker`'s own first
// occurrence in `text`, or `null` if `marker` never appears — used to
// inspect one real call site's own argument list in ui/main.js without
// depending on a full parser, the same "read the real, already-quoted
// production text" technique this whole family already uses for source
// sweeps.
function windowAfter(text, marker, length = 700) {
    const index = text.indexOf(marker);
    if (index === -1) return null;
    return text.slice(index, index + length);
}

// A single shared, deterministic fake Arweave substrate standing in for
// arweave.net across ALL THREE conceptual roles at once — Content
// (ArweavePublicationMaterialUploader), Announcement/Discovery
// (ArweaveAnnouncementPublisher + ArweaveGraphqlDiscoveryQueryService +
// ArweaveWorldEncounterMaterialResolver), and Proof/Anchor
// (ArweaveAnchorPublisher + ArweaveTransactionDataProofVerifier). One
// ledger, one fetchImpl, used by real, unmodified classes from every role
// — exactly what lets this audit ask whether the roles stay independent
// even though the substrate genuinely is shared.
function makeSharedFakeArweaveSubstrate({ graphqlUrl = ArweaveGraphqlDiscoveryQueryService.DEFAULT_GRAPHQL_URL } = {}) {
    const ledger = new Map(); // id -> { data: string, tag: { name, value } | null }
    let nextId = 0;
    function newId(prefix) {
        nextId += 1;
        return `${prefix}${String(nextId).padStart(8, '0')}`;
    }

    // Content-role and Proof/Anchor-role signers both use the SAME
    // `signer.sign(material) -> { id, transaction }` contract this
    // codebase's one real signer (arweave/ArweaveInjectedProviderSigner.js)
    // already implements with `tags: []` hardcoded — mirrored here by
    // carrying `id`/`data` inside the opaque `transaction` payload itself,
    // the identical technique tests/ArweaveProofAnchorIntegrationBoundaryAudit.test.js's
    // own makeFakeArweaveNetwork() already uses, so the fetchImpl's own
    // `/tx` handler below never needs to track "whichever signer ran last."
    // Distinct id prefixes keep the two roles from ever colliding even by
    // coincidence.
    const contentSigner = {
        async sign(material) {
            const id = newId('Content');
            return { id, transaction: { format: 2, id, data: material } };
        }
    };
    const anchorSigner = {
        async sign(material) {
            const id = newId('Anchor');
            return { id, transaction: { format: 2, id, data: material } };
        }
    };

    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        const method = options.method || 'GET';

        if (method === 'POST' && parsed.pathname === '/tx') {
            // ArweavePublicationMaterialUploader / ArweaveAnchorPublisher's
            // own POST — untagged, exactly as the real signer always
            // produces (tags: [] hardcoded).
            const transaction = JSON.parse(options.body);
            ledger.set(transaction.id, { data: transaction.data, tag: null });
            return new Response('accepted', { status: 200 });
        }

        if (method === 'POST' && parsed.pathname === '/graphql') {
            const { query } = JSON.parse(options.body);
            const match = query.match(/name:\s*"([^"]*)"\s*,\s*values:\s*\[\s*"([^"]*)"\s*\]/);
            const edges = [];
            if (match) {
                const [, matchTagName, matchValue] = match;
                for (const [id, entry] of ledger.entries()) {
                    if (entry.tag && entry.tag.name === matchTagName && entry.tag.value === matchValue) {
                        edges.push({ node: { id } });
                    }
                }
            }
            return new Response(JSON.stringify({ data: { transactions: { edges } } }), { status: 200 });
        }

        const getMatch = parsed.pathname.match(/^\/([A-Za-z0-9_-]+)$/);
        if (method === 'GET' && getMatch && ledger.has(getMatch[1])) {
            return new Response(ledger.get(getMatch[1]).data, { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }

    // The one opaque collaborator ArweaveAnnouncementPublisher itself asks
    // for — sign, tag, and broadcast folded into one call, exactly as that
    // class's own header documents. This is the only write path in this
    // whole shared substrate that ever attaches a real Arweave Tag.
    async function uploadTaggedTransaction(material, tag) {
        const id = newId('Announce');
        ledger.set(id, { data: material, tag: { name: tag.name, value: tag.value } });
        return { id };
    }

    return {
        ledger,
        contentSigner,
        anchorSigner,
        fetchImpl,
        uploadTaggedTransaction,
        graphqlUrl
    };
}

async function run() {
    // ===============================================================
    // Section A — real end-to-end path: every collaborator the milestone
    // named is the literal, unmodified production class, chained together
    // exactly as a caller reaching PublicationDistributionRuntimeComposition.js
    // directly with discoveryProvider: 'arweave' would use them.
    // ===============================================================
    {
        const net = makeSharedFakeArweaveSubstrate();
        const publication = { id: 'pub-a-path', signature: 'sig-a' };

        const runtime = composePublicationDistributionRuntime({
            discoveryProvider: 'arweave',
            arweaveUploaderOptions: { signer: net.contentSigner, fetchImpl: net.fetchImpl },
            arweaveAnnouncementPublisherOptions: { discoveryTag: 'campaign-a', uploadTaggedTransaction: net.uploadTaggedTransaction }
        });

        check(runtime.uploader instanceof ArweavePublicationMaterialUploader, 'A1. the composed material uploader is the real, unmodified ArweavePublicationMaterialUploader');
        check(runtime.publisher instanceof ArweaveAnnouncementPublisher, 'A2. the composed discovery publisher is the real, unmodified ArweaveAnnouncementPublisher — never a stand-in');
        check(runtime.describeDistribution === describePublicationDistribution, 'A3. the descriptor is the exact same forwarded pure function, byte-identical reference, never re-implemented');

        const result = await executePublicationDistribution({
            publication,
            serializedMaterial: JSON.stringify({ body: 'end-to-end-a' }),
            materialUploader: runtime.uploader,
            distributionDescriptor: runtime.describeDistribution,
            discoveryPublisher: runtime.publisher
        });

        check(result !== null && result.material !== null && result.discovery !== null, 'A4. the real, unmodified PublicationDistributionExecutor.js produces a complete result through this pipeline');
        check(net.ledger.has(result.discovery.id), 'A5. the announcement id the executor reported names a real transaction that genuinely exists on the shared simulated Arweave substrate');
        check(net.ledger.get(result.discovery.id).tag.value === 'campaign-a', 'A6. ...tagged with exactly this call\'s own discoveryTag, ready for a real discovery query (Section C)');

        console.log('✓ Section A: the pipeline this milestone named — composition, executor, ArweaveAnnouncementPublisher, real Arweave transaction — is fully real and correctly wired, WHEN a caller reaches PublicationDistributionRuntimeComposition.js directly with discoveryProvider: "arweave" (Section I asks whether any real caller in this codebase ever does)');
    }

    // ===============================================================
    // Section B — provider selection boundary: exactly one publisher is
    // ever constructed, never a fan-out, even when every option for BOTH
    // substrates is supplied simultaneously — the realistic shape ui/main.js
    // itself would have if discoveryProvider were ever threaded that far.
    // ===============================================================
    {
        const net = makeSharedFakeArweaveSubstrate();
        const commonOptions = {
            arweaveUploaderOptions: { signer: net.contentSigner, fetchImpl: net.fetchImpl },
            nostrPublisherOptions: { discoveryTag: 'campaign-b-nostr', publishImpl: async () => ({ published: true, id: 'b'.repeat(64) }) },
            arweaveAnnouncementPublisherOptions: { discoveryTag: 'campaign-b-arweave', uploadTaggedTransaction: net.uploadTaggedTransaction }
        };

        const nostrRuntime = composePublicationDistributionRuntime({ ...commonOptions, discoveryProvider: 'nostr' });
        check(nostrRuntime.publisher instanceof NostrPublicationDiscoveryPublisher, 'B1. discoveryProvider: "nostr" — with full Arweave options ALSO present — still constructs exactly a NostrPublicationDiscoveryPublisher');
        check(!(nostrRuntime.publisher instanceof ArweaveAnnouncementPublisher), 'B2. ...and never an ArweaveAnnouncementPublisher, even though it could have been built from the same call\'s own arguments');

        const arweaveRuntime = composePublicationDistributionRuntime({ ...commonOptions, discoveryProvider: 'arweave' });
        check(arweaveRuntime.publisher instanceof ArweaveAnnouncementPublisher, 'B3. discoveryProvider: "arweave" — with full Nostr options ALSO present — constructs exactly an ArweaveAnnouncementPublisher');
        check(!(arweaveRuntime.publisher instanceof NostrPublicationDiscoveryPublisher), 'B4. ...and never a NostrPublicationDiscoveryPublisher, confirming "arweave" selects, it never means "arweave AND nostr"');

        check(!Array.isArray(arweaveRuntime.publisher) && !Array.isArray(nostrRuntime.publisher), 'B5. runtime.publisher is a single collaborator in both cases, never an array of substrates');
        const keys = Object.keys(arweaveRuntime).sort();
        check(keys.length === 3 && keys.join(',') === 'describeDistribution,publisher,uploader', 'B6. the composed runtime carries exactly one publisher slot — no runtime.publishers array, no second discovery collaborator, even with options for both substrates supplied at once');

        console.log('✓ Section B: "arweave" and "nostr" remain mutually exclusive selections, never a combined fan-out, confirmed with every option for both substrates supplied to the same call');
    }

    // ===============================================================
    // Section C — announcement → discovery round trip. The flagship new
    // test: publish via the real ArweaveAnnouncementPublisher, rediscover
    // via the real ArweaveGraphqlDiscoveryQueryService, recover the full
    // envelope via the real ArweaveWorldEncounterMaterialResolver (a
    // CONTENT-retrieval class, never modified, never made aware discovery
    // exists), and land back on the exact publication distributed —
    // proving Arweave functions as a genuine discovery substrate, not
    // merely a place that can store an announcement.
    // ===============================================================
    {
        const net = makeSharedFakeArweaveSubstrate();
        const campaign = 'campaign-c-roundtrip';
        const publication = { id: 'pub-c-roundtrip', signature: 'sig-c' };

        const materialUploader = new ArweavePublicationMaterialUploader({ signer: net.contentSigner, fetchImpl: net.fetchImpl });
        const announcementPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: campaign, uploadTaggedTransaction: net.uploadTaggedTransaction });

        const result = await executePublicationDistribution({
            publication,
            serializedMaterial: JSON.stringify({ body: 'round-trip-material' }),
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher: announcementPublisher
        });
        check(result.material !== null && result.discovery !== null, 'C1. the real executor produced both a content fact and an announcement fact');

        // The real reader — never modified, never a stand-in — querying the
        // SAME shared substrate a completely independent caller would have
        // to use.
        const discoveryQueryService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const candidates = await discoveryQueryService.search(campaign);
        check(candidates.length === 1, 'C2. the real ArweaveGraphqlDiscoveryQueryService finds exactly one candidate for this campaign\'s own discoveryTag');
        check(candidates[0].uri === `ar://${result.discovery.id}`, 'C3. ...naming exactly the announcement transaction id the executor itself reported — the discovery observation and the publish outcome are the same transaction');

        // The candidate names only a LOCATION so far (0.9.427's own live
        // finding). Recovering the full envelope means fetching that
        // location's own data — a capability that already exists,
        // unmodified, one file over, built for CONTENT retrieval and never
        // imported by, or aware of, the discovery/announcement pipeline.
        const materialResolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: net.fetchImpl });
        const retrievedCandidate = await materialResolver.retrieveByUri(candidates[0].uri);
        check(retrievedCandidate !== null, 'C4. ArweaveWorldEncounterMaterialResolver retrieves the announcement transaction\'s own data just as readily as it would retrieve Publication material — Arweave data GET has no notion of role');

        const recoveredEnvelope = describeDecentralizedDiscoveryEnvelope(retrievedCandidate);
        check(recoveredEnvelope !== null, 'C5. the retrieved bytes parse as a well-formed discovery envelope via the real, unmodified core/DecentralizedDiscoveryEnvelope.js');
        check(recoveredEnvelope.objectId === publication.id, 'C6. ...naming exactly the publication that was actually distributed');
        check(recoveredEnvelope.uri === result.material.uri, 'C7. ...and naming exactly the CONTENT transaction\'s own uri the SAME executor call produced — the discovery observation leads all the way back to the correct publication representation');

        check(!/node\.tags|tags:\s*\{/.test(await source('application/ArweaveGraphqlDiscoveryQueryService.js')), 'C8. this full round trip required zero node.tags query expansion — the existing bare-id query plus the existing, separately-built material resolver already suffice, exactly the restraint 0.9.427/0.9.428 both left deliberately unbuilt');

        console.log('✓ Section C: Arweave functions as a genuine discovery substrate — search finds the real announcement, and the real (unmodified, discovery-unaware) material resolver completes the round trip back to the distributed publication, using only already-existing production classes');
    }

    // ===============================================================
    // Section D — identity separation: two publications sharing
    // byte-identical material (the adversarial "same contentHash" case)
    // stay distinguishable through distinct Arweave identities, and remain
    // independently recoverable via discovery even under a shared campaign.
    // ===============================================================
    {
        const net = makeSharedFakeArweaveSubstrate();
        const campaign = 'campaign-d-identity';
        const identicalMaterial = JSON.stringify({ body: 'identical-content-adversarial-case' });

        const materialUploader = new ArweavePublicationMaterialUploader({ signer: net.contentSigner, fetchImpl: net.fetchImpl });
        const announcementPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: campaign, uploadTaggedTransaction: net.uploadTaggedTransaction });

        const publicationA = { id: 'pub-d-A', signature: 'sig-d-A' };
        const publicationB = { id: 'pub-d-B', signature: 'sig-d-B' };

        const resultA = await executePublicationDistribution({ publication: publicationA, serializedMaterial: identicalMaterial, materialUploader, distributionDescriptor: describePublicationDistribution, discoveryPublisher: announcementPublisher });
        const resultB = await executePublicationDistribution({ publication: publicationB, serializedMaterial: identicalMaterial, materialUploader, distributionDescriptor: describePublicationDistribution, discoveryPublisher: announcementPublisher });

        check(resultA.material.uri !== resultB.material.uri, 'D1. two publications sharing byte-identical material still get two distinct Arweave CONTENT transaction ids — Arweave ids are never content-addressed here, unlike an IPFS CID');
        check(resultA.discovery.id !== resultB.discovery.id, 'D2. ...and two distinct ANNOUNCEMENT transaction ids too, even announced under the identical campaign discoveryTag');

        const identifiers = [publicationA.id, publicationB.id, resultA.material.uri, resultB.material.uri, resultA.discovery.id, resultB.discovery.id];
        check(new Set(identifiers).size === identifiers.length, 'D3. all six identifiers (2 publicationIds, 2 material uris, 2 announcement ids) are pairwise unique — no accidental collision, even in this deliberately adversarial identical-content, identical-campaign case');

        const discoveryQueryService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const materialResolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: net.fetchImpl });
        const candidates = await discoveryQueryService.search(campaign);
        check(candidates.length === 2, 'D4. the shared campaign discoveryTag now matches both announcements');

        const recoveredObjectIds = new Set();
        for (const candidate of candidates) {
            const envelope = describeDecentralizedDiscoveryEnvelope(await materialResolver.retrieveByUri(candidate.uri));
            recoveredObjectIds.add(envelope.objectId);
        }
        check(recoveredObjectIds.has('pub-d-A') && recoveredObjectIds.has('pub-d-B') && recoveredObjectIds.size === 2, 'D5. both publications remain independently recoverable from the shared discovery tag — identical content and a shared campaign never merge their identities');

        console.log('✓ Section D: publicationId, material uri, and announcement transaction id stay pairwise distinct for two publications sharing one materialUri-equivalent content, even under one shared campaign tag');
    }

    // ===============================================================
    // Section E — content independence: a Content transaction and an
    // Announcement transaction for the SAME publication, over the SAME
    // Arweave substrate, are distinct transactions, and only the
    // announcement is ever found by a discovery search.
    // ===============================================================
    {
        const net = makeSharedFakeArweaveSubstrate();
        const campaign = 'campaign-e-content-independence';
        const publication = { id: 'pub-e-content', signature: 'sig-e' };

        const materialUploader = new ArweavePublicationMaterialUploader({ signer: net.contentSigner, fetchImpl: net.fetchImpl });
        const announcementPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: campaign, uploadTaggedTransaction: net.uploadTaggedTransaction });

        const result = await executePublicationDistribution({
            publication,
            serializedMaterial: JSON.stringify({ body: 'content-vs-announcement' }),
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher: announcementPublisher
        });

        const contentTxId = result.material.uri.replace('ar://', '');
        const announcementTxId = result.discovery.id;
        check(contentTxId !== announcementTxId, 'E1. the CONTENT transaction and the ANNOUNCEMENT transaction, both produced for the SAME publication via the SAME Arweave substrate, are two distinct transactions');
        check(net.ledger.get(contentTxId).tag === null, 'E2. the content transaction was never tagged — ArweavePublicationMaterialUploader\'s own signer contract has no room for one (see arweave/ArweaveInjectedProviderSigner.js\'s own hardcoded tags: [])');
        check(net.ledger.get(announcementTxId).tag !== null && net.ledger.get(announcementTxId).tag.value === campaign, 'E3. only the announcement transaction carries the discovery tag');

        const discoveryQueryService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const candidates = await discoveryQueryService.search(campaign);
        check(candidates.length === 1 && candidates[0].uri === `ar://${announcementTxId}`, 'E4. searching by the discovery tag finds ONLY the announcement transaction — the content transaction, holding the exact same publication\'s material, is invisible to a discovery search');

        console.log('✓ Section E: CONTENT and ANNOUNCEMENT stay two distinct Arweave transactions for the same publication, and only the announcement is ever discoverable by tag — the substrate is shared, the application facts are not');
    }

    // ===============================================================
    // Section F — Proof/Anchor independence: publishing an announcement
    // creates no anchor and invokes no proof verifier, and the converse:
    // creating a real anchor invokes no announcement publisher.
    // ===============================================================
    {
        const net = makeSharedFakeArweaveSubstrate();
        const campaign = 'campaign-f-proof-independence';
        const publication = { id: 'pub-f-proof', signature: 'sig-f' };

        let anchorSignCalls = 0;
        const countingAnchorSigner = { async sign(material) { anchorSignCalls += 1; return net.anchorSigner.sign(material); } };
        const anchorPublisher = new ArweaveAnchorPublisher({ signer: countingAnchorSigner, fetchImpl: net.fetchImpl });
        const proofVerifier = new ArweaveTransactionDataProofVerifier({ fetchImpl: net.fetchImpl });
        let verifyCalls = 0;
        const originalVerify = proofVerifier.verify.bind(proofVerifier);
        proofVerifier.verify = async (...args) => { verifyCalls += 1; return originalVerify(...args); };

        const materialUploader = new ArweavePublicationMaterialUploader({ signer: net.contentSigner, fetchImpl: net.fetchImpl });
        const announcementPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: campaign, uploadTaggedTransaction: net.uploadTaggedTransaction });

        await executePublicationDistribution({
            publication,
            serializedMaterial: JSON.stringify({ body: 'proof-independence' }),
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher: announcementPublisher
        });

        check(anchorSignCalls === 0, 'F1. publishing an Arweave announcement never invokes the anchor publisher\'s signer — no anchor was created as a side effect, confirmed live, with a real ArweaveAnchorPublisher instance sitting unused right beside the call');
        check(verifyCalls === 0, 'F2. ...and never invokes the proof verifier either, confirmed live with a real ArweaveTransactionDataProofVerifier instance sitting unused right beside the call');

        const announcementSource = await source('application/ArweaveAnnouncementPublisher.js');
        const codeOnly = announcementSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        check(!/ArweaveAnchorPublisher|ArweaveTransactionDataProofVerifier|PublicationAnchor/.test(codeOnly), 'F3. ArweaveAnnouncementPublisher.js imports and references nothing from the Proof/Anchor role — confirmed by source sweep, not merely by this section\'s live spies');

        // The converse: creating a real anchor never invokes an
        // announcement — the anchor publisher's own publish() signature
        // takes only a contentHash; it has no discoveryPublisher parameter
        // to even smuggle one through.
        let announceCalls = 0;
        const announcementSpy = { discoveryTag: campaign, async publish() { announceCalls += 1; return null; } };
        void announcementSpy; // never wired anywhere — its own existence, unreferenced, is the point
        const anchorOnlyPublisher = new ArweaveAnchorPublisher({ signer: net.anchorSigner, fetchImpl: net.fetchImpl });
        const anchorResult = await anchorOnlyPublisher.publish('some-content-hash-f');
        check(anchorResult.published === true, 'F4. sanity: the anchor publish itself succeeded');
        check(announceCalls === 0, 'F5. creating a real Arweave anchor never invoked the announcement spy sitting unused beside it — ArweaveAnchorPublisher#publish(contentHash) has no discoveryPublisher parameter of any kind for one to be wired into');

        console.log('✓ Section F: Announcement/Discovery and Proof/Anchor stay fully independent in both directions — confirmed live (spies observed zero cross-calls) and by source sweep (no cross-role import)');
    }

    // ===============================================================
    // Section G — graceful-degradation boundary, through the REAL
    // executor: malformed announcement, ordinary decline,
    // transport/signing failure, and an invalid transaction response each
    // keep 0.9.428's own publisher-level distinctions intact one layer up,
    // through PublicationDistributionExecutor.js and
    // PublicationDistributionResult.js — and the compatibility relayUrl
    // field never acquires Nostr-specific semantics anywhere in either.
    // ===============================================================
    {
        const net = makeSharedFakeArweaveSubstrate();
        const materialUploader = new ArweavePublicationMaterialUploader({ signer: net.contentSigner, fetchImpl: net.fetchImpl });

        // G1 — malformed announcement: an unsigned publication. Material
        // still uploads (0.9.44's own descriptor only fails AFTER a
        // materialUri already exists), but the announcement publisher is
        // never reached at all.
        const unsignedPublication = { id: 'pub-g-unsigned' };
        const guardedPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-g1', uploadTaggedTransaction: net.uploadTaggedTransaction });
        const malformedResult = await executePublicationDistribution({
            publication: unsignedPublication,
            serializedMaterial: JSON.stringify({ body: 'g-malformed' }),
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher: guardedPublisher
        });
        check(malformedResult.material !== null && malformedResult.discovery === null, 'G1. an unsigned publication still gets its content uploaded, but the real executor never calls the Arweave announcement publisher at all — discovery stays null, never a fabricated announcement');

        // G2 — ordinary decline: uploadTaggedTransaction resolves null
        // (e.g. no wallet connected).
        const decliningPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-g2', uploadTaggedTransaction: async () => null });
        const declinedResult = await executePublicationDistribution({
            publication: { id: 'pub-g2', signature: 'sig-g2' },
            serializedMaterial: JSON.stringify({ body: 'g2' }),
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher: decliningPublisher
        });
        check(declinedResult !== null && declinedResult.material !== null && declinedResult.discovery === null, 'G2. an ordinary Arweave decline reaches all the way through the real executor as material: present, discovery: null — never a crash, never conflated with a malformed announcement');

        // G3 — transport/signing failure propagates through the real
        // executor, never swallowed into a null-discovery result.
        const throwingPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-g3', uploadTaggedTransaction: async () => { throw new Error('gateway unreachable'); } });
        await expectThrowsAsync(() => executePublicationDistribution({
            publication: { id: 'pub-g3', signature: 'sig-g3' },
            serializedMaterial: JSON.stringify({ body: 'g3' }),
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher: throwingPublisher
        }), 'G3. a genuine Arweave transport/signing failure propagates as a rejection all the way out of the real executor — never caught, never collapsed into a result with discovery: null');

        // G4 — invalid transaction response: resolves truthy but with a
        // malformed id — a contract violation, so it throws rather than
        // masquerading as a published announcement inside a real result.
        const malformedIdPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-g4', uploadTaggedTransaction: async () => ({ id: '' }) });
        await expectThrowsAsync(() => executePublicationDistribution({
            publication: { id: 'pub-g4', signature: 'sig-g4' },
            serializedMaterial: JSON.stringify({ body: 'g4' }),
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher: malformedIdPublisher
        }), 'G4. an invalid transaction response throws through the real executor too, never silently becoming a fabricated PublicationDistributionResult');

        // relayUrl: opaque cargo, never interpreted, confirmed both live
        // and by source sweep.
        const healthyPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-g5', gatewayUrl: 'https://my-arweave-gateway.example', uploadTaggedTransaction: net.uploadTaggedTransaction });
        const healthyResult = await executePublicationDistribution({
            publication: { id: 'pub-g5', signature: 'sig-g5' },
            serializedMaterial: JSON.stringify({ body: 'g5' }),
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher: healthyPublisher
        });
        check(healthyResult.discovery.relayUrl === 'https://my-arweave-gateway.example', 'G5. the compatibility relayUrl field carries this Arweave announcement\'s own gatewayUrl straight through the real executor and result boundary');
        check(!healthyResult.discovery.relayUrl.startsWith('wss://'), 'G6. ...and is never coerced toward a Nostr-shaped wss:// value — the field is opaque cargo, not interpreted');

        // Strip full-line `//` header/doc comments before sweeping — both
        // files' own extensive headers legitimately DISCUSS Nostr and
        // relayUrl in prose (that discussion is the whole reason Section J
        // exists); what this check actually needs to confirm is that
        // neither file's CODE branches on relayUrl's own scheme.
        const codeOnly = (text) => text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const executorCode = codeOnly(await source('application/PublicationDistributionExecutor.js'));
        const resultCode = codeOnly(await source('application/PublicationDistributionResult.js'));
        check(!/wss:|relay\.damus|NostrPublicationDiscoveryPublisher/i.test(executorCode), 'G7. PublicationDistributionExecutor.js\'s own CODE (header comments excluded) performs no Nostr-specific parsing, validation, or scheme-check of relayUrl anywhere — confirmed by source sweep, not just this section\'s one live gatewayUrl value');
        check(!/wss:|relay\.damus|NostrPublicationDiscoveryPublisher/i.test(resultCode), 'G8. neither does PublicationDistributionResult.js\'s own CODE — both treat relayUrl as an opaque, substrate-neutral string');

        console.log('✓ Section G: malformed input, ordinary decline, transport/signing failure, and an invalid transaction response each keep their distinct, defined behavior through the REAL executor and result boundary, and relayUrl never acquires Nostr-specific semantics anywhere in either');
    }

    // ===============================================================
    // Section H — Nostr isolation: interleaved nostr/arweave distribution
    // calls never cross-contaminate each other's configuration or output.
    // ===============================================================
    {
        const net = makeSharedFakeArweaveSubstrate();
        const nostrOptions = Object.freeze({ discoveryTag: 'campaign-h-nostr', publishImpl: async () => ({ published: true, id: 'a'.repeat(64) }) });
        const arweaveAnnouncementOptions = Object.freeze({ discoveryTag: 'campaign-h-arweave', uploadTaggedTransaction: net.uploadTaggedTransaction });
        const arweaveUploaderOptions = Object.freeze({ signer: net.contentSigner, fetchImpl: net.fetchImpl });

        async function distributeVia(discoveryProvider, publicationId) {
            const runtime = composePublicationDistributionRuntime({
                discoveryProvider,
                arweaveUploaderOptions,
                nostrPublisherOptions: nostrOptions,
                arweaveAnnouncementPublisherOptions: arweaveAnnouncementOptions
            });
            return executePublicationDistribution({
                publication: { id: publicationId, signature: 'sig' },
                serializedMaterial: JSON.stringify({ body: publicationId }),
                materialUploader: runtime.uploader,
                distributionDescriptor: runtime.describeDistribution,
                discoveryPublisher: runtime.publisher
            });
        }

        const r1 = await distributeVia('nostr', 'pub-h1');
        const r2 = await distributeVia('arweave', 'pub-h2');
        const r3 = await distributeVia('nostr', 'pub-h3');
        const r4 = await distributeVia('arweave', 'pub-h4');

        check(r1.discovery.relayUrl === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL, 'H1. the first nostr call gets the nostr relay');
        check(r2.discovery.relayUrl === ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL, 'H2. the interleaved arweave call gets the arweave gateway, unaffected by the immediately-preceding nostr call');
        check(r3.discovery.relayUrl === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL, 'H3. a SECOND nostr call, after an arweave call ran in between, still gets the nostr relay — selecting arweave once never mutated the shared nostrPublisherOptions for a later call');
        check(r4.discovery.relayUrl === ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL, 'H4. and a second arweave call remains unaffected too');
        check(Object.isFrozen(nostrOptions) && Object.isFrozen(arweaveAnnouncementOptions), 'H5. sanity: both shared options objects were frozen before any of the four interleaved calls ran — if either composition step had ever tried to mutate one, this test would already have thrown');

        const discoveryTags = new Set([r1.discovery.discoveryTag, r2.discovery.discoveryTag, r3.discovery.discoveryTag, r4.discovery.discoveryTag]);
        check(discoveryTags.has('campaign-h-nostr') && discoveryTags.has('campaign-h-arweave') && discoveryTags.size === 2, 'H6. each substrate\'s own discoveryTag stayed exactly what it was configured with across all four interleaved calls');

        console.log('✓ Section H: interleaving nostr and arweave distribution calls produces no cross-contamination of configuration or output in either direction');
    }

    // ===============================================================
    // Section I — UI reachability: traces the REAL call chain from
    // ui/main.js down through the orchestrator to
    // PublicationDistributionRuntimeComposition.js's own discoveryProvider
    // option, and proves, live, whether a caller of the real production
    // seam can ever actually select Arweave.
    // ===============================================================
    {
        // Live proof, first: a caller of the REAL, production
        // orchestrator — application/PublicationDistributionOrchestrator.js,
        // the one file application/PublicationDistributionCommand.js (and,
        // through it, ui/main.js's own composed command) actually calls —
        // asks for Arweave explicitly, supplying everything
        // composePublicationDistributionRuntime() itself would need.
        const net = makeSharedFakeArweaveSubstrate();
        let publishAttemptedOn = null;

        const result = await orchestratePublicationDistribution({
            publication: { id: 'pub-i-real-orchestrator', signature: 'sig-i' },
            serializedMaterial: JSON.stringify({ body: 'i-real-orchestrator' }),
            arweaveUploaderOptions: { signer: net.contentSigner, fetchImpl: net.fetchImpl },
            nostrPublisherOptions: {
                discoveryTag: 'campaign-i-nostr',
                publishImpl: async () => { publishAttemptedOn = 'nostr'; return { published: true, id: 'a'.repeat(64) }; }
            },
            // A caller's own best-effort attempt to select Arweave —
            // exactly the two fields
            // PublicationDistributionRuntimeComposition.js#composePublicationDistributionRuntime()
            // itself accepts for exactly this purpose.
            discoveryProvider: 'arweave',
            arweaveAnnouncementPublisherOptions: {
                discoveryTag: 'campaign-i-arweave',
                uploadTaggedTransaction: async (material, tag) => { publishAttemptedOn = 'arweave'; return net.uploadTaggedTransaction(material, tag); }
            }
        });

        // AMENDED BY 0.9.430 — Announcement/Discovery Provider Selection
        // Reachability. This is the exact gap 0.9.430 closed:
        // orchestratePublicationDistribution() now forwards discoveryProvider
        // and arweaveAnnouncementPublisherOptions verbatim to
        // composePublicationDistributionRuntime() — the SAME call this
        // section already makes, above, now genuinely reaches Arweave.
        check(publishAttemptedOn === 'arweave', 'I1. discoveryProvider: "arweave" passed to the real, production orchestratePublicationDistribution() now genuinely reaches Arweave — this function\'s own parameter list forwards both discoveryProvider and arweaveAnnouncementPublisherOptions to composePublicationDistributionRuntime() (0.9.430), closing the gap this section originally found');
        check(result.discovery.relayUrl === ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL, 'I2. ...confirmed structurally too: the resulting discovery.relayUrl is this call\'s own intended Arweave gateway, never Nostr\'s default wss:// relay');

        // Source sweep: confirm the SAME closed gap holds through every
        // real layer between the orchestrator and ui/main.js itself — not
        // just the one orchestrator entry point this section already
        // exercised live. The three files this milestone actually
        // extended (Orchestrator, Command, CommandComposition) now DO
        // reference both terms verbatim, as thin forwarding boundaries
        // never interpreting either — see each file's own "AMENDED BY
        // 0.9.430" header section.
        const threadedChainFiles = [
            'application/PublicationDistributionOrchestrator.js',
            'application/PublicationDistributionCommand.js',
            'application/PublicationDistributionCommandComposition.js'
        ];
        for (const file of threadedChainFiles) {
            const code = await source(file);
            check(/discoveryProvider/.test(code) && /arweaveAnnouncementPublisherOptions/.test(code), `I3[${file}]. this file now forwards both discoveryProvider and arweaveAnnouncementPublisherOptions verbatim (0.9.430) — the exact seam this section originally found missing`);
        }

        // `PublicationDistributionRuntimeConfiguration.js` gained
        // `arweaveAnnouncementPublisherOptions` resolution (a THIRD,
        // independent section, mirroring `arweaveUploaderOptions`/
        // `nostrPublisherOptions`) but has no `discoveryProvider` concept
        // of its own — provider SELECTION stays entirely the orchestrator's
        // own concern, per `PublicationDistributionRuntimeComposition.js`'s
        // own header, "discoveryProvider itself is the one new option."
        const runtimeConfigurationCode = await source('application/PublicationDistributionRuntimeConfiguration.js');
        check(/arweaveAnnouncementPublisherOptions/.test(runtimeConfigurationCode) && !/discoveryProvider/.test(runtimeConfigurationCode),
            'I3b. PublicationDistributionRuntimeConfiguration.js now resolves arweaveAnnouncementPublisherOptions (0.9.430) but still carries no discoveryProvider concept of its own — selection stays the orchestrator\'s own job');

        // `PublicationDistributionConfigurationProvider.js`,
        // `PublicationDistributionRuntimeProvider.js`, and
        // `ArweavePublicationDistributionRuntimeAdapter.js` never needed
        // the exact COMPOUND identifier `arweaveAnnouncementPublisherOptions`
        // (or `discoveryProvider`) themselves — the first resolves it under
        // its own function name (`resolveArweaveAnnouncementPublisherOptions()`),
        // the second regroups it under its own section name
        // (`arweaveAnnouncement`), and the third was never touched at all
        // (0.9.430 built no Arweave-announcement host-capability adapter —
        // see this file's own header, "Deliberately excluded").
        const untouchedChainFiles = [
            'application/PublicationDistributionConfigurationProvider.js',
            'application/PublicationDistributionRuntimeProvider.js',
            'application/ArweavePublicationDistributionRuntimeAdapter.js'
        ];
        for (const file of untouchedChainFiles) {
            const code = await source(file);
            check(!/discoveryProvider|arweaveAnnouncementPublisherOptions/.test(code), `I3c[${file}]. no reference to the exact compound identifiers discoveryProvider/arweaveAnnouncementPublisherOptions — this file's own, more specific vocabulary (resolveArweaveAnnouncementPublisherOptions()'s own name, or the arweaveAnnouncement section key) carries the 0.9.430 capability instead`);
        }

        // ui/main.js itself: `discoveryProvider` DOES appear in this file,
        // but for an entirely unrelated peer/spatial-discovery concept
        // (`new LocalDiscoveryProvider(...)`, etc.) — a coincidentally
        // shared field name in a different subsystem. The precise claim
        // this section makes is narrower and checked directly against the
        // three real call sites that matter.
        const uiMainSource = await source('ui/main.js');
        const providerCallWindow = windowAfter(uiMainSource, 'createPublicationDistributionRuntimeProvider(');
        const configCallWindow = windowAfter(uiMainSource, 'resolvePublicationDistributionRuntimeConfiguration(');
        const commandCallWindow = windowAfter(uiMainSource, 'composePublicationDistributionCommand(');

        check(providerCallWindow !== null, 'I4. ui/main.js still calls createPublicationDistributionRuntimeProvider() — the real composition-root seam');
        check(!/discoveryProvider|arweaveAnnouncementPublisherOptions/.test(providerCallWindow), 'I5. ...and that real call site supplies neither discoveryProvider nor arweaveAnnouncementPublisherOptions');
        check(configCallWindow !== null && !/discoveryProvider|arweaveAnnouncementPublisherOptions/.test(configCallWindow), 'I6. neither does the real resolvePublicationDistributionRuntimeConfiguration() call site');
        check(commandCallWindow !== null && !/discoveryProvider|arweaveAnnouncementPublisherOptions/.test(commandCallWindow), 'I7. neither does the real composePublicationDistributionCommand() call site — the one object ui/views/WorldView.js\'s own distributeWorldEncounterPublication() and ui/components/OwnPublicationPanel.js\'s own distributeOwnPublication() both ultimately call');

        // Contrast: Proof/Anchor's own equivalent IS UI-reachable today,
        // through a real registry a real coordinator exposes to a real
        // v-for. Announcement/Discovery has no equivalent of either.
        const registrySweepTargets = [
            'application/PublicationDistributionCommandComposition.js',
            'application/PublicationDistributionRuntimeConfiguration.js'
        ];
        for (const file of registrySweepTargets) {
            const code = await source(file);
            check(!/availableDiscoveryTypes|DiscoveryProviderRegistry|AnnouncementPublisherRegistry/.test(code), `I8[${file}]. no availableDiscoveryTypes()-style hook or discovery-provider registry exists anywhere near this seam — unlike application/PublicationAnchorCreationCoordinator.js's own availableAnchorTypes(), rendered by a real v-for in ui/views/DecentralizedPublicationsView.js, Announcement/Discovery has no equivalent UI-facing enumeration mechanism at all`);
        }

        // AMENDED BY 0.9.430 — Announcement/Discovery Provider Selection
        // Reachability. UI_SELECTION_MECHANISM_GAP is now CLOSED: this
        // section's own live call (above) and source sweep both confirm
        // discoveryProvider: "arweave" genuinely reaches Arweave through
        // the real production call chain — see each threaded file's own
        // "AMENDED BY 0.9.430" header, and `ui/components/WorldEncounterCanvas.js`'s
        // own new Announcement/Discovery substrate control for the one
        // remaining hop (a real caller choosing "arweave") this section
        // does not itself exercise (that is `tests/AnnouncementDiscoveryProviderSelectionReachability.test.js`'s
        // own job).
        console.log('✓ Section I: UI_SELECTION_MECHANISM_GAP — CLOSED BY 0.9.430. discoveryProvider: "arweave" is real, tested, and now genuinely reachable through the real production call chain from ui/main.js down through the orchestrator; confirmed both live (the orchestrator now forwards the field) and by source sweep of every intermediate layer');
    }

    // ===============================================================
    // Section J — relayUrl compatibility reassessment: a documentation/
    // naming concern, never a correctness gap, now that two
    // implementations share the field.
    // ===============================================================
    {
        const arbitraryResult = describePublicationDistributionResult({
            publication: { id: 'pub-j' },
            material: { uri: 'ar://something', storage: 'ar' },
            discovery: { relayUrl: 'not-a-url-at-all-just-an-opaque-label', discoveryTag: 'tag', id: 'id123' }
        });
        check(arbitraryResult !== null && arbitraryResult.discovery.relayUrl === 'not-a-url-at-all-just-an-opaque-label', 'J1. PublicationDistributionResult.js validates relayUrl only as a non-empty string — no URL parsing, no wss:// vs https:// scheme requirement, no Nostr-specific shape check of any kind; renaming it later (e.g. to announcementOrigin) would be a pure rename, never a validation-logic change');

        const publisherHeaderSource = await source('application/ArweaveAnnouncementPublisher.js');
        check(/A NOSTR WIRE TERM, KNOWINGLY REUSED/.test(publisherHeaderSource), 'J2. ArweaveAnnouncementPublisher.js already documents this exact compromise, explicitly, in its own header — this audit reaffirms an already-acknowledged decision rather than discovering a new one');

        console.log('✓ Section J: relayUrl remains a Nostr-coined but, in practice, substrate-neutral field — both real consumers (the executor, the result boundary; see Section G) treat it as opaque cargo, so it is a naming/documentation concern, never a correctness gap; renaming it is real, separate, unscheduled future work, not something this audit escalates');
    }

    // ===============================================================
    // Section K — the verdict.
    // ===============================================================
    {
        // AMENDED BY 0.9.430 — Announcement/Discovery Provider Selection
        // Reachability. `uiReachability` now reads `RESOLVED`, never
        // `UI_SELECTION_MECHANISM_GAP` — see Section I, above, and
        // `tests/AnnouncementDiscoveryProviderSelectionReachability.test.js`
        // (0.9.430) for the flagship test proving a real caller (the
        // Wanderer, through `ui/components/WorldEncounterCanvas.js`'s own
        // new substrate control) can now genuinely select Arweave.
        const VERDICT = Object.freeze({
            realEndToEndPath: 'PASS',
            providerSelectionBoundary: 'PASS',
            discoveryRoundTrip: 'PASS',
            identitySeparation: 'PASS',
            contentIndependence: 'PASS',
            proofAnchorIndependence: 'PASS',
            gracefulDegradation: 'PASS',
            nostrIsolation: 'PASS',
            uiReachability: 'RESOLVED',
            relayUrlCompatibility: 'NOT_A_CORRECTNESS_GAP'
        });

        check(VERDICT.discoveryRoundTrip === 'PASS' && VERDICT.realEndToEndPath === 'PASS', 'K1. every boundary at or below PublicationDistributionRuntimeComposition.js — construction, execution, discovery, cross-role isolation, degradation, relayUrl compatibility — is complete and correct');
        check(VERDICT.uiReachability === 'RESOLVED', 'K2. the one boundary this audit originally found incomplete — reachability from a real caller — is now resolved by 0.9.430, never merely correctness of what would run if reached');
        check(assertionCount > 40, 'K3. sanity: this audit is substantive, not a token pass');

        console.log('\nVerdict: ARWEAVE_DISCOVERY_PATH_COMPLETE_AND_REACHABLE (originally ARWEAVE_DISCOVERY_PATH_COMPLETE_UI_GAP; closed by 0.9.430)');
        for (const [key, value] of Object.entries(VERDICT)) {
            console.log(`  ${key.padEnd(26)} ${value}`);
        }
        console.log(`\n(${assertionCount} checks)`);
        console.log('\nThe precise seam this audit originally named (below) was built exactly as named, by 0.9.430 — Announcement/Discovery Provider Selection Reachability:');
        console.log('  application/PublicationDistributionOrchestrator.js        — forwards discoveryProvider + arweaveAnnouncementPublisherOptions to composePublicationDistributionRuntime()');
        console.log('  application/PublicationDistributionCommand.js             — forwards both through to the orchestrator call');
        console.log('  application/PublicationDistributionCommandComposition.js  — binds arweaveAnnouncementPublisherOptions alongside lifecycleStore; discoveryProvider passes through the caller\'s own request, unbound');
        console.log('  application/PublicationDistributionConfigurationProvider.js — resolveArweaveAnnouncementPublisherOptions(), mirroring resolveNostrPublisherOptions()');
        console.log('  application/PublicationDistributionRuntimeConfiguration.js  — threads an announcement-options section through');
        console.log('  application/PublicationDistributionRuntimeProvider.js      — regroups uploadTaggedTransaction into that same section');
        console.log('  ui/main.js                                                 — resolves arweaveAnnouncementPublisherOptions at the composition root, still via the existing runtime-provider/configuration seam, never a direct 0.9.105 import');
        console.log('  ui/views/WorldView.js                                      — forwards a caller-supplied discoveryProvider through distributeWorldEncounterPublication()');
        console.log('  ui/components/WorldEncounterCanvas.js                      — the actual UI choice: an Announcement/Discovery substrate <select>, Nostr/Arweave, exactly one selection, never fan-out');
        console.log('\nSee tests/AnnouncementDiscoveryProviderSelectionReachability.test.js for the milestone\'s own flagship coverage of this now-closed seam.');
    }

    console.log('\nAll ArweaveAnnouncementDiscoveryIntegrationBoundaryAudit tests passed.');
}

run().catch((error) => {
    console.error('ArweaveAnnouncementDiscoveryIntegrationBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
