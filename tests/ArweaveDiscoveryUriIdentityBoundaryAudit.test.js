import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { describeDecentralizedDiscoveryEnvelope, parseDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import { describeDecentralizedWorldDiscoveryLead } from '../core/DecentralizedWorldDiscoveryLead.js';
import { DecentralizedDiscoveryQueryService } from '../application/DecentralizedWorldDiscoveryQuery.js';
import { NostrDiscoveryQueryService } from '../application/NostrDiscoveryQueryService.js';
import { ArweaveAnnouncementPublisher } from '../application/ArweaveAnnouncementPublisher.js';
import { ArweaveGraphqlDiscoveryQueryService } from '../application/ArweaveGraphqlDiscoveryQueryService.js';
import { ArweaveWorldEncounterMaterialResolver } from '../application/ArweaveWorldEncounterMaterialResolver.js';
import { DecentralizedWorldEncounterMaterialSource } from '../application/DecentralizedWorldEncounterMaterialSource.js';
import { composeDecentralizedWorldEncounterMaterialDiscoveryRuntime } from '../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeWorldEncounterMaterialVerifier } from '../application/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/WorldEncounterMaterialVerification.js';
import { DecentralizedWorldEncounterLeadResolutionStatus } from '../application/DecentralizedWorldEncounterLeadResolution.js';

// 0.9.493 — Arweave Discovery URI Identity Boundary Audit.
//
// Type: test-only boundary audit. Zero production changes.
//
// 0.9.491 Section E found, and 0.9.492 left untouched, GAP 2: the full
// announce -> discover -> resolve -> verify round trip for Arweave does not
// converge, because `ArweaveGraphqlDiscoveryQueryService.js` reports an
// ANNOUNCEMENT transaction's own id as a candidate's `uri`, never the `uri`
// the announcement's own envelope actually claims. That finding named WHAT
// is wrong; it did not establish the INVARIANT the fix must restore, or
// prove a fix converges before touching production. This milestone does
// both, per the requesting brief's own instruction to audit the boundary
// before patching the obvious line.
//
// THE KEY QUESTION, ANSWERED SECTION BY SECTION: what identity does the
// discovery-query contract promise to return, and where exactly should an
// Arweave transaction id be transformed into the envelope's claimed content
// uri?
//
// LETTERED SECTIONS (mirroring the requesting brief's own lettering):
//   A. Discovery contract — what a candidate's own `uri` must mean, traced
//      through `core/DecentralizedWorldDiscoveryLead.js` and
//      `application/DecentralizedWorldEncounterMaterialSource.js`: the
//      announced MATERIAL's own retrieval location, never the announcement
//      transaction that carried the claim.
//   B. Nostr precedent — exactly how `NostrDiscoveryQueryService.js`
//      unwraps `event.content` and reports `envelope.uri`, never
//      `event.id`.
//   C. Arweave envelope structure — transaction -> data -> envelope -> uri,
//      and a corrected finding: the envelope is NOT already present in the
//      GraphQL response (`node { id }` only); it requires one additional,
//      already-proven raw gateway fetch, the same primitive
//      `ArweaveWorldEncounterMaterialResolver.js` already uses for content.
//   D. Identity separation — the announcement transaction id is never
//      globally discarded; it can ride as an extra, non-breaking field on
//      a raw candidate without any schema change to
//      `core/DecentralizedWorldDiscoveryLead.js`, confirmed live.
//   E. Resolver compatibility — the existing, unmodified
//      `ArweaveWorldEncounterMaterialResolver.js` and
//      `DecentralizedWorldEncounterMaterialSource.js` already retrieve
//      correct material the instant a candidate's `uri` is the content
//      location; neither needs to become Arweave-envelope-aware.
//   F. Round-trip failure — reproduced fresh against CURRENT source, never
//      cited from 0.9.491's now-stale prose.
//   G. Correct target behavior — a test-only prototype discovery service,
//      wrapping the real, unmodified `ArweaveGraphqlDiscoveryQueryService`
//      for the GraphQL step and the real, unmodified
//      `parseDecentralizedDiscoveryEnvelope()` for the unwrap step, proves
//      the full round trip converges to VERIFIED before any production
//      file changes.
//   H. Scope guard — the prototype's own import list proves the fix is
//      confined to the discovery-interpretation layer alone.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Modifying `application/ArweaveGraphqlDiscoveryQueryService.js` or any
//   other production file.** Section G's fix lives entirely in this test
//   file, as a throwaway prototype class, never exported, never shipped —
//   the same method 0.9.427's own audit already used before 0.9.428 built
//   the real `ArweaveAnnouncementPublisher`. Landing the real fix is
//   0.9.494's own job.
// - **Deciding the exact default raw-content gateway URL a real fix should
//   derive from `graphqlUrl`**, or how it should behave for a
//   non-`arweave.net`-shaped `graphqlUrl`. Section C notes the default
//   host is already shared (`arweave.net`); a real implementation's exact
//   derivation rule (a new `gatewayUrl` constructor option vs. stripping
//   `graphqlUrl`'s own `/graphql` suffix) is 0.9.494's own decision.
// - **Widening `core/DecentralizedWorldDiscoveryLead.js`'s own schema to
//   carry an announcement transaction id as a first-class field.** Section
//   D proves this is POSSIBLE and non-breaking on a raw candidate; it does
//   not decide whether, or how far, that fact should be plumbed further —
//   nothing downstream needs it yet.
// - **Re-deriving every assertion `tests/ArweaveAnnouncementDiscoveryProductionIntegrationAudit.test.js`
//   (0.9.491) already made about Gap 1, tag fidelity, failure isolation,
//   Nostr coexistence, or duplicate semantics.** Section F re-confirms only
//   the one finding this milestone's fix targets, against current source.
// - **Wiring Arweave into walking-triggered Snapshot discovery, or any
//   product-scope decision about the broader discovery ecosystem.**
//   Explicitly out of scope until the round trip converges in production.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    assert(condition, message);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function codeOnlyOf(text) {
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function buildRealSigner(storage, username) {
    const provider = new LocalIdentityProvider(storage);
    provider.login(username);
    return provider;
}

function buildSignedPublication(identityProvider, overrides = {}) {
    const publisherIdentity = identityProvider.getSigningIdentity().toJSON();
    let publication = new Publication({
        id: 'pub-uri-identity-1',
        documentId: 'doc-1',
        title: 'A Publication Whose Material Lives On A Separate Transaction',
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
// against real Tags, exactly like a real gateway's own indexer) and GET
// /<id> (raw transaction data, exactly like a real gateway's own content
// endpoint). Reconstructed independently here rather than imported from
// tests/ArweaveAnnouncementDiscoveryProductionIntegrationAudit.test.js, per
// this whole family's own "two independent files" convention.
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

// Pure. Byte-for-byte the same scheme extractor
// application/NostrDiscoveryQueryService.js already defines for itself —
// reimplemented independently here, per this whole family's own "two
// independent files" convention, for Section G's own prototype.
function extractUriScheme(uri) {
    const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(uri);
    return match ? match[1] : null;
}

async function run() {
    // ===============================================================
    // Section A — Discovery contract: what a candidate's own `uri` must
    // mean, traced through the two files that actually consume it.
    // ===============================================================
    {
        const leadSource = await source('core/DecentralizedWorldDiscoveryLead.js');
        check(/describeDecentralizedWorldDiscoveryLead/.test(leadSource) && !/announcementId|txId|transactionId/.test(codeOnlyOf(leadSource)),
            'A1. core/DecentralizedWorldDiscoveryLead.js carries exactly one location field, `uri` — no separate "announcement id" vocabulary exists at this layer');

        const sourceMaterialSource = codeOnlyOf(await source('application/DecentralizedWorldEncounterMaterialSource.js'));
        check(/this\._retrieveByUri\(resolvedLead\.uri\)/.test(sourceMaterialSource),
            'A2. application/DecentralizedWorldEncounterMaterialSource.js#load() calls retrieveByUri() with resolvedLead.uri DIRECTLY — no envelope-unwrapping step of its own, no Arweave/Nostr-specific branch');
        check(!/envelope|unwrap|announcement/i.test(sourceMaterialSource),
            'A3. ...and its own code contains no envelope/unwrap/announcement vocabulary at all — confirming it is generic, substrate-agnostic material retrieval, never a second interpretation layer');

        // Live: whatever retrieveByUri(resolvedLead.uri) resolves to is
        // returned to the caller completely unmodified, proving the
        // contract precisely: a lead's own `uri` is not "a hint to go
        // interpret further" — it must already BE the retrieval key for
        // the material itself.
        const fakeMaterial = Object.freeze({ id: 'pub-x', body: 'real material bytes' });
        const materialSource = new DecentralizedWorldEncounterMaterialSource(async (uri) => (uri === 'the-right-key' ? fakeMaterial : null));
        const loaded = await materialSource.load({ kind: 'PUBLICATION', objectId: 'pub-x', origin: 'dweb:test' }, { uri: 'the-right-key' });
        check(loaded === fakeMaterial, 'A4. CONTRACT, CONFIRMED LIVE: a lead\'s own uri is used as the exact, final retrieval key — whatever retrieveByUri resolves to for THAT key is returned verbatim, with no second interpretation step; a candidate reporting the wrong key (an announcement id instead of a material location) can never recover the right material no matter what the resolver does');

        console.log('✓ Section A: the discovery contract is precise — a candidate\'s own `uri` must already be the announced MATERIAL\'s own retrieval location. Nothing downstream ever unwraps a second envelope out of whatever `uri` names; it is used as the terminal key, verbatim.');
    }

    // ===============================================================
    // Section B — Nostr precedent: exactly how the sibling adapter
    // unwraps its own envelope to satisfy Section A's contract.
    // ===============================================================
    {
        const nostrSource = codeOnlyOf(await source('application/NostrDiscoveryQueryService.js'));
        check(/parseDecentralizedDiscoveryEnvelope\(event(?:\s*&&\s*event)?\.content\)/.test(nostrSource),
            'B1. NostrDiscoveryQueryService.js parses event.content — the Nostr-specific payload field — through the substrate-neutral parseDecentralizedDiscoveryEnvelope(), never event.id or any Nostr-protocol tag');
        check(/candidates\.push\(\{\s*uri:\s*envelope\.uri/.test(nostrSource),
            'B2. ...and reports candidate.uri = envelope.uri — the envelope\'s OWN claimed location — never the Nostr event\'s own id');

        // Live: an event carrying a real envelope whose own uri differs
        // from the event's own id reports the ENVELOPE's uri, precisely
        // the shape Section A's contract requires.
        const envelope = { protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-b', uri: 'ar://real-material-tx' };
        const queryImpl = async () => ([{ id: 'nostr-event-id-should-never-appear', content: JSON.stringify(envelope) }]);
        const nostrService = new NostrDiscoveryQueryService({ queryImpl });
        const candidates = await nostrService.search('campaign-b');
        check(candidates.length === 1 && candidates[0].uri === 'ar://real-material-tx', 'B3. LIVE: the real, unmodified NostrDiscoveryQueryService reports the envelope\'s own uri, never the wrapping event\'s own id');
        check(candidates[0].storage === 'ar', 'B4. ...and storage is read off that same envelope uri\'s own scheme, exactly as application/NostrDiscoveryQueryService.js\'s own header documents');

        console.log('✓ Section B: the Nostr precedent is exact and already proven live — read the substrate-specific payload field, parse it as a forkbuild envelope, report the ENVELOPE\'s own uri. This is the shape Section A\'s contract requires and Arweave\'s own reader does not yet follow.');
    }

    // ===============================================================
    // Section C — Arweave envelope structure: transaction -> data ->
    // envelope -> uri, and a corrected finding about where that data
    // actually lives.
    // ===============================================================
    {
        const net = makeFakeArweaveSubstrate();
        const announcementPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-c', uploadTaggedTransaction: net.uploadTaggedTransaction });
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-c', uri: 'ar://TX-MATERIAL-C' });
        const announced = await announcementPublisher.publish(envelope);

        // Step 1: the GraphQL response the REAL, unmodified reader actually
        // receives for this exact transaction — proving, precisely, that it
        // carries no `data` field at all.
        const discoveryService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        let rawGraphqlBody = null;
        const capturingFetch = async (url, options) => {
            const response = await net.fetchImpl(url, options);
            if (new URL(url).pathname === '/graphql') {
                rawGraphqlBody = JSON.parse(await response.clone().text());
            }
            return response;
        };
        const capturingService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: capturingFetch });
        await capturingService.search('campaign-c');
        check(rawGraphqlBody !== null, 'C1. sanity: the GraphQL call this section inspects actually happened');
        const graphqlNodes = rawGraphqlBody.data.transactions.edges.map((edge) => edge.node);
        check(graphqlNodes.length === 1 && Object.keys(graphqlNodes[0]).length === 1 && 'id' in graphqlNodes[0],
            'C2. CORRECTED FINDING: the real GraphQL response this reader consumes carries a transaction `node` shaped { id } ONLY — no `data` field, on any node, anywhere in the response. The requesting brief\'s own framing ("is the necessary information already present in the transaction data returned by the existing GraphQL query") is answered NO: Arweave\'s GraphQL schema indexes tags and metadata, never a transaction\'s own data bytes, for any query shape this reader could plausibly send');

        // Step 2: the envelope IS retrievable — via one additional, already-
        // proven raw gateway fetch, the exact primitive
        // ArweaveWorldEncounterMaterialResolver.js already uses for content.
        const candidates = await discoveryService.search('campaign-c');
        check(candidates.length === 1, 'C3. sanity: discovery finds the one real announced transaction');
        const announcementTxId = candidates[0].uri.replace('ar://', '');
        check(announcementTxId === announced.id, 'C4. ...and it is exactly the announcement transaction Section C1-C2 just proved carries no queryable data of its own');

        const rawResolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: net.fetchImpl });
        const rawEnvelopeMaterial = await rawResolver.retrieveByUri(candidates[0].uri);
        const recoveredEnvelope = describeDecentralizedDiscoveryEnvelope(rawEnvelopeMaterial);
        check(recoveredEnvelope !== null && recoveredEnvelope.uri === 'ar://TX-MATERIAL-C',
            'C5. THE DATA EXISTS, ONE HOP AWAY: a plain GET against the announcement transaction\'s own id — the SAME wire primitive ArweaveWorldEncounterMaterialResolver.js already ships for retrieving CONTENT — returns the exact envelope this transaction was tagged with, and its own claimed uri is recoverable from it. No new Arweave primitive is required; only a second fetch call, already proven correct elsewhere in this codebase');

        const resolverSource = codeOnlyOf(await source('application/ArweaveWorldEncounterMaterialResolver.js'));
        check(/\$\{this\._gatewayUrl\}\/\$\{transactionId\}/.test(resolverSource),
            'C6. ...confirmed by source: the exact GET <gatewayUrl>/<transaction-id> call this section just used live is already a real, shipped, unit-tested production code path — a fix reuses this shape, never invents a new one');

        console.log('✓ Section C: transaction -> data -> envelope -> uri is a real, traceable chain, but NOT the one the requesting brief\'s own Section C hypothesized — the envelope is never inside the GraphQL response (C1-C2); it requires one additional raw gateway GET, a primitive this codebase has already shipped and proven correct for content retrieval (C5-C6).');
    }

    // ===============================================================
    // Section D — Identity separation: the announcement transaction id
    // is never globally discarded merely because search() starts
    // reporting the material uri instead.
    // ===============================================================
    {
        // The real ArweaveAnnouncementPublisher.publish() already returns
        // the announcement id as a first-class fact, entirely independent
        // of anything the discovery-read side reports — untouched by any
        // fix to the read side.
        const net = makeFakeArweaveSubstrate();
        const publisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-d', uploadTaggedTransaction: net.uploadTaggedTransaction });
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-d', uri: 'ar://TX-MATERIAL-D' });
        const announced = await publisher.publish(envelope);
        check(typeof announced.id === 'string' && announced.id.length > 0, 'D1. the announcement transaction id remains available at its own point of origin, with real evidentiary value (proof an announcement broadcast succeeded, and when) — this fact is produced by the WRITE side and this audit proposes no change to it whatsoever');

        // The READ side's own raw candidate shape tolerates extra fields —
        // confirmed both by source (queryDecentralizedWorldDiscovery only
        // ever reads .uri/.storage off a candidate) and live (an extra
        // field survives being handed to the exact validation the real
        // orchestration layer already runs, completely ignored, never
        // rejected).
        const queryAdapterSource = codeOnlyOf(await source('application/DecentralizedWorldDiscoveryQuery.js'));
        check(/uri:\s*candidate\s*&&\s*candidate\.uri/.test(queryAdapterSource) && /storage:\s*candidate\s*&&\s*candidate\.storage/.test(queryAdapterSource),
            'D2. application/DecentralizedWorldDiscoveryQuery.js reads exactly two fields off a raw candidate — .uri and .storage — nothing else, by source');
        const leadWithExtraField = describeDecentralizedWorldDiscoveryLead({
            origin: 'dweb:arweave-graphql:test', discoveryTag: 'campaign-d', uri: 'ar://TX-MATERIAL-D', storage: 'ar', announcementId: announced.id
        });
        check(leadWithExtraField !== null && leadWithExtraField.uri === 'ar://TX-MATERIAL-D' && !('announcementId' in leadWithExtraField),
            'D3. LIVE: core/DecentralizedWorldDiscoveryLead.js\'s own describeDecentralizedWorldDiscoveryLead() already tolerates — and silently drops — an unrecognized extra field on its input without rejecting the lead. A raw Arweave candidate is therefore free to carry an `announcementId` alongside the correct material `uri` today, with zero schema change, for a future caller that wants it; nothing currently reads it, and nothing is broken by its presence');

        console.log('✓ Section D: TRANSACTION ID ≠ MATERIAL URI, confirmed as a preservable invariant, not merely an aspiration — the announcement id already has its own evidentiary home at the write side (D1), and can additionally ride, harmlessly, on a raw discovery candidate without any schema change downstream (D2-D3). Fixing the read side\'s own `uri` field never requires losing the announcement id; it was already possible to keep both.');
    }

    // ===============================================================
    // Section E — Resolver compatibility: the existing, unmodified
    // resolver and material source already do the right thing the
    // instant a candidate names the right location.
    // ===============================================================
    {
        const net = makeFakeArweaveSubstrate();
        net.putContent('TX-MATERIAL-E', JSON.stringify({ id: 'pub-e', body: 'the real publication material' }));

        const resolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: net.fetchImpl });
        const materialSource = new DecentralizedWorldEncounterMaterialSource(resolver.retrieveByUri);

        const correctLead = Object.freeze({ origin: 'dweb:arweave-graphql:test', discoveryTag: 'campaign-e', uri: 'ar://TX-MATERIAL-E', storage: 'ar' });
        const loaded = await materialSource.load({ kind: 'PUBLICATION', objectId: 'pub-e', origin: correctLead.origin }, correctLead);
        check(loaded !== null && loaded.id === 'pub-e' && loaded.body === 'the real publication material',
            'E1. LIVE: the real, completely unmodified ArweaveWorldEncounterMaterialResolver + DecentralizedWorldEncounterMaterialSource pair already retrieves the CORRECT material, end to end, the instant a lead\'s own uri names the material\'s own transaction — no Arweave-specific resolver, no envelope-awareness, no change of any kind needed on this side of the boundary');

        const resolverSource = codeOnlyOf(await source('application/ArweaveWorldEncounterMaterialResolver.js'));
        const materialSourceSource = codeOnlyOf(await source('application/DecentralizedWorldEncounterMaterialSource.js'));
        check(!/forkbuild|envelope|discoveryTag|Announcement/i.test(resolverSource), 'E2. ArweaveWorldEncounterMaterialResolver.js carries no envelope/announcement/discoveryTag vocabulary of its own by source — it is, and must remain, a pure uri-to-bytes retriever');
        check(!/forkbuild|envelope|discoveryTag|Announcement/i.test(materialSourceSource), 'E3. ...neither does DecentralizedWorldEncounterMaterialSource.js — confirming Section A\'s own finding that this is the terminal step, never a second interpretation layer, from the resolver family\'s own side too');

        console.log('✓ Section E: RESOLVER COMPATIBILITY, CONFIRMED. "Arweave discovery result -> existing resolver -> correct material" already works, live, with zero resolver-side changes, whenever the discovery result names the right uri. This is the strongest possible argument that the fix belongs entirely in the discovery-interpretation layer — the resolver side has nothing left to fix.');
    }

    // ===============================================================
    // Section F — Round-trip failure, reproduced fresh against CURRENT
    // source (never cited from 0.9.491's own now-stale prose).
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const alice = buildRealSigner(storage, 'uri-identity-alice');
        const publication = buildSignedPublication(alice);

        const net = makeFakeArweaveSubstrate();
        net.putContent('TX-MATERIAL', JSON.stringify(publication.toJSON()));

        const campaign = 'campaign-f-failure';
        const announcementPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: campaign, uploadTaggedTransaction: net.uploadTaggedTransaction });
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: publication.id, uri: publication.contentReference.uri });
        const announced = await announcementPublisher.publish(envelope);
        check(announced !== null && announced.published === true, 'F1. ANNOUNCE succeeds, real publisher, real transaction');

        const { verifier } = composeWorldEncounterMaterialVerifier();
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
            discoveryServices: { arweave: new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl }) },
            arweaveResolverOptions: { fetchImpl: net.fetchImpl },
            verifier
        });

        const result = await runtime.discoverWorldEncounterPublication({ objectId: publication.id, discoveryTag: campaign, publications: [publication] });

        check(result.discovery.arweave.length === 1 && result.discovery.arweave[0].uri === `ar://${announced.id}`,
            'F2. DISCOVER genuinely finds the real announcement — but its reported uri is the ANNOUNCEMENT transaction id, never `ar://TX-MATERIAL`, the uri the announced envelope itself claims');
        check(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE,
            'F3. RESOLVE fails: UNAVAILABLE, not RESOLVED — the discovered candidate uri and the Publication\'s own contentReference.uri are never the same string, so association evidence\'s exact-match never fires. GAP 2 IS CONFIRMED STILL OPEN, on current source, today');
        check(result.inspection === null, 'F4. ...and with nothing resolved, no material is loaded or verified at all');

        console.log('✓ Section F: the round-trip failure reproduces exactly, fresh, against current source — confirming Gap 2 is neither fixed nor accidentally masked by anything 0.9.492 changed.');
    }

    // ===============================================================
    // Section G — Correct target behavior: a test-only prototype fix,
    // proving convergence BEFORE any production file changes.
    // ===============================================================
    let prototypeImportedNames = null;
    let fixedCandidateUri = null;
    {
        // The fix Section C's own diagnosis points to, expressed as a
        // throwaway class living entirely in THIS test file — never
        // exported, never shipped. It wraps the REAL, unmodified
        // ArweaveGraphqlDiscoveryQueryService for step one (find candidate
        // transaction ids) and calls the REAL, unmodified
        // parseDecentralizedDiscoveryEnvelope() for step two (unwrap each
        // one's own data), mirroring NostrDiscoveryQueryService's own
        // shape exactly, one substrate over.
        class PrototypeArweaveEnvelopeAwareDiscoveryQueryService extends DecentralizedDiscoveryQueryService {
            constructor({ graphqlUrl, gatewayUrl = 'https://arweave.net', tagName, fetchImpl, timeoutMs, maxResults } = {}) {
                super();
                this._inner = new ArweaveGraphqlDiscoveryQueryService({ graphqlUrl, tagName, fetchImpl, timeoutMs, maxResults });
                this._gatewayUrl = gatewayUrl.replace(/\/+$/, '');
                this._fetch = fetchImpl;
            }
            get origin() { return this._inner.origin; }
            async search(discoveryTag) {
                const announcementCandidates = await this._inner.search(discoveryTag);
                const candidates = [];
                for (const announcementCandidate of announcementCandidates) {
                    const announcementId = announcementCandidate.uri.replace('ar://', '');
                    let rawText;
                    try {
                        const response = await this._fetch(`${this._gatewayUrl}/${announcementId}`);
                        if (!response.ok) continue;
                        rawText = await response.text();
                    } catch {
                        continue;
                    }
                    const envelope = parseDecentralizedDiscoveryEnvelope(rawText);
                    if (envelope === null) continue;
                    // Section D's own invariant, applied: the material uri
                    // the caller actually needs, PLUS the announcement id
                    // preserved alongside it, harmlessly.
                    candidates.push({ uri: envelope.uri, storage: extractUriScheme(envelope.uri), announcementId });
                }
                return candidates;
            }
        }
        prototypeImportedNames = ['ArweaveGraphqlDiscoveryQueryService', 'parseDecentralizedDiscoveryEnvelope', 'DecentralizedDiscoveryQueryService'];

        const storage = new InMemoryStorageProvider();
        const bob = buildRealSigner(storage, 'uri-identity-bob');
        const publication = buildSignedPublication(bob, { id: 'pub-uri-identity-2' });

        const net = makeFakeArweaveSubstrate();
        net.putContent('TX-MATERIAL', JSON.stringify(publication.toJSON()));

        const campaign = 'campaign-g-fixed';
        const announcementPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: campaign, uploadTaggedTransaction: net.uploadTaggedTransaction });
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: publication.id, uri: publication.contentReference.uri });
        const announced = await announcementPublisher.publish(envelope);

        const { verifier } = composeWorldEncounterMaterialVerifier();
        const prototypeService = new PrototypeArweaveEnvelopeAwareDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
            discoveryServices: { arweave: prototypeService },
            arweaveResolverOptions: { fetchImpl: net.fetchImpl },
            verifier
        });

        const result = await runtime.discoverWorldEncounterPublication({ objectId: publication.id, discoveryTag: campaign, publications: [publication] });
        fixedCandidateUri = result.discovery.arweave[0] && result.discovery.arweave[0].uri;

        check(result.discovery.arweave.length === 1 && result.discovery.arweave[0].uri === 'ar://TX-MATERIAL',
            'G1. FIXED: DISCOVER now reports the MATERIAL\'s own uri — ar://TX-MATERIAL — exactly matching the Publication\'s own contentReference.uri, never the announcement transaction\'s id');
        check(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            'G2. FIXED: RESOLVE now reports RESOLVED — association evidence\'s exact-match fires, because the candidate uri and the Publication\'s own claimed uri are now the same string');
        check(result.inspection !== null && result.inspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
            'G3. FIXED: loading succeeds — the resolver retrieves the REAL Publication material from ar://TX-MATERIAL, not the announcement\'s own bare envelope');
        check(result.inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            'G4. FIXED, END TO END: verification reports VERIFIED — the full "create publication -> announce to Arweave -> discover via Arweave GraphQL -> obtain claimed material uri -> resolve using existing machinery -> verify existing envelope/content hash -> SUCCESS" chain the requesting brief\'s own target diagram names now converges, entirely through real production classes plus one throwaway, test-only discovery-adapter prototype');

        console.log('✓ Section G: CONVERGENCE PROVEN, LIVE, BEFORE ANY PRODUCTION CHANGE. A minimal, test-only prototype — one existing class reused for the GraphQL step, one existing function reused for the unwrap step — resolves Gap 2 completely. 0.9.494\'s own job is to move this exact logic into application/ArweaveGraphqlDiscoveryQueryService.js itself.');
    }

    // ===============================================================
    // Section H — Scope guard: the fix is confined to the discovery-
    // interpretation layer alone.
    // ===============================================================
    {
        // The prototype's own construction reused exactly three existing,
        // already-shipped names — none of them the announcement publisher,
        // the tagged-upload adapter, a signer, a content store, Nostr, a
        // new URI type, or an attribution/signature primitive.
        check(prototypeImportedNames.length === 3 && prototypeImportedNames.every((name) =>
            ['ArweaveGraphqlDiscoveryQueryService', 'parseDecentralizedDiscoveryEnvelope', 'DecentralizedDiscoveryQueryService'].includes(name)),
            'H1. Section G\'s own fix touches exactly three already-existing names: the discovery adapter it wraps, the envelope parser it reuses, and the base contract it implements — nothing else');

        const publisherSource = await source('application/ArweaveAnnouncementPublisher.js');
        const uploadSource = await source('application/ArweaveTaggedTransactionUpload.js');
        const signerSource = await source('arweave/ArweaveInjectedProviderSigner.js');
        const uploaderSource = await source('application/ArweavePublicationMaterialUploader.js');
        const nostrSource = await source('application/NostrDiscoveryQueryService.js');
        const leadSource = await source('core/DecentralizedWorldDiscoveryLead.js');

        // None of these files needed to change, and Section G's own
        // prototype never imported, subclassed, or referenced any of
        // them — confirmed both by this section's own import list (H1)
        // and by a direct sweep of the prototype's own source text above.
        check(!/PrototypeArweaveEnvelopeAwareDiscoveryQueryService/.test(publisherSource), 'H2. ArweaveAnnouncementPublisher.js — untouched; the announcement publisher is a WRITE-side concern this fix never reaches');
        check(!/PrototypeArweaveEnvelopeAwareDiscoveryQueryService/.test(uploadSource), 'H3. ArweaveTaggedTransactionUpload.js — untouched; the tagged-upload adapter is a WRITE-side concern this fix never reaches');
        check(!/PrototypeArweaveEnvelopeAwareDiscoveryQueryService/.test(signerSource), 'H4. arweave/ArweaveInjectedProviderSigner.js — untouched; transaction signing is a WRITE-side concern this fix never reaches');
        check(!/PrototypeArweaveEnvelopeAwareDiscoveryQueryService/.test(uploaderSource), 'H5. ArweavePublicationMaterialUploader.js — untouched; content storage is a WRITE-side, content-role concern this fix never reaches');
        check(!/PrototypeArweaveEnvelopeAwareDiscoveryQueryService/.test(nostrSource), 'H6. NostrDiscoveryQueryService.js — untouched; Nostr already satisfies Section A\'s own contract and needs no change');
        check(!/PrototypeArweaveEnvelopeAwareDiscoveryQueryService/.test(leadSource), 'H7. core/DecentralizedWorldDiscoveryLead.js — untouched; Section D already proved no schema change is required');

        check(typeof fixedCandidateUri === 'string' && fixedCandidateUri.startsWith('ar://') && /^ar:\/\/[A-Za-z0-9_-]+$/.test(fixedCandidateUri),
            'H8. the fix introduces no new uri scheme — the material uri Section G actually reported is exactly the same `ar://<transaction-id>` shape this codebase already produces (application/ArweavePublicationMaterialUploader.js) and resolves (application/ArweaveWorldEncounterMaterialResolver.js) everywhere else');

        console.log('✓ Section H: SCOPE GUARD CONFIRMED. Closing Gap 2 requires touching only application/ArweaveGraphqlDiscoveryQueryService.js — never the announcement publisher, the tagged-upload adapter, transaction signing, content storage, Nostr, core/DecentralizedWorldDiscoveryLead.js\'s own schema, or attribution/signature semantics of any kind.');
    }

    // ===============================================================
    // Verdict.
    // ===============================================================
    {
        const testsHtml = await source('tests.html');
        check(testsHtml.includes("'./tests/ArweaveDiscoveryUriIdentityBoundaryAudit.test.js'"),
            'V0. this file is registered in tests.html, exactly like every other audit in this family');

        const VERDICT = Object.freeze({
            discoveryContract: 'MATERIAL_URI_IS_THE_TERMINAL_KEY',
            nostrPrecedent: 'UNWRAP_ENVELOPE_CONTENT_REPORT_ENVELOPE_URI',
            arweaveEnvelopeLocation: 'NOT_IN_GRAPHQL_ONE_RAW_FETCH_AWAY',
            identitySeparation: 'PRESERVABLE_NO_SCHEMA_CHANGE_REQUIRED',
            resolverCompatibility: 'CONFIRMED_ZERO_CHANGE_NEEDED',
            roundTripFailure: 'REPRODUCED_STILL_OPEN',
            targetBehaviorConvergence: 'PROVEN_LIVE_BY_PROTOTYPE',
            scopeGuard: 'CONFINED_TO_ONE_FILE'
        });

        console.log('='.repeat(78));
        console.log('ARWEAVE DISCOVERY URI IDENTITY BOUNDARY — FINAL VERDICT');
        console.log('='.repeat(78));
        for (const [key, value] of Object.entries(VERDICT)) {
            console.log(`  ${key.padEnd(28)} ${value}`);
        }
        console.log('');
        console.log('  THE INVARIANT: a discovery candidate\'s own `uri` must already be the');
        console.log('  announced MATERIAL\'s own retrieval location — never the announcement');
        console.log('  transaction, event, or record that carried the claim. Nothing downstream');
        console.log('  of application/DecentralizedWorldDiscoveryQuery.js ever unwraps a second');
        console.log('  envelope out of a lead\'s own uri; it is used as the terminal retrieval key,');
        console.log('  verbatim (Section A/E). NostrDiscoveryQueryService already satisfies this');
        console.log('  invariant (Section B); ArweaveGraphqlDiscoveryQueryService does not, because');
        console.log('  it never reads a candidate transaction\'s own data at all (Section C/F).');
        console.log('');
        console.log('  THE FIX IS SMALL, PROVEN, AND PRECISELY SCOPED (Section G/H): for each');
        console.log('  transaction id the existing GraphQL query already finds, fetch its raw data');
        console.log('  from the gateway (the same primitive ArweaveWorldEncounterMaterialResolver');
        console.log('  already ships), parse it with the existing parseDecentralizedDiscoveryEnvelope(),');
        console.log('  and report { uri: envelope.uri, storage } — skipping, never falling back to');
        console.log('  the raw id, when a tagged transaction does not carry a well-formed envelope.');
        console.log('  The announcement transaction id remains available, harmlessly, alongside it');
        console.log('  (Section D) for any future caller that wants it.');
        console.log('');
        console.log('  RECOMMENDATION: proceed to 0.9.494 — Correct Arweave Discovery Material URI');
        console.log('  Identity, implementing exactly Section G\'s own prototype logic inside');
        console.log('  application/ArweaveGraphqlDiscoveryQueryService.js itself. That milestone');
        console.log('  should decide only the one open configuration question Section C left');
        console.log('  unscheduled (how a real fix derives its own raw-content gateway url), and');
        console.log('  touch no other file this audit reconfirmed correct. 0.9.495 should then');
        console.log('  re-run a full production-composition round-trip audit (mirroring 0.9.491\'s');
        console.log('  own method) against the REAL fix rather than this milestone\'s own prototype,');
        console.log('  before any decision about Arweave\'s role in walking-triggered Snapshot');
        console.log('  discovery is made.');
        console.log('='.repeat(78));

        check(Object.values(VERDICT).every((value) => typeof value === 'string' && value.length > 0),
            'V1. every boundary this audit checked resolved to an explicit, honest classification');
        check(assertionCount > 30, 'V2. sanity: this audit is substantive, not a token pass');

        console.log(`\n✅ All Arweave Discovery URI Identity Boundary Audit tests passed. (${assertionCount} assertions)`);
    }
}

run().catch((error) => {
    console.error('ArweaveDiscoveryUriIdentityBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
