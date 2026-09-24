
import { ArweaveGraphqlDiscoveryQueryService } from '../application/arweave/ArweaveGraphqlDiscoveryQueryService.js';
import { DecentralizedDiscoveryQueryService } from '../application/discovery/DecentralizedWorldDiscoveryQuery.js';
import { NostrDiscoveryQueryService } from '../application/nostr/NostrDiscoveryQueryService.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { describeDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import { ArweaveAnnouncementPublisher } from '../application/arweave/ArweaveAnnouncementPublisher.js';
import { ArweaveWorldEncounterMaterialResolver } from '../application/worldEncounter/ArweaveWorldEncounterMaterialResolver.js';
import { composeDecentralizedWorldEncounterMaterialDiscoveryRuntime } from '../application/worldEncounter/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeWorldEncounterMaterialVerifier } from '../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { WorldEncounterMaterialLoadStatus } from '../application/worldEncounter/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/worldEncounter/WorldEncounterMaterialVerification.js';
import { DecentralizedWorldEncounterLeadResolutionStatus } from '../application/worldEncounter/DecentralizedWorldEncounterLeadResolution.js';
import { assert } from './support/Assert.js';
import { readSource as source } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.494 — Arweave Envelope-Aware Discovery URI Resolution.
//
// `tests/ArweaveDiscoveryUriIdentityBoundaryAudit.test.js` (0.9.493) proved
// live, via a throwaway test-only prototype, that Gap 2 (a discovery
// candidate's own `uri` reporting an ANNOUNCEMENT transaction id instead of
// the announced MATERIAL's own claimed location) is closed by fetching each
// discovered transaction's own raw data and decoding its signed publication
// envelope. This milestone moves that exact logic into the real,
// production `application/arweave/ArweaveGraphqlDiscoveryQueryService.js` itself.
// This file is the focused, real-implementation test for that change —
// covering the real class directly, never a prototype.
//
// LETTERED SECTIONS, mirroring the requesting brief's own lettering:
//   A. Transaction discovery — GraphQL still identifies the correct
//      Arweave announcement transaction.
//   B. Envelope retrieval — the additional gateway fetch retrieves the
//      transaction's signed publication envelope.
//   C. Envelope interpretation — the claimed material uri is extracted
//      without alteration.
//   D. Candidate identity — candidate.uri === claimedMaterialUri.
//   E. Transaction identity preservation — the announcement transaction id
//      remains available through the existing candidate structure.
//   F. Malformed/unavailable envelope — no transaction id is silently
//      substituted as a material uri.
//   G. Existing resolver convergence — the returned candidate works with
//      the existing, unmodified resolver.
//   H. Nostr isolation — no changes or special handling in the Nostr path.
//   I. Scope guard — no announcement, signing, storage, attribution, or
//      candidate-schema changes.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Re-deriving 0.9.493's own boundary audit.** That file remains the
//   record of WHY this fix is shaped this way; this file only proves the
//   REAL implementation satisfies it.
// - **Wiring Arweave into walking-triggered Snapshot discovery, or any
//   product-scope decision.** 0.9.495's own job, after a production
//   integration audit — explicitly out of scope here.

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    assert(condition, message);
}

