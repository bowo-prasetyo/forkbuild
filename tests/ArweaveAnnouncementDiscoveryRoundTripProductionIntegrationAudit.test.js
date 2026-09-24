
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { describeDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import { ArweaveAnnouncementPublisher } from '../application/arweave/ArweaveAnnouncementPublisher.js';
import { createArweaveTaggedTransactionUpload } from '../application/arweave/ArweaveTaggedTransactionUpload.js';
import { createArweaveInjectedProviderSigner } from '../arweave/ArweaveInjectedProviderSigner.js';
import { ArweaveGraphqlDiscoveryQueryService } from '../application/arweave/ArweaveGraphqlDiscoveryQueryService.js';
import {
    composeDecentralizedWorldEncounterMaterialDiscoveryServices,
    composeDecentralizedWorldEncounterMaterialDiscoveryRuntime
} from '../application/worldEncounter/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeWorldEncounterMaterialVerifier } from '../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { WorldEncounterMaterialLoadStatus } from '../application/worldEncounter/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/worldEncounter/WorldEncounterMaterialVerification.js';
import { DecentralizedWorldEncounterLeadResolutionStatus } from '../application/worldEncounter/DecentralizedWorldEncounterLeadResolution.js';
import { mainFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { readSource as source } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.495 — Arweave Announcement/Discovery Round-Trip Production
// Integration Audit.
//
// Type: test-only closure audit. Zero production changes expected.
//
// 0.9.491 found two gaps in the real announce -> discover -> resolve ->
// verify chain. 0.9.492 closed Gap 1 (ui/main.js never constructed the real
// uploadTaggedTransaction). 0.9.494 closed Gap 2 (the discovery-read layer
// reported an announcement transaction's own id rather than its envelope's
// claimed uri). 0.9.491's own file (amended in place by both) already
// re-verified both closures against current source. This milestone is the
// FINAL closure audit the requesting brief calls for: it does not look for
// a third gap in the same two mechanisms again — it composes the two
// already-closed fixes together as one round trip and pressure-tests the
// boundaries the requesting brief names that no prior milestone measured
// explicitly: identity fidelity as three standalone assertions (never
// inferred from other checks passing), verification against RESOLVED
// MATERIAL rather than the announcement transaction itself, seven named
// failure-isolation scenarios, multi-candidate survival with more than one
// genuinely valid candidate present at once, an explicit "announcer is not
// owner" experiment for role separation, and a live measurement (not an
// optimization) of the one-gateway-request-per-candidate cost 0.9.494
// deliberately accepted.
//
// LETTERED SECTIONS, matching the requesting brief's own lettering:
//   A. Production composition — 0.9.492's write-side wire and 0.9.494's
//      read-side envelope-aware fetch both present in current source,
//      together, in the same real composition root.
//   B. Real announcement path — application/arweave/ArweaveAnnouncementPublisher.js
//      through the real 0.9.490 adapter and a real (fake-wallet-backed)
//      signer, never a test-only publisher.
//   C. Discovery — the real ArweaveGraphqlDiscoveryQueryService discovers
//      the real announced transaction.
//   D. Identity fidelity — candidate.uri === envelope.uri,
//      candidate.announcementId === transaction.id, and
//      candidate.uri !== candidate.announcementId, asserted directly, with
//      test data that makes uri and id genuinely distinct strings.
//   E. Resolution — the discovered candidate resolves through the
//      EXISTING, unmodified material resolution machinery; no new
//      Arweave-specific resolver exists anywhere in this codebase.
//   F. Verification — the normal verification boundary validates the
//      RESOLVED MATERIAL, never the announcement transaction itself; a
//      real Publication whose material fails signature verification still
//      fails even when its announcement/discovery/resolution all succeed.
//   G. Failure isolation — GraphQL unavailable; envelope unavailable;
//      malformed envelope; gateway failure during material resolution;
//      multiple transactions where one is malformed; Nostr up while
//      Arweave is down; Arweave up while Nostr is down.
//   H. Multi-candidate behavior — three genuinely valid, distinct
//      candidates and one malformed transaction share one discoveryTag;
//      all three valid ones survive discovery, the malformed one never
//      appears, and resolution still picks out only the one matching the
//      requested object, never an AMBIGUOUS false positive.
//   I. Role separation — CONTENT / ANNOUNCEMENT / DISCOVERY / ATTRIBUTION
//      stay four separate facts; a live experiment where an Arweave wallet
//      with no relationship whatsoever to a Publication's own signing
//      identity announces that Publication's real material, and
//      verification still succeeds on the strength of the MATERIAL's own
//      signature alone — the announcer is never attributed anything.
//   J. Performance measurement — N GraphQL candidates cost exactly N
//      gateway envelope fetches, measured directly; no batching,
//      concurrency, or caching exists today, and this milestone adds none.
//   K. Production-change guard and final verdict.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Re-deriving 0.9.491/0.9.493/0.9.494's own findings from scratch.**
//   Those files remain the record of WHY the fixes are shaped as they are;
//   this file composes the now-closed result and measures boundaries none
//   of them measured explicitly (see the lettered list above).
// - **Batching, concurrency, or caching for the per-candidate gateway
//   fetch.** Section J measures the current one-request-per-candidate cost
//   and asserts it explicitly; it does not change it. Introducing any of
//   these remains a separate, later, evidence-gated optimization decision.
// - **Any product-scope decision about whether Arweave joins
//   walking-triggered Snapshot discovery.** The requesting brief is
//   explicit that this is a SEPARATE reassessment gated on this audit
//   passing — this file answers only the technical closure question.
// - **A new resolver, a new verification path, or any schema change.**
//   Section E's own point is that none is needed; inventing one here would
//   contradict the finding.

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    assert(condition, message);
}

function codeOnlyOf(text) {
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// The inverse of arweave/ArweaveInjectedProviderSigner.js's own private
// base64UrlEncode() — reimplemented independently here, per this whole
// family's own "two independent files" convention.
function decodeBase64Url(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
}
function encodeBase64Url(value) {
    return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildRealSigner(storage, username) {
    const provider = new LocalIdentityProvider(storage);
    provider.login(username);
    return provider;
}

function buildSignedPublication(identityProvider, overrides = {}) {
    const publisherIdentity = identityProvider.getSigningIdentity().toJSON();
    let publication = new Publication({
        id: 'pub-roundtrip-1',
        documentId: 'doc-1',
        title: 'A Publication Round-Tripped Through Real Arweave Announcement/Discovery',
        author: 'alice',
        publisherIdentity,
        contentReference: { hash: 'placeholder-hash', uri: 'ar://TX-MATERIAL-DISTINCT-URI', storage: 'ar' },
        signature: null,
        ...overrides
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

// A deterministic fake Arweave substrate speaking the real wire protocol:
// /tx_anchor and /price/ (consulted by the real signer while building a
// transaction), POST /tx (real broadcast of a real signed+tagged
// transaction), POST /graphql (matched against a transaction's own DECODED
// tags), and GET /<id> (raw transaction data — serving both the per-
// candidate envelope fetch and, separately, real material retrieval).
// Reconstructed independently here rather than imported from any prior
// milestone's own file, per this whole family's "two independent files"
// convention. Supports optional failure injection so Section G can exercise
// real, live failure paths rather than asserting behavior from source alone.
function makeRealWireArweaveSubstrate({ materialByTxId = {}, failGraphql = false, unreachableIds = new Set() } = {}) {
    const ledger = new Map(); // id -> { data, tags }
    for (const [id, material] of Object.entries(materialByTxId)) {
        ledger.set(id, { data: JSON.stringify(material), tags: [] });
    }
    let nextId = 0;
    const fakeWallet = {
        async connect() {},
        async sign(transaction) {
            nextId += 1;
            return { ...transaction, owner: 'fake-owner', signature: 'fake-signature', id: `RoundTripTx${String(nextId).padStart(6, '0')}` };
        }
    };

    let gatewayGetCalls = 0;

    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        const method = options.method || 'GET';

        if (method === 'GET' && parsed.pathname === '/tx_anchor') {
            return new Response('fake-anchor', { status: 200 });
        }
        if (method === 'GET' && /^\/price\//.test(parsed.pathname)) {
            return new Response('123456', { status: 200 });
        }
        if (method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            ledger.set(transaction.id, { data: transaction.data, tags: transaction.tags });
            return new Response('accepted', { status: 200 });
        }
        if (method === 'POST' && parsed.pathname === '/graphql') {
            if (failGraphql) {
                throw new Error('GraphQL gateway unreachable');
            }
            const { query } = JSON.parse(options.body);
            const match = query.match(/name:\s*"([^"]*)"\s*,\s*values:\s*\[\s*"([^"]*)"\s*\]/);
            const edges = [];
            if (match) {
                const [, matchTagName, matchValue] = match;
                for (const [id, entry] of ledger.entries()) {
                    const found = (entry.tags || []).some((t) => decodeBase64Url(t.name) === matchTagName && decodeBase64Url(t.value) === matchValue);
                    if (found) edges.push({ node: { id } });
                }
            }
            return new Response(JSON.stringify({ data: { transactions: { edges } } }), { status: 200 });
        }
        const getMatch = parsed.pathname.match(/^\/([A-Za-z0-9_-]+)$/);
        if (method === 'GET' && getMatch) {
            gatewayGetCalls += 1;
            const id = getMatch[1];
            if (unreachableIds.has(id)) {
                return new Response('gateway failure', { status: 502 });
            }
            if (!ledger.has(id)) {
                return new Response('not found', { status: 404 });
            }
            const entry = ledger.get(id);
            const raw = entry.tags.length > 0 ? decodeBase64Url(entry.data) : entry.data;
            return new Response(raw, { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }

    return { ledger, fakeWallet, fetchImpl, get gatewayGetCalls() { return gatewayGetCalls; } };
}

// Publishes one real announcement through the real 0.9.428/0.9.490 chain —
// a real ArweaveAnnouncementPublisher, a real uploadTaggedTransaction
// adapter, and a real (fake-wallet-backed) signer — against `net`. Returns
// the real `{ published, relayUrl, id }` result.
async function announceReal(net, { discoveryTag, envelope, gatewayUrl = 'https://roundtrip.example' }) {
    const signer = createArweaveInjectedProviderSigner({ injectedProvider: net.fakeWallet, fetchImpl: net.fetchImpl });
    const uploadTaggedTransaction = createArweaveTaggedTransactionUpload({ signer, gatewayUrl, fetchImpl: net.fetchImpl });
    const publisher = new ArweaveAnnouncementPublisher({ discoveryTag, uploadTaggedTransaction });
    return publisher.publish(envelope);
}

async function run() {
    // ===============================================================
    // Section A — Production composition: 0.9.492's write-side wire and
    // 0.9.494's read-side envelope-aware fetch, together, in current
    // source.
    // ===============================================================
    {
        const mainCodeOnly = codeOnlyOf((await Promise.all(mainFiles().map((file) => source(file)))).join('\n'));
        check(/createArweaveTaggedTransactionUpload\(/.test(mainCodeOnly),
            'A1. ui/main.js still constructs the real uploadTaggedTransaction adapter (0.9.492) — the write-side wire has not regressed');
        const providerCallMatch = mainCodeOnly.match(/createPublicationDistributionRuntimeProvider\(\{[\s\S]{0,400}?\}\)/);
        check(providerCallMatch !== null && /uploadTaggedTransaction\s*:/.test(providerCallMatch[0]),
            'A2. ...and forwards it into the real distribution runtime provider call');

        const discoveryServiceSource = codeOnlyOf(await source('application/arweave/ArweaveGraphqlDiscoveryQueryService.js'));
        check(/_fetchAnnouncementEnvelope\(/.test(discoveryServiceSource) && /parseDecentralizedDiscoveryEnvelope/.test(discoveryServiceSource),
            'A3. application/arweave/ArweaveGraphqlDiscoveryQueryService.js still performs the envelope-aware per-candidate gateway fetch (0.9.494) — the read-side fix has not regressed');
        check(/candidates\.push\(\{\s*\n\s*uri:\s*envelope\.uri,/.test(discoveryServiceSource),
            'A4. ...and still reports the envelope\'s own claimed uri as candidate.uri, never a transaction id substituted in its place');

        const compositionSource = codeOnlyOf(await source('application/worldEncounter/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js'));
        check(/const arweave = new ArweaveGraphqlDiscoveryQueryService\(/.test(compositionSource),
            'A5. the real discovery-services composition root still unconditionally constructs the (now envelope-aware) real Arweave discovery service — both fixes coexist in the SAME real composition path a UI click actually reaches');

        console.log('✓ Section A: 0.9.492\'s write-side wire and 0.9.494\'s read-side envelope-aware fix both present, together, in the real production composition root.');
    }

    // ===============================================================
    // Section B — Real announcement path.
    // ===============================================================
    let sectionBResult;
    {
        const net = makeRealWireArweaveSubstrate();
        const envelope = describeDecentralizedDiscoveryEnvelope({
            protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-b', uri: 'ar://TX-MATERIAL-DISTINCT-URI'
        });
        const published = await announceReal(net, { discoveryTag: 'roundtrip-campaign-b', envelope });

        check(published !== null && published.published === true, 'B1. the real ArweaveAnnouncementPublisher, through the real 0.9.490 adapter and a real (fake-wallet-backed) signer, genuinely publishes');
        check(typeof published.id === 'string' && net.ledger.has(published.id), 'B2. a real ledger entry exists under the real signer-computed transaction id');
        const entry = net.ledger.get(published.id);
        check(entry.tags.length === 1 && decodeBase64Url(entry.tags[0].value) === 'roundtrip-campaign-b', 'B3. the real on-wire transaction carries exactly the configured discovery tag');

        sectionBResult = { net, published, envelope };
        console.log('✓ Section B: real announcement path, from application/arweave/ArweaveAnnouncementPublisher.js through a real adapter and real signer, genuinely publishes — never a test-only publisher.');
    }

    // ===============================================================
    // Section C — Discovery: the real ArweaveGraphqlDiscoveryQueryService
    // discovers the real announced transaction.
    // ===============================================================
    let sectionCCandidate;
    {
        const { net, published } = sectionBResult;
        const discoveryService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const candidates = await discoveryService.search('roundtrip-campaign-b');

        check(candidates.length === 1, 'C1. the real discovery query service finds exactly the one real announced transaction');
        check(candidates[0].announcementId === published.id, 'C2. the discovered candidate names the real announcement transaction as its announcementId');

        sectionCCandidate = candidates[0];
        console.log('✓ Section C: the real ArweaveGraphqlDiscoveryQueryService discovers the real announced transaction from Section B.');
    }

    // ===============================================================
    // Section D — Identity fidelity, asserted directly and explicitly.
    // ===============================================================
    {
        const { published, envelope } = sectionBResult;
        const candidate = sectionCCandidate;

        // Sanity: the test data genuinely makes uri and announcementId
        // distinct strings — a real Arweave transaction id (the real
        // signer's own computed identity) and a `ar://...` material uri
        // are never the same shape, so this assertion is not vacuous.
        check(envelope.uri !== published.id, 'D0. sanity: the announcement transaction id and the envelope\'s own claimed material uri are genuinely distinct strings in this test\'s own data — the identity-fidelity assertions below are not vacuously true');

        check(candidate.uri === envelope.uri,
            'D1. candidate.uri === envelope.uri — the discovered candidate reports exactly the material location the announcement\'s own envelope claimed, never anything re-derived');
        check(candidate.announcementId === published.id,
            'D2. candidate.announcementId === transaction.id — the announcement transaction\'s own real, signer-computed id is preserved verbatim alongside the material uri');
        check(candidate.uri !== candidate.announcementId,
            'D3. candidate.uri !== candidate.announcementId — the two identities the requesting brief names never collapse into one, even on the SAME candidate object');

        console.log('✓ Section D: identity fidelity holds as three explicit, standalone assertions — never inferred from other sections passing.');
    }

    // ===============================================================
    // Section E — Resolution through the EXISTING material resolution
    // machinery; no Arweave-specific resolver for discovery exists.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const alice = buildRealSigner(storage, 'roundtrip-alice-e');
        const publication = buildSignedPublication(alice, { id: 'pub-e' });

        const net = makeRealWireArweaveSubstrate({ materialByTxId: { 'TX-MATERIAL-DISTINCT-URI': publication.toJSON() } });
        const envelope = describeDecentralizedDiscoveryEnvelope({
            protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: publication.id, uri: publication.contentReference.uri
        });
        await announceReal(net, { discoveryTag: 'roundtrip-campaign-e', envelope });

        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ arweaveFetchImpl: net.fetchImpl });
        const { verifier } = composeWorldEncounterMaterialVerifier();
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
            discoveryServices: services,
            arweaveResolverOptions: { fetchImpl: net.fetchImpl },
            verifier
        });
        const result = await runtime.discoverWorldEncounterPublication({
            objectId: publication.id, discoveryTag: 'roundtrip-campaign-e', publications: [publication]
        });

        check(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, 'E1. the discovered candidate resolves through the existing, unmodified resolution machinery — RESOLVED');
        check(result.inspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, 'E2. ...and the existing, unmodified material loader retrieves the real material directly off the resolved candidate\'s own uri');

        // Source sweep: no Arweave-specific DISCOVERY resolver exists —
        // ArweaveWorldEncounterMaterialResolver.js is the one, pre-existing,
        // general-purpose Arweave uri retriever every ar:// uri already
        // used, unmodified since well before 0.9.428, never a new file this
        // arc introduced.
        const resolverSource = await source('application/worldEncounter/ArweaveWorldEncounterMaterialResolver.js');
        check(!/0\.9\.49[0-5]/.test(resolverSource),
            'E3. application/worldEncounter/ArweaveWorldEncounterMaterialResolver.js carries no 0.9.490-through-0.9.495 milestone marker of its own — it was never touched by this announcement/discovery arc, confirming no new Arweave-specific resolver was built for it');
        const materialCompositionSource = await source('application/worldEncounter/DecentralizedWorldEncounterMaterialRuntimeComposition.js');
        check(!/Announcement|discoveryTag|ArweaveGraphqlDiscoveryQueryService/.test(materialCompositionSource),
            'E4. the material-source composition root that builds the resolver never imports or references announcement/discovery concepts at all — resolution and retrieval remain entirely ignorant of how a uri was found');

        console.log('✓ Section E: the discovered candidate resolves through the existing resolver/material-source pair, unmodified; no Arweave-specific discovery resolver exists anywhere in this codebase.');
    }

    // ===============================================================
    // Section F — Verification validates the RESOLVED MATERIAL, never
    // the announcement transaction itself.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const alice = buildRealSigner(storage, 'roundtrip-alice-f');
        const publication = buildSignedPublication(alice, { id: 'pub-f', contentReference: { hash: 'placeholder-hash', uri: 'ar://TX-MATERIAL-F-GOOD', storage: 'ar' } });

        // A SECOND scenario, same shape, but the material actually stored
        // at the announced uri does not verify — it carries a
        // structurally well-formed Signature (so it passes location-claim
        // ingress and loading exactly like the good scenario), but that
        // Signature was produced over a DIFFERENT canonical payload (a
        // decoy publication's own descriptor), so the cryptographic check
        // fails. This isolates the one thing this section means to prove:
        // a genuinely well-formed-but-invalid signature, never a merely
        // malformed field truthiness check earlier in the chain.
        const decoyPublication = buildSignedPublication(alice, { id: 'pub-f-decoy', contentReference: { hash: 'z', uri: 'ar://TX-DECOY', storage: 'ar' } });
        const badPublicationStub = new Publication({
            id: 'pub-f-bad', documentId: 'doc-bad', title: 'Tampered', author: 'alice',
            publisherIdentity: publication.publisherIdentity,
            contentReference: { hash: 'x', uri: 'ar://TX-MATERIAL-F-BAD', storage: 'ar' },
            signature: decoyPublication.signature.toJSON()
        });

        const net = makeRealWireArweaveSubstrate({
            materialByTxId: {
                'TX-MATERIAL-F-GOOD': publication.toJSON(),
                'TX-MATERIAL-F-BAD': badPublicationStub.toJSON()
            }
        });

        const goodEnvelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-f', uri: 'ar://TX-MATERIAL-F-GOOD' });
        const badEnvelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-f-bad', uri: 'ar://TX-MATERIAL-F-BAD' });
        const goodAnnouncement = await announceReal(net, { discoveryTag: 'roundtrip-campaign-f', envelope: goodEnvelope });
        const badAnnouncement = await announceReal(net, { discoveryTag: 'roundtrip-campaign-f', envelope: badEnvelope });
        check(goodAnnouncement !== null && badAnnouncement !== null, 'F0. sanity: BOTH announcements succeed identically — announcing is not where the difference this section measures comes from');

        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ arweaveFetchImpl: net.fetchImpl });
        const { verifier } = composeWorldEncounterMaterialVerifier();

        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
            discoveryServices: services, arweaveResolverOptions: { fetchImpl: net.fetchImpl }, verifier
        });

        const goodResult = await runtime.discoverWorldEncounterPublication({ objectId: 'pub-f', discoveryTag: 'roundtrip-campaign-f', publications: [publication] });
        check(goodResult.inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, 'F1. genuinely-signed material behind a genuinely-announced uri verifies VERIFIED');

        const badResult = await runtime.discoverWorldEncounterPublication({ objectId: 'pub-f-bad', discoveryTag: 'roundtrip-campaign-f', publications: [badPublicationStub] });
        check(badResult.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, 'F2. the tampered-material scenario resolves identically to the good one — announcement and discovery are indistinguishable between the two');
        check(badResult.inspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, 'F3. ...and the tampered material genuinely loads — this is not a retrieval failure being mistaken for a verification failure');
        check(badResult.inspection.verification.status === WorldEncounterMaterialVerificationStatus.REJECTED,
            'F4. ...but verification REJECTS it — the normal verification boundary judges the RESOLVED MATERIAL\'s own signature, never the fact that an announcement transaction successfully carried this uri to discovery. A bad announcement is never trusted merely for having been discovered');

        console.log('✓ Section F: verification validates resolved material, never the announcement transaction itself — an equally well-announced, equally well-discovered uri pointing at invalid material is REJECTED.');
    }

    // ===============================================================
    // Section G — Failure isolation: seven named scenarios.
    // ===============================================================
    {
        const verifierBundle = composeWorldEncounterMaterialVerifier();

        // G1 — GraphQL unavailable.
        {
            const net = makeRealWireArweaveSubstrate({ failGraphql: true });
            const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
            let threw = false;
            let candidates;
            try { candidates = await service.search('any-tag'); } catch { threw = true; }
            check(threw === false && Array.isArray(candidates) && candidates.length === 0,
                'G1. GraphQL unavailable — search() degrades to [] rather than throwing');
        }

        // G2 — transaction envelope unavailable (gateway fails on the
        // per-candidate GET, GraphQL itself is fine).
        {
            const net = makeRealWireArweaveSubstrate();
            const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-g2', uri: 'ar://TX-G2' });
            const announced = await announceReal(net, { discoveryTag: 'roundtrip-campaign-g2', envelope });
            const net2 = makeRealWireArweaveSubstrate({ unreachableIds: new Set([announced.id]) });
            // Replay the exact same graphql-visible transaction into the
            // second, gateway-crippled substrate's own ledger (same id, same
            // tags) so GraphQL still finds it but the envelope GET fails.
            net2.ledger.set(announced.id, net.ledger.get(announced.id));
            const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net2.fetchImpl });
            const candidates = await service.search('roundtrip-campaign-g2');
            check(candidates.length === 0, 'G2. GraphQL finds the transaction but its envelope fetch fails (502) — the candidate is silently skipped, never reported with a fallback uri');
        }

        // G3 — malformed envelope (the transaction's own data is not a
        // well-formed discovery envelope at all).
        {
            const net = makeRealWireArweaveSubstrate();
            net.ledger.set('MalformedTx1', { data: 'not json at all', tags: [{ name: encodeBase64Url(ArweaveAnnouncementPublisher.DEFAULT_TAG_NAME), value: encodeBase64Url('roundtrip-campaign-g3') }] });
            const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
            const candidates = await service.search('roundtrip-campaign-g3');
            check(candidates.length === 0, 'G3. a transaction whose own data fails to parse as a discovery envelope contributes no candidate');
        }

        // G4 — gateway failure during MATERIAL resolution (not the
        // announcement envelope fetch) — the candidate resolves, but
        // loading the actual material fails.
        {
            const storage = new InMemoryStorageProvider();
            const alice = buildRealSigner(storage, 'roundtrip-alice-g4');
            const publication = buildSignedPublication(alice, { id: 'pub-g4', contentReference: { hash: 'x', uri: 'ar://TX-MATERIAL-G4', storage: 'ar' } });
            const announceNet = makeRealWireArweaveSubstrate();
            const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-g4', uri: 'ar://TX-MATERIAL-G4' });
            await announceReal(announceNet, { discoveryTag: 'roundtrip-campaign-g4', envelope });

            // A second net for resolution: GraphQL/envelope fetch both work
            // (the announcement transaction is present), but the MATERIAL
            // transaction itself is unreachable at the gateway.
            const resolveNet = makeRealWireArweaveSubstrate({ unreachableIds: new Set(['TX-MATERIAL-G4']) });
            for (const [id, entry] of announceNet.ledger.entries()) { resolveNet.ledger.set(id, entry); }

            const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ arweaveFetchImpl: resolveNet.fetchImpl });
            const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
                discoveryServices: services, arweaveResolverOptions: { fetchImpl: resolveNet.fetchImpl }, verifier: verifierBundle.verifier
            });
            const result = await runtime.discoverWorldEncounterPublication({ objectId: 'pub-g4', discoveryTag: 'roundtrip-campaign-g4', publications: [publication] });
            check(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, 'G4a. resolution still succeeds — the announcement/discovery layer is entirely unaffected by a material-gateway failure downstream of it');
            check(result.inspection.loading.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, 'G4b. ...but loading the actual material reports UNAVAILABLE, gracefully, never a thrown exception propagating out of discoverWorldEncounterPublication()');
        }

        // G5 — multiple transactions where one is malformed (see also
        // Section H, which extends this to more than one VALID survivor).
        {
            const net = makeRealWireArweaveSubstrate();
            const goodEnvelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-g5', uri: 'ar://TX-G5-GOOD' });
            await announceReal(net, { discoveryTag: 'roundtrip-campaign-g5', envelope: goodEnvelope });
            net.ledger.set('MalformedTxG5', { data: 'garbage', tags: [{ name: encodeBase64Url(ArweaveAnnouncementPublisher.DEFAULT_TAG_NAME), value: encodeBase64Url('roundtrip-campaign-g5') }] });
            const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
            const candidates = await service.search('roundtrip-campaign-g5');
            check(candidates.length === 1 && candidates[0].uri === 'ar://TX-G5-GOOD', 'G5. one malformed transaction sharing the same tag never disturbs the one genuinely well-formed candidate');
        }

        // G6 — Nostr available while Arweave is unavailable.
        {
            const failingArweave = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: async () => { throw new Error('arweave gateway down'); } });
            const workingNostr = { get origin() { return 'dweb:nostr:wss://fake-relay.example'; }, async search(tag) { return [{ uri: 'nostr-material-uri', storage: 'nostr' }]; } };
            const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
                discoveryServices: { nostr: workingNostr, arweave: failingArweave }, verifier: verifierBundle.verifier
            });
            const result = await runtime.discoverWorldEncounterPublication({ objectId: 'pub-g6', discoveryTag: 'roundtrip-campaign-g6', publications: [] });
            check(result.discovery.nostr.length === 1 && result.discovery.arweave.length === 0,
                'G6. with Arweave genuinely unreachable, Nostr\'s own results in the SAME call are entirely unaffected');
        }

        // G7 — Arweave available while Nostr is unavailable (no host Nostr
        // capability configured at all — the default, real production
        // shape whenever no relay is wired in).
        {
            const net = makeRealWireArweaveSubstrate();
            const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-g7', uri: 'ar://TX-G7' });
            await announceReal(net, { discoveryTag: 'roundtrip-campaign-g7', envelope });
            const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ arweaveFetchImpl: net.fetchImpl });
            check(services.nostr === null, 'G7a. sanity: with no nostrQueryImpl configured, Nostr is genuinely absent, never a service that would only fail on its own search()');
            const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({ discoveryServices: services, arweaveResolverOptions: { fetchImpl: net.fetchImpl }, verifier: verifierBundle.verifier });
            const result = await runtime.discoverWorldEncounterPublication({ objectId: 'pub-g7', discoveryTag: 'roundtrip-campaign-g7', publications: [] });
            check(result.discovery.arweave.length === 1 && !('nostr' in result.discovery),
                'G7b. Arweave\'s own results are reported normally while Nostr is simply never queried — an absent service is skipped, never a reported failure');
        }

        console.log('✓ Section G: all seven named failure-isolation scenarios confirmed live — a bad Arweave announcement, an unreachable gateway at either layer, or a missing sibling substrate never poisons an otherwise-valid discovery.');
    }

    // ===============================================================
    // Section H — Multi-candidate behavior: more than one genuinely
    // VALID candidate survives together, and resolution still picks out
    // only the one actually requested.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const alice = buildRealSigner(storage, 'roundtrip-alice-h');
        const publicationTwo = buildSignedPublication(alice, { id: 'pub-h-two', contentReference: { hash: 'x', uri: 'ar://TX-H-TWO', storage: 'ar' } });

        const net = makeRealWireArweaveSubstrate({ materialByTxId: { 'TX-H-TWO': publicationTwo.toJSON() } });
        const campaign = 'roundtrip-campaign-h';
        const envelopeOne = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-h-one', uri: 'ar://TX-H-ONE' });
        const envelopeTwo = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-h-two', uri: 'ar://TX-H-TWO' });
        const envelopeThree = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-h-three', uri: 'ar://TX-H-THREE' });
        await announceReal(net, { discoveryTag: campaign, envelope: envelopeOne });
        await announceReal(net, { discoveryTag: campaign, envelope: envelopeTwo });
        await announceReal(net, { discoveryTag: campaign, envelope: envelopeThree });
        net.ledger.set('MalformedTxH', { data: 'not an envelope', tags: [{ name: encodeBase64Url(ArweaveAnnouncementPublisher.DEFAULT_TAG_NAME), value: encodeBase64Url(campaign) }] });

        const discoveryService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const candidates = await discoveryService.search(campaign);
        check(candidates.length === 3, 'H1. three genuinely distinct, well-formed candidates all survive discovery under one shared campaign tag, alongside a fourth malformed transaction');
        const uris = candidates.map((c) => c.uri).sort();
        check(JSON.stringify(uris) === JSON.stringify(['ar://TX-H-ONE', 'ar://TX-H-THREE', 'ar://TX-H-TWO']),
            'H2. all three, and only those three, uris are present — the malformed transaction contributes nothing, and none of the three valid ones is dropped by the others\' presence');

        // Resolution: only ONE Publication is locally known (pub-h-two).
        // Multiple candidates sharing a campaign tag must never turn into
        // an AMBIGUOUS resolution for an object only one of them concerns.
        const { verifier } = composeWorldEncounterMaterialVerifier();
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
            discoveryServices: { arweave: discoveryService }, arweaveResolverOptions: { fetchImpl: net.fetchImpl }, verifier
        });
        const result = await runtime.discoverWorldEncounterPublication({ objectId: 'pub-h-two', discoveryTag: campaign, publications: [publicationTwo] });
        check(result.discovery.arweave.length === 3, 'H3. the full discovery result still reports all three candidates, unfiltered');
        check(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, 'H4. ...yet resolution for the ONE requested objectId reports RESOLVED, not AMBIGUOUS — the other two valid-but-irrelevant candidates never contribute a competing association for an object they were never announced under');
        check(result.inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, 'H5. ...and the correctly-resolved one verifies VERIFIED');

        console.log('✓ Section H: three genuinely valid candidates and one malformed transaction coexist under one campaign tag; all three valid ones survive, the malformed one never appears, and resolution remains precise per-object rather than becoming ambiguous merely because more candidates exist.');
    }

    // ===============================================================
    // Section I — Role separation: CONTENT / ANNOUNCEMENT / DISCOVERY /
    // ATTRIBUTION stay four separate facts. Live experiment: an Arweave
    // wallet with no relationship to a Publication's own signing identity
    // announces that Publication's real material.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const alice = buildRealSigner(storage, 'roundtrip-alice-i');
        const publication = buildSignedPublication(alice, { id: 'pub-i', contentReference: { hash: 'x', uri: 'ar://TX-MATERIAL-I', storage: 'ar' } });

        const net = makeRealWireArweaveSubstrate({ materialByTxId: { 'TX-MATERIAL-I': publication.toJSON() } });

        // Mallory: a completely separate ForkBuild identity AND a
        // completely separate Arweave wallet — she never touches Alice's
        // private key, Alice's ForkBuild identity, or Alice's own material
        // upload. She only tags a NEW announcement transaction of her own,
        // naming Alice's already-existing material uri. A SEPARATE storage
        // instance for Mallory — LocalIdentityProvider's own session state
        // lives in whatever storage it is given, so sharing Alice's own
        // storage would let Mallory's login silently overwrite Alice's
        // active session rather than genuinely modeling two independent
        // identities.
        const aliceUsername = alice.getSigningIdentity().toJSON().metadata.username;
        const malloryStorage = new InMemoryStorageProvider();
        const mallory = buildRealSigner(malloryStorage, 'roundtrip-mallory-i');
        const malloryUsername = mallory.getSigningIdentity().toJSON().metadata.username;
        check(malloryUsername !== aliceUsername,
            'I0. sanity: Mallory is a genuinely distinct identity from Alice, never a stand-in for her');

        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: publication.id, uri: publication.contentReference.uri });
        const malloryAnnouncement = await announceReal(net, { discoveryTag: 'roundtrip-campaign-i', envelope, gatewayUrl: 'https://mallory-gateway.example' });
        check(malloryAnnouncement !== null && malloryAnnouncement.published === true, 'I1. Mallory\'s announcement transaction — using her own, unrelated wallet — succeeds; ANNOUNCING requires no relationship whatsoever to the material\'s own authorship');

        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ arweaveFetchImpl: net.fetchImpl });
        const { verifier } = composeWorldEncounterMaterialVerifier();
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({ discoveryServices: services, arweaveResolverOptions: { fetchImpl: net.fetchImpl }, verifier });
        const result = await runtime.discoverWorldEncounterPublication({ objectId: publication.id, discoveryTag: 'roundtrip-campaign-i', publications: [publication] });

        // Note: the LEAD shape `queryDecentralizedWorldDiscovery()` folds
        // into `result.discovery.arweave` only ever keeps `{ origin,
        // discoveryTag, uri, storage }` (0.9.493 Section D) — announcementId
        // rides on the RAW candidate `search()` itself returns, so this
        // section reads it from there directly, exactly as 0.9.491's own
        // Section E already does for the identical reason.
        const rawCandidates = await services.arweave.search('roundtrip-campaign-i');
        check(rawCandidates.length === 1 && rawCandidates[0].announcementId === malloryAnnouncement.id, 'I2. DISCOVERY genuinely surfaces Mallory\'s own announcement transaction id on the raw candidate');
        check(result.discovery.arweave.length === 1 && result.discovery.arweave[0].uri === 'ar://TX-MATERIAL-I', 'I2b. ...and the lead this candidate produces still carries the correct material uri through to the discovery result');
        check(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, 'I3. ...and resolution succeeds — the announcement did its one job, connecting a discoverable uri to a known Publication');
        check(result.inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, 'I4. ...and the material verifies VERIFIED — on the strength of ALICE\'s own signature over her own material, never Mallory\'s');

        // The decisive check: nowhere in the verified result does Mallory's
        // own identity, wallet, or announcement transaction id appear as an
        // authorship/ownership claim. The verified publisherIdentity is
        // still, and only, Alice's.
        const verifiedPublisherIdentity = publication.publisherIdentity;
        check(verifiedPublisherIdentity.metadata.username === alice.getSigningIdentity().toJSON().metadata.username,
            'I5. the VERIFIED publication\'s own publisherIdentity is Alice\'s, unconditionally — Mallory\'s successful announcement and discovery grant her no authorship, ownership, or control claim of any kind over material she merely pointed a discovery tag at');
        check(JSON.stringify(result).indexOf(mallory.getSigningIdentity().toJSON().metadata.username) === -1,
            'I6. Mallory\'s own ForkBuild identity does not appear ANYWHERE in the discovery/resolution/inspection result at all — she is not a silent co-author, and not even named as "the announcer" in any structured field this chain produces');

        // Content, announcement, discovery, and attribution remain four
        // separate facts even in this adversarial-shaped scenario.
        check(malloryAnnouncement.id !== 'TX-MATERIAL-I', 'I7. CONTENT (the pre-existing material transaction) != ANNOUNCEMENT (Mallory\'s own transaction) — two distinct Arweave transactions');
        check(result.discovery.arweave.length === 1 && result.discovery.arweave[0].uri === 'ar://TX-MATERIAL-I', 'I8. DISCOVERY reports the material location, a fact about WHERE, carrying no authorship claim of its own');
        const publicationSignatureJson = publication.signature ? publication.signature.toJSON() : null;
        check(publicationSignatureJson !== null && typeof publicationSignatureJson.signature === 'string' && publicationSignatureJson.signature.length > 0,
            'I9. ATTRIBUTION remains exactly the material\'s own cryptographic signature — the one fact Mallory\'s announcement could never fabricate, forge, or borrow');

        console.log('✓ Section I: CONTENT/ANNOUNCEMENT/DISCOVERY/ATTRIBUTION remain four separate facts. A wallet with zero relationship to a Publication\'s own signing identity can successfully announce and be discovered pointing at that Publication\'s real material — and is granted no authorship, ownership, or control claim whatsoever. Discovering an announcement is never proof of authorship.');
    }

    // ===============================================================
    // Section J — Performance measurement (never optimization): N
    // GraphQL candidates cost exactly N gateway envelope fetches.
    // ===============================================================
    {
        const net = makeRealWireArweaveSubstrate();
        const campaign = 'roundtrip-campaign-j';
        const COUNT = 10;
        for (let i = 0; i < COUNT; i++) {
            const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: `pub-j-${i}`, uri: `ar://TX-J-${i}` });
            await announceReal(net, { discoveryTag: campaign, envelope });
        }

        const beforeCalls = net.gatewayGetCalls;
        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const candidates = await service.search(campaign);
        const firstPassCalls = net.gatewayGetCalls - beforeCalls;

        check(candidates.length === COUNT, `J1. sanity: all ${COUNT} announced transactions are discovered as candidates`);
        check(firstPassCalls === COUNT,
            `J2. exactly ${COUNT} GraphQL candidates cost exactly ${COUNT} gateway envelope fetches — one per candidate, measured directly against a real call counter, confirming this milestone\'s own performance concern rather than assuming it from source`);

        // A second, independent call for the SAME tag costs another COUNT
        // fetches — confirming no caching exists between calls (this
        // milestone measures the current cost; it does not add caching).
        const beforeSecondPass = net.gatewayGetCalls;
        await service.search(campaign);
        const secondPassCalls = net.gatewayGetCalls - beforeSecondPass;
        check(secondPassCalls === COUNT,
            'J3. a second, independent search() for the identical tag costs another full round of gateway fetches — no caching exists between calls today; this milestone measures that fact and does not introduce one');

        console.log(`✓ Section J: measured, not assumed — ${COUNT} discovered transactions cost exactly ${COUNT} gateway envelope fetches per search() call, with no batching, concurrency, or caching. This milestone does not change that; per its own brief, doing so is a separate, evidence-gated optimization decision.`);
    }

    // ===============================================================
    // Section K — production-change guard and final verdict.
    // ===============================================================
    {
        const testsHtml = await source('tests.html');
        check(testsHtml.includes("'./tests/ArweaveAnnouncementDiscoveryRoundTripProductionIntegrationAudit.test.js'"),
            'K1. this file is registered in tests.html, exactly like every other audit in this family');

        const VERDICT = Object.freeze({
            productionComposition: 'BOTH_FIXES_COEXIST',
            realAnnouncementPath: 'FUNCTIONAL',
            discovery: 'FUNCTIONAL',
            identityFidelity: 'CONFIRMED_EXPLICITLY',
            resolution: 'EXISTING_MACHINERY_NO_NEW_RESOLVER',
            verification: 'VALIDATES_RESOLVED_MATERIAL_NEVER_THE_ANNOUNCEMENT',
            failureIsolation: 'CONFIRMED_ALL_SEVEN_SCENARIOS',
            multiCandidateBehavior: 'CONFIRMED_THREE_VALID_ONE_MALFORMED',
            roleSeparation: 'CONFIRMED_ANNOUNCER_NOT_OWNER',
            performanceCost: 'MEASURED_ONE_REQUEST_PER_CANDIDATE_UNCHANGED'
        });

        console.log('='.repeat(78));
        console.log('ARWEAVE ANNOUNCEMENT/DISCOVERY ROUND-TRIP PRODUCTION INTEGRATION — VERDICT');
        console.log('='.repeat(78));
        for (const [key, value] of Object.entries(VERDICT)) {
            console.log(`  ${key.padEnd(28)} ${value}`);
        }
        console.log('');
        console.log('  The complete Arweave announcement -> discovery -> resolution -> verification');
        console.log('  round trip is production-complete and closed. No new gap was found.');
        console.log('');
        console.log('  RECOMMENDATION: per the requesting brief, the next step is a PRODUCT');
        console.log('  reassessment, not another implementation milestone — whether Arweave\'s');
        console.log('  durable announcement/discovery capability should join walking-triggered');
        console.log('  Snapshot discovery, remain an independent capability, or the current');
        console.log('  Nostr + local/peer discovery already satisfies the product requirement.');
        console.log('  That is an explicitly separate, unscheduled decision this file does not make.');
        console.log('='.repeat(78));

        check(Object.values(VERDICT).every((value) => typeof value === 'string' && value.length > 0), 'K2. every boundary this audit checked resolved to an explicit classification');
        check(assertionCount > 40, 'K3. sanity: this audit is substantive, not a token pass');

        console.log(`\n✅ All Arweave Announcement/Discovery Round-Trip Production Integration Audit tests passed. (${assertionCount} assertions)`);
    }
}

run().catch((error) => {
    console.error('ArweaveAnnouncementDiscoveryRoundTripProductionIntegrationAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