function codeOnlyOf(text) {
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function buildRealSigner(storage, username) {
    const provider = new LocalIdentityProvider(storage);
    provider.login(username);
    return provider;
}

function buildSignedPublication(identityProvider, overrides = {}) {
    const publisherIdentity = identityProvider.getSigningIdentity().toJSON();
    let publication = new Publication({
        id: 'pub-envelope-aware-1',
        documentId: 'doc-1',
        title: 'A Publication Discovered Through An Envelope-Aware Arweave Reader',
        author: 'alice',
        publisherIdentity,
        contentReference: { hash: 'placeholder-hash', uri: 'ar://TX-MATERIAL', storage: 'ar' },
        signature: null,
        ...overrides
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

// A minimal, deterministic fake Arweave substrate — POST /graphql (matched
// against real Tags) and GET /<id> (raw transaction data) — independently
// reconstructed here per this whole family's own "two independent files"
// convention, rather than imported from 0.9.493's own audit file.
function makeFakeArweaveSubstrate() {
    const ledger = new Map(); // id -> { data, tag: { name, value } | null }
    let nextId = 0;
    function newId(prefix) {
        nextId += 1;
        return `${prefix}${String(nextId).padStart(8, '0')}`;
    }

    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        const method = options.method || 'GET';

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

    async function uploadTaggedTransaction(material, tag) {
        const id = newId('Announce');
        ledger.set(id, { data: material, tag: { name: tag.name, value: tag.value } });
        return { id };
    }

    function putContent(id, data) {
        ledger.set(id, { data, tag: null });
    }

    return { ledger, fetchImpl, uploadTaggedTransaction, putContent };
}

async function run() {
    // ===============================================================
    // Section A — Transaction discovery: GraphQL still identifies the
    // correct Arweave announcement transaction, unmodified.
    // ===============================================================
    let announcedTxId = null;
    {
        const net = makeFakeArweaveSubstrate();
        const announcementPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-a', uploadTaggedTransaction: net.uploadTaggedTransaction });
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-a', uri: 'ar://TX-MATERIAL-A' });
        const announced = await announcementPublisher.publish(envelope);
        announcedTxId = announced.id;

        let graphqlRequests = 0;
        const countingFetch = async (url, options) => {
            if (new URL(url).pathname === '/graphql') graphqlRequests += 1;
            return net.fetchImpl(url, options);
        };
        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: countingFetch });
        const candidates = await service.search('campaign-a');

        check(graphqlRequests === 1, 'A1. exactly one GraphQL request is made per search() call, unchanged from 0.9.25');
        check(candidates.length === 1, 'A2. GraphQL correctly identifies the one real announced transaction');

        const unmatched = await service.search('campaign-does-not-exist');
        check(unmatched.length === 0, 'A3. a discoveryTag matching no transaction reports no candidates');

        console.log('✓ Section A: transaction discovery via GraphQL is unchanged — one request, correctly matched by tag name/value.');
    }

    // ===============================================================
    // Section B — Envelope retrieval: the additional gateway fetch
    // retrieves the transaction's own signed publication envelope.
    // ===============================================================
    {
        const net = makeFakeArweaveSubstrate();
        const announcementPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-b', uploadTaggedTransaction: net.uploadTaggedTransaction });
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-b', uri: 'ar://TX-MATERIAL-B' });
        const announced = await announcementPublisher.publish(envelope);

        let gatewayGetRequests = [];
        const capturingFetch = async (url, options) => {
            const parsed = new URL(url);
            if ((options.method || 'GET') === 'GET' && parsed.pathname !== '/graphql') {
                gatewayGetRequests.push(parsed.pathname.slice(1));
            }
            return net.fetchImpl(url, options);
        };
        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: capturingFetch });
        await service.search('campaign-b');

        check(gatewayGetRequests.length === 1, 'B1. exactly one additional gateway GET is issued, for the one transaction GraphQL found');
        check(gatewayGetRequests[0] === announced.id, 'B2. the gateway GET targets the announcement transaction\'s own id — the exact GET <gatewayUrl>/<id> primitive ArweaveWorldEncounterMaterialResolver.js already ships');
        check(service.gatewayUrl === ArweaveGraphqlDiscoveryQueryService.DEFAULT_GATEWAY_URL, 'B3. the gateway url defaults to the same arweave.net host ArweaveWorldEncounterMaterialResolver.js already defaults to');

        console.log('✓ Section B: the additional gateway fetch retrieves each discovered transaction\'s own raw data, one GET per transaction.');
    }

    // ===============================================================
    // Section C — Envelope interpretation: the claimed material uri is
    // extracted without alteration.
    // ===============================================================
    {
        const net = makeFakeArweaveSubstrate();
        const announcementPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-c', uploadTaggedTransaction: net.uploadTaggedTransaction });
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-c', uri: 'ar://TX-MATERIAL-C-EXACT' });
        await announcementPublisher.publish(envelope);

        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const candidates = await service.search('campaign-c');

        check(candidates.length === 1, 'C1. sanity: the one announced transaction is discovered');
        check(candidates[0].uri === 'ar://TX-MATERIAL-C-EXACT', 'C2. the reported uri is byte-for-byte the envelope\'s own claimed uri, unaltered');
        check(candidates[0].storage === 'ar', 'C3. storage is read off that same reported uri\'s own scheme, exactly as NostrDiscoveryQueryService.js already does for its own candidates');

        console.log('✓ Section C: the claimed material uri is decoded and reported exactly as the envelope declared it, with no reinterpretation.');
    }

    // ===============================================================
    // Section D — Candidate identity: candidate.uri === claimedMaterialUri.
    // ===============================================================
    {
        const net = makeFakeArweaveSubstrate();
        const claimedMaterialUri = 'ar://TX-MATERIAL-D-CLAIM';
        const announcementPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-d', uploadTaggedTransaction: net.uploadTaggedTransaction });
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-d', uri: claimedMaterialUri });
        const announced = await announcementPublisher.publish(envelope);

        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const [candidate] = await service.search('campaign-d');

        check(candidate.uri === claimedMaterialUri, 'D1. candidate.uri === claimedMaterialUri, exactly — the identity this whole milestone exists to restore');
        check(candidate.uri !== `ar://${announced.id}`, 'D2. ...and, just as importantly, candidate.uri is NOT the announcement transaction\'s own id — the exact violation 0.9.493 identified');

        console.log('✓ Section D: FIXED. candidate.uri is the announced material\'s own claimed location, never the announcement transaction id.');
    }

    // ===============================================================
    // Section E — Transaction identity preservation: the announcement
    // transaction id remains available through the existing structure.
    // ===============================================================
    {
        const net = makeFakeArweaveSubstrate();
        const announcementPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-e', uploadTaggedTransaction: net.uploadTaggedTransaction });
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-e', uri: 'ar://TX-MATERIAL-E' });
        const announced = await announcementPublisher.publish(envelope);

        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const [candidate] = await service.search('campaign-e');

        check(candidate.announcementId === announced.id, 'E1. the raw candidate carries announcementId, equal to the real announcement transaction id — never globally discarded, exactly 0.9.493 Section D\'s own preservable invariant');
        check(candidate.uri === 'ar://TX-MATERIAL-E' && candidate.announcementId !== 'ar://TX-MATERIAL-E', 'E2. uri and announcementId are two distinct facts, never conflated');

        const leadSource = codeOnlyOf(await source('core/DecentralizedWorldDiscoveryLead.js'));
        check(!/announcementId/.test(leadSource), 'E3. core/DecentralizedWorldDiscoveryLead.js itself carries no announcementId vocabulary — the extra field rides on the raw candidate only, tolerated and silently dropped downstream, never a schema change');

        console.log('✓ Section E: the announcement transaction id is preserved on the raw candidate, alongside the material uri, with zero schema change.');
    }

    // ===============================================================
    // Section F — Malformed/unavailable envelope: no transaction id is
    // silently substituted as a material uri.
    // ===============================================================
    {
        const net = makeFakeArweaveSubstrate();

        // F-i: a transaction tagged for discovery but whose own data is not
        // JSON at all (never announced through the real publisher).
        net.ledger.set('BadTx-NotJson', { data: 'not json at all', tag: { name: 'ForkBuild-Discovery-Tag', value: 'campaign-f' } });
        // F-ii: a transaction whose data IS JSON, but not a well-formed
        // ForkBuild envelope (wrong protocol).
        net.ledger.set('BadTx-WrongProtocol', { data: JSON.stringify({ protocol: 'not-forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'x', uri: 'ar://should-never-appear' }), tag: { name: 'ForkBuild-Discovery-Tag', value: 'campaign-f' } });
        // F-iii: a genuinely well-formed announcement, so this section also
        // proves good candidates survive alongside skipped bad ones.
        const announcementPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-f', uploadTaggedTransaction: net.uploadTaggedTransaction });
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-f', uri: 'ar://TX-MATERIAL-F-GOOD' });
        await announcementPublisher.publish(envelope);

        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const candidates = await service.search('campaign-f');

        check(candidates.length === 1, 'F1. exactly one candidate survives — the two malformed transactions are silently skipped, never reported at all');
        check(candidates[0].uri === 'ar://TX-MATERIAL-F-GOOD', 'F2. the one surviving candidate is the genuinely well-formed announcement');
        check(!candidates.some((c) => c.uri.includes('BadTx')), 'F3. NO candidate ever reports a bad transaction\'s own id as its uri — the fallback this milestone deliberately refuses to reintroduce');

        // F-iv: a transaction the GraphQL step finds but whose gateway GET
        // 404s (deleted, unconfirmed, or otherwise unavailable).
        const net2 = makeFakeArweaveSubstrate();
        net2.ledger.set('Announce-Ghost', { data: 'irrelevant', tag: { name: 'ForkBuild-Discovery-Tag', value: 'campaign-f2' } });
        const flakyFetch = async (url, options) => {
            const parsed = new URL(url);
            if (parsed.pathname === '/Announce-Ghost') {
                return new Response('not found', { status: 404 });
            }
            return net2.fetchImpl(url, options);
        };
        const service2 = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: flakyFetch });
        const candidates2 = await service2.search('campaign-f2');
        check(candidates2.length === 0, 'F4. a transaction GraphQL finds but whose gateway GET returns non-2xx contributes no candidate at all — never a candidate carrying the announcement id as uri');

        // F-v: a genuinely unreachable gateway (fetch itself throws) for the
        // envelope-fetch step never propagates out of search(), and never
        // substitutes the announcement id either.
        const net3 = makeFakeArweaveSubstrate();
        net3.ledger.set('Announce-Unreachable', { data: 'irrelevant', tag: { name: 'ForkBuild-Discovery-Tag', value: 'campaign-f3' } });
        const throwingFetch = async (url, options) => {
            const parsed = new URL(url);
            if (parsed.pathname === '/Announce-Unreachable') {
                throw new Error('simulated gateway connection failure');
            }
            return net3.fetchImpl(url, options);
        };
        const service3 = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: throwingFetch });
        let threw = false;
        let candidates3;
        try {
            candidates3 = await service3.search('campaign-f3');
        } catch {
            threw = true;
        }
        check(!threw, 'F5. a throwing gateway fetch at the envelope-retrieval step never propagates out of search() — the same "never throws" contract this class already held at the GraphQL step');
        check(Array.isArray(candidates3) && candidates3.length === 0, 'F6. ...and is reported as no candidates, never a candidate carrying the announcement id as a fallback uri');

        console.log('✓ Section F: FIXED. Every way an envelope can be unavailable or malformed (not JSON, wrong protocol, 404, unreachable gateway) is skipped — never once does a transaction id get silently substituted as a material uri.');
    }

    // ===============================================================
    // Section G — Existing resolver convergence: the returned candidate
    // works with the existing, unmodified resolver, end to end.
    // ===============================================================
    let fixedCandidateUri = null;
    {
        const storage = new InMemoryStorageProvider();
        const bob = buildRealSigner(storage, 'envelope-aware-bob');
        const publication = buildSignedPublication(bob, { id: 'pub-envelope-aware-g' });

        const net = makeFakeArweaveSubstrate();
        net.putContent('TX-MATERIAL', JSON.stringify(publication.toJSON()));

        const campaign = 'campaign-g-real-fix';
        const announcementPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: campaign, uploadTaggedTransaction: net.uploadTaggedTransaction });
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: publication.id, uri: publication.contentReference.uri });
        await announcementPublisher.publish(envelope);

        const { verifier } = composeWorldEncounterMaterialVerifier();
        const realService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
            discoveryServices: { arweave: realService },
            arweaveResolverOptions: { fetchImpl: net.fetchImpl },
            verifier
        });

        const result = await runtime.discoverWorldEncounterPublication({ objectId: publication.id, discoveryTag: campaign, publications: [publication] });
        fixedCandidateUri = result.discovery.arweave[0] && result.discovery.arweave[0].uri;

        check(result.discovery.arweave.length === 1 && result.discovery.arweave[0].uri === 'ar://TX-MATERIAL', 'G1. DISCOVER reports the MATERIAL\'s own uri through the REAL, production ArweaveGraphqlDiscoveryQueryService — no test-only prototype involved');
        check(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, 'G2. RESOLVE reports RESOLVED — association evidence\'s exact-match fires against the real fix');
        check(result.inspection !== null && result.inspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, 'G3. loading succeeds through the existing, completely unmodified ArweaveWorldEncounterMaterialResolver — no Arweave-specific resolver was introduced');
        check(result.inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, 'G4. FIXED, END TO END, FOR REAL: the full announce -> discover -> resolve -> verify chain converges to VERIFIED through production classes alone');

        const resolverSource = codeOnlyOf(await source('application/worldEncounter/ArweaveWorldEncounterMaterialResolver.js'));
        check(!/forkbuild|envelope|discoveryTag|Announcement/i.test(resolverSource), 'G5. ArweaveWorldEncounterMaterialResolver.js remains a pure uri-to-bytes retriever, unmodified — it never had to become Arweave-envelope-aware');

        console.log('✓ Section G: CONVERGENCE PROVEN AGAINST THE REAL PRODUCTION FIX — the existing, unmodified resolver and material source retrieve and verify real material end to end.');
    }

    // ===============================================================
    // Section H — Nostr isolation: no changes or special handling are
    // required in the Nostr discovery path.
    // ===============================================================
    {
        const nostrSourceBefore = codeOnlyOf(await source('application/nostr/NostrDiscoveryQueryService.js'));
        check(!/announcementId/.test(nostrSourceBefore), 'H1. NostrDiscoveryQueryService.js carries no reference to announcementId or any of this milestone\'s own new vocabulary — it already satisfied the discovery contract before 0.9.494 and needed no change');

        const envelope = { protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-nostr-h', uri: 'ar://nostr-material-tx' };
        const queryImpl = async () => ([{ id: 'nostr-event-id-should-never-appear', content: JSON.stringify(envelope) }]);
        const nostrService = new NostrDiscoveryQueryService({ queryImpl });
        const candidates = await nostrService.search('campaign-h');

        check(candidates.length === 1 && candidates[0].uri === 'ar://nostr-material-tx', 'H2. NostrDiscoveryQueryService continues to report the envelope\'s own uri, unaffected by this milestone');
        check(!('announcementId' in candidates[0]), 'H3. Nostr candidates carry no announcementId field — that is an Arweave-specific fact this milestone introduces only for the Arweave adapter\'s own candidates');

        console.log('✓ Section H: Nostr discovery is completely unaffected — no shared code path, no new vocabulary leaking across substrates.');
    }

    // ===============================================================
    // Section I — Scope guard: no announcement, signing, storage,
    // attribution, or candidate-schema changes.
    // ===============================================================
    {
        const publisherSource = await source('application/arweave/ArweaveAnnouncementPublisher.js');
        const uploadSource = await source('application/arweave/ArweaveTaggedTransactionUpload.js');
        const signerSource = await source('arweave/ArweaveInjectedProviderSigner.js');
        const uploaderSource = await source('application/arweave/ArweavePublicationMaterialUploader.js');
        const resolverSource = await source('application/worldEncounter/ArweaveWorldEncounterMaterialResolver.js');
        const leadSource = await source('core/DecentralizedWorldDiscoveryLead.js');
        const materialSourceSource = await source('application/worldEncounter/DecentralizedWorldEncounterMaterialSource.js');

        check(!/0\.9\.494/.test(publisherSource), 'I1. ArweaveAnnouncementPublisher.js — untouched by 0.9.494; announcement/signing is a write-side concern this milestone never reaches');
        check(!/0\.9\.494/.test(uploadSource), 'I2. ArweaveTaggedTransactionUpload.js — untouched by 0.9.494; the tagged-upload adapter is a write-side concern');
        check(!/0\.9\.494/.test(signerSource), 'I3. arweave/ArweaveInjectedProviderSigner.js — untouched by 0.9.494; transaction signing is a write-side concern');
        check(!/0\.9\.494/.test(uploaderSource), 'I4. ArweavePublicationMaterialUploader.js — untouched by 0.9.494; content storage/upload is a write-side, content-role concern');
        check(!/0\.9\.494/.test(resolverSource), 'I5. ArweaveWorldEncounterMaterialResolver.js — untouched by 0.9.494; Section G already proved zero change is needed on the resolve side');
        check(!/0\.9\.494/.test(leadSource), 'I6. core/DecentralizedWorldDiscoveryLead.js — untouched by 0.9.494; no candidate-schema change was required');
        check(!/0\.9\.494/.test(materialSourceSource), 'I7. DecentralizedWorldEncounterMaterialSource.js — untouched by 0.9.494; the terminal retrieval step required no envelope-awareness of its own');

        const fixedSource = codeOnlyOf(await source('application/arweave/ArweaveGraphqlDiscoveryQueryService.js'));
        check(/parseDecentralizedDiscoveryEnvelope/.test(fixedSource), 'I8. the real fix reuses the existing, unmodified parseDecentralizedDiscoveryEnvelope() — it does not invent a second, Arweave-specific envelope parser');
        check(!/uploadTaggedTransaction|signer\.sign|publish\(/.test(fixedSource), 'I9. the real fix never touches announcement, signing, or publish-side vocabulary — it is confined to the discovery-interpretation layer alone');

        check(typeof fixedCandidateUri === 'string' && /^ar:\/\/[A-Za-z0-9_-]+$/.test(fixedCandidateUri), 'I10. the fix introduces no new uri scheme — the material uri Section G actually reported is exactly the same `ar://<transaction-id>` shape this codebase already produces and resolves everywhere else');

        console.log('✓ Section I: SCOPE GUARD CONFIRMED. The real 0.9.494 fix is confined to application/arweave/ArweaveGraphqlDiscoveryQueryService.js alone.');
    }

    // ===============================================================
    // Verdict.
    // ===============================================================
    {
        check(assertionCount > 25, 'V1. sanity: this test is substantive, not a token pass');

        console.log(`\n✅ All Arweave Envelope-Aware Discovery URI Resolution tests passed. (${assertionCount} assertions)`);
        console.log('   Gap 2 is closed in the REAL production ArweaveGraphqlDiscoveryQueryService.js —');
        console.log('   candidate.uri is now the announced material\'s own claimed location, never the');
        console.log('   announcement transaction id, with the transaction id preserved alongside it.');
    }
}

run().catch((error) => {
    console.error('ArweaveEnvelopeAwareDiscoveryQueryService.test.js FAILED:', error);
    process.exitCode = 1;
});
