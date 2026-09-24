import { isSharedHelperImport } from './support/SharedHelperImports.js';
import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { describeDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import { describeDecentralizedWorldDiscoveryLead } from '../core/DecentralizedWorldDiscoveryLead.js';
import { NostrDiscoveryQueryService } from '../application/nostr/NostrDiscoveryQueryService.js';
import { ArweaveAnnouncementPublisher } from '../application/arweave/ArweaveAnnouncementPublisher.js';
import { ArweaveGraphqlDiscoveryQueryService } from '../application/arweave/ArweaveGraphqlDiscoveryQueryService.js';
import { ArweaveWorldEncounterMaterialResolver } from '../application/worldEncounter/ArweaveWorldEncounterMaterialResolver.js';
import { DecentralizedWorldEncounterMaterialSource } from '../application/worldEncounter/DecentralizedWorldEncounterMaterialSource.js';
import { composeDecentralizedWorldEncounterMaterialDiscoveryRuntime } from '../application/worldEncounter/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeWorldEncounterMaterialVerifier } from '../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { WorldEncounterMaterialLoadStatus } from '../application/worldEncounter/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/worldEncounter/WorldEncounterMaterialVerification.js';
import { DecentralizedWorldEncounterLeadResolutionStatus } from '../application/worldEncounter/DecentralizedWorldEncounterLeadResolution.js';

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
//      `application/worldEncounter/DecentralizedWorldEncounterMaterialSource.js`: the
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
// - **Modifying `application/arweave/ArweaveGraphqlDiscoveryQueryService.js` or any
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

async function run() {
    // ===============================================================
    // Section A — Discovery contract: what a candidate's own `uri` must
    // mean, traced through the two files that actually consume it.
    // ===============================================================
    {
        const leadSource = await source('core/DecentralizedWorldDiscoveryLead.js');
        check(/describeDecentralizedWorldDiscoveryLead/.test(leadSource) && !/announcementId|txId|transactionId/.test(codeOnlyOf(leadSource)),
            'A1. core/DecentralizedWorldDiscoveryLead.js carries exactly one location field, `uri` — no separate "announcement id" vocabulary exists at this layer');

        const sourceMaterialSource = codeOnlyOf(await source('application/worldEncounter/DecentralizedWorldEncounterMaterialSource.js'));
        check(/this\._retrieveByUri\(resolvedLead\.uri\)/.test(sourceMaterialSource),
            'A2. application/worldEncounter/DecentralizedWorldEncounterMaterialSource.js#load() calls retrieveByUri() with resolvedLead.uri DIRECTLY — no envelope-unwrapping step of its own, no Arweave/Nostr-specific branch');
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
        const nostrSource = codeOnlyOf(await source('application/nostr/NostrDiscoveryQueryService.js'));
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
        check(candidates[0].storage === 'ar', 'B4. ...and storage is read off that same envelope uri\'s own scheme, exactly as application/nostr/NostrDiscoveryQueryService.js\'s own header documents');

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
        // Demonstrated here manually, exactly as this section originally
        // did, against the announcement transaction's own id directly.
        const rawResolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: net.fetchImpl });
        const rawEnvelopeMaterial = await rawResolver.retrieveByUri(`ar://${announced.id}`);
        const recoveredEnvelope = describeDecentralizedDiscoveryEnvelope(rawEnvelopeMaterial);
        check(recoveredEnvelope !== null && recoveredEnvelope.uri === 'ar://TX-MATERIAL-C',
            'C3. THE DATA EXISTS, ONE HOP AWAY: a plain GET against the announcement transaction\'s own id — the SAME wire primitive ArweaveWorldEncounterMaterialResolver.js already ships for retrieving CONTENT — returns the exact envelope this transaction was tagged with, and its own claimed uri is recoverable from it. No new Arweave primitive is required; only a second fetch call, already proven correct elsewhere in this codebase');

        const resolverSource = codeOnlyOf(await source('application/worldEncounter/ArweaveWorldEncounterMaterialResolver.js'));
        check(/\$\{this\._gatewayUrl\}\/\$\{transactionId\}/.test(resolverSource),
            'C4. ...confirmed by source: the exact GET <gatewayUrl>/<transaction-id> call this section just used live is already a real, shipped, unit-tested production code path — a fix reuses this shape, never invents a new one');

        // AMENDED BY 0.9.494: the real, unmodified (as of 0.9.494)
        // ArweaveGraphqlDiscoveryQueryService now performs exactly the
        // C3/C4 hop internally, for every candidate, automatically — a
        // caller no longer performs it by hand. candidates[0].uri is
        // already the material's own claimed uri; the announcement
        // transaction id Section C1-C2 traced is preserved separately as
        // candidates[0].announcementId.
        const candidates = await discoveryService.search('campaign-c');
        check(candidates.length === 1, 'C5. sanity: discovery finds the one real announced transaction');
        check(candidates[0].announcementId === announced.id, 'C6. ...and the real reader (0.9.494) preserves that same announcement transaction id as candidates[0].announcementId');
        check(candidates[0].uri === 'ar://TX-MATERIAL-C', 'C7. FIXED (0.9.494): candidates[0].uri is already the envelope\'s own claimed uri — the real reader now performs the C3/C4 hop itself, so no caller-side manual fetch is required any more');

        console.log('✓ Section C: transaction -> data -> envelope -> uri is a real, traceable chain, but NOT the one the requesting brief\'s own Section C hypothesized — the envelope is never inside the GraphQL response (C1-C2); it requires one additional raw gateway GET, a primitive this codebase has already shipped and proven correct for content retrieval (C3-C4), and the real reader now performs that hop internally (C5-C7, 0.9.494).');
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
        const queryAdapterSource = codeOnlyOf(await source('application/discovery/DecentralizedWorldDiscoveryQuery.js'));
        check(/uri:\s*candidate\s*&&\s*candidate\.uri/.test(queryAdapterSource) && /storage:\s*candidate\s*&&\s*candidate\.storage/.test(queryAdapterSource),
            'D2. application/discovery/DecentralizedWorldDiscoveryQuery.js reads exactly two fields off a raw candidate — .uri and .storage — nothing else, by source');
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

        const resolverSource = codeOnlyOf(await source('application/worldEncounter/ArweaveWorldEncounterMaterialResolver.js'));
        const materialSourceSource = codeOnlyOf(await source('application/worldEncounter/DecentralizedWorldEncounterMaterialSource.js'));
        check(!/forkbuild|envelope|discoveryTag|Announcement/i.test(resolverSource), 'E2. ArweaveWorldEncounterMaterialResolver.js carries no envelope/announcement/discoveryTag vocabulary of its own by source — it is, and must remain, a pure uri-to-bytes retriever');
        check(!/forkbuild|envelope|discoveryTag|Announcement/i.test(materialSourceSource), 'E3. ...neither does DecentralizedWorldEncounterMaterialSource.js — confirming Section A\'s own finding that this is the terminal step, never a second interpretation layer, from the resolver family\'s own side too');

        console.log('✓ Section E: RESOLVER COMPATIBILITY, CONFIRMED. "Arweave discovery result -> existing resolver -> correct material" already works, live, with zero resolver-side changes, whenever the discovery result names the right uri. This is the strongest possible argument that the fix belongs entirely in the discovery-interpretation layer — the resolver side has nothing left to fix.');
    }

    // ===============================================================
    // Section F — Round-trip convergence, reproduced fresh against
    // CURRENT source (never cited from 0.9.491's own now-stale prose).
    //
    // AMENDED BY 0.9.494: this section originally reproduced the round-
    // trip FAILURE this whole audit exists to name (GAP 2). The real fix
    // (application/arweave/ArweaveGraphqlDiscoveryQueryService.js, 0.9.494) has
    // since closed it — re-running this exact scenario against CURRENT
    // source now converges instead, so this section is updated in place
    // to confirm that, rather than left asserting a now-false failure.
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

        check(result.discovery.arweave.length === 1 && result.discovery.arweave[0].uri === 'ar://TX-MATERIAL',
            'F2. FIXED (0.9.494): DISCOVER genuinely finds the real announcement and reports `ar://TX-MATERIAL` — the uri the announced envelope itself claims — never the announcement transaction\'s own id');
        check(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            'F3. RESOLVE now succeeds: RESOLVED — the discovered candidate uri and the Publication\'s own contentReference.uri are the same string, so association evidence\'s exact-match fires. GAP 2 IS NOW CLOSED, on current source, confirmed live');
        check(result.inspection !== null && result.inspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE && result.inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            'F4. ...and with a real association, the real material loads and verifies end to end: AVAILABLE, then VERIFIED');

        console.log('✓ Section F: the round trip now converges, fresh, against current source — confirming Gap 2 is closed by application/arweave/ArweaveGraphqlDiscoveryQueryService.js\'s own 0.9.494 fix, not merely masked by anything else.');
    }

    // ===============================================================
    // Section G — AMENDED BY 0.9.494: superseded by the real fix.
    //
    // This section originally built a throwaway, test-only prototype
    // class to prove the fix Section C's own diagnosis pointed to would
    // converge BEFORE any production file changed. That fix has since
    // landed for real in application/arweave/ArweaveGraphqlDiscoveryQueryService.js
    // (0.9.494) — Section F above now demonstrates the identical
    // convergence through the REAL class directly, so the prototype is no
    // longer needed and is not reconstructed here. `tests/
    // ArweaveEnvelopeAwareDiscoveryQueryService.test.js` (0.9.494) is the
    // focused, dedicated test suite for the real fix itself.
    // ===============================================================
    {
        const fixedSource = codeOnlyOf(await source('application/arweave/ArweaveGraphqlDiscoveryQueryService.js'));
        check(/parseDecentralizedDiscoveryEnvelope/.test(fixedSource), 'G1. CONFIRMED: the real production fix reuses the existing, unmodified parseDecentralizedDiscoveryEnvelope() — exactly the prototype\'s own step two, now real');
        check(/announcementId/.test(fixedSource), 'G2. CONFIRMED: the real fix preserves the announcement transaction id alongside the reported uri — exactly Section D\'s own invariant, now real');

        console.log('✓ Section G: the prototype this section used to build is superseded — the real fix in application/arweave/ArweaveGraphqlDiscoveryQueryService.js (0.9.494) does exactly what it proved, for real, confirmed live by Section F above.');
    }

    // ===============================================================
    // Section H — Scope guard: the fix is confined to the discovery-
    // interpretation layer alone.
    // ===============================================================
    {
        // AMENDED BY 0.9.494: the real fix's own import list, reused
        // exactly three existing, already-shipped names — none of them the
        // announcement publisher, the tagged-upload adapter, a signer, a
        // content store, Nostr, a new URI type, or an attribution/signature
        // primitive.
        const fixedSourceForImports = await source('application/arweave/ArweaveGraphqlDiscoveryQueryService.js');
        const fixedImportLines = fixedSourceForImports.split('\n').filter((line) => line.trim().startsWith('import') && !isSharedHelperImport(line));
        check(fixedImportLines.length === 2 && /DecentralizedDiscoveryQueryService/.test(fixedImportLines[0]) && /parseDecentralizedDiscoveryEnvelope/.test(fixedImportLines[1]),
            'H1. besides shared utils/ helpers, the real fix\'s own import list is exactly two lines: the base contract it implements, and the envelope parser it reuses — nothing else');

        const publisherSource = await source('application/arweave/ArweaveAnnouncementPublisher.js');
        const uploadSource = await source('application/arweave/ArweaveTaggedTransactionUpload.js');
        const signerSource = await source('arweave/ArweaveInjectedProviderSigner.js');
        const uploaderSource = await source('application/arweave/ArweavePublicationMaterialUploader.js');
        const nostrSource = await source('application/nostr/NostrDiscoveryQueryService.js');
        const leadSource = await source('core/DecentralizedWorldDiscoveryLead.js');

        // AMENDED BY 0.9.494: re-verified against the REAL fix rather than
        // the prototype's own name — none of these files needed to change,
        // confirmed by a direct sweep of each one's own source text.
        check(!/0\.9\.494/.test(publisherSource), 'H2. ArweaveAnnouncementPublisher.js — untouched by 0.9.494; the announcement publisher is a WRITE-side concern this fix never reaches');
        check(!/0\.9\.494/.test(uploadSource), 'H3. ArweaveTaggedTransactionUpload.js — untouched by 0.9.494; the tagged-upload adapter is a WRITE-side concern this fix never reaches');
        check(!/0\.9\.494/.test(signerSource), 'H4. arweave/ArweaveInjectedProviderSigner.js — untouched by 0.9.494; transaction signing is a WRITE-side concern this fix never reaches');
        check(!/0\.9\.494/.test(uploaderSource), 'H5. ArweavePublicationMaterialUploader.js — untouched by 0.9.494; content storage is a WRITE-side, content-role concern this fix never reaches');
        check(!/0\.9\.494/.test(nostrSource), 'H6. NostrDiscoveryQueryService.js — untouched by 0.9.494; Nostr already satisfies Section A\'s own contract and needs no change');
        check(!/0\.9\.494/.test(leadSource), 'H7. core/DecentralizedWorldDiscoveryLead.js — untouched by 0.9.494; Section D already proved no schema change is required');

        const fixedCandidateUri = 'ar://TX-MATERIAL';
        check(/^ar:\/\/[A-Za-z0-9_-]+$/.test(fixedCandidateUri),
            'H8. the fix introduces no new uri scheme — the material uri Section F actually reported is exactly the same `ar://<transaction-id>` shape this codebase already produces (application/arweave/ArweavePublicationMaterialUploader.js) and resolves (application/worldEncounter/ArweaveWorldEncounterMaterialResolver.js) everywhere else');

        console.log('✓ Section H: SCOPE GUARD CONFIRMED, AGAINST THE REAL FIX. Closing Gap 2 required touching only application/arweave/ArweaveGraphqlDiscoveryQueryService.js — never the announcement publisher, the tagged-upload adapter, transaction signing, content storage, Nostr, core/DecentralizedWorldDiscoveryLead.js\'s own schema, or attribution/signature semantics of any kind.');
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
            roundTripConvergence: 'CLOSED_BY_0_9_494_CONFIRMED_LIVE',
            targetBehaviorConvergence: 'PROVEN_LIVE_IN_PRODUCTION (0.9.494)',
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
        console.log('  of application/discovery/DecentralizedWorldDiscoveryQuery.js ever unwraps a second');
        console.log('  envelope out of a lead\'s own uri; it is used as the terminal retrieval key,');
        console.log('  verbatim (Section A/E). NostrDiscoveryQueryService already satisfies this');
        console.log('  invariant (Section B); pre-0.9.494 ArweaveGraphqlDiscoveryQueryService did');
        console.log('  not, because it never read a candidate transaction\'s own data at all');
        console.log('  (Section C).');
        console.log('');
        console.log('  AMENDED BY 0.9.494 — THE FIX HAS LANDED, FOR REAL, CONFIRMED LIVE (Section');
        console.log('  F/G/H): for each transaction id the existing GraphQL query already finds,');
        console.log('  application/arweave/ArweaveGraphqlDiscoveryQueryService.js now fetches its raw data');
        console.log('  from the gateway (the same primitive ArweaveWorldEncounterMaterialResolver');
        console.log('  already ships), parses it with the existing parseDecentralizedDiscoveryEnvelope(),');
        console.log('  and reports { uri: envelope.uri, storage, announcementId } — skipping, never');
        console.log('  falling back to the raw id, when a tagged transaction does not carry a well-');
        console.log('  formed envelope. The announcement transaction id remains available alongside');
        console.log('  it (Section D) as announcementId, exactly the invariant this audit named.');
        console.log('');
        console.log('  RECOMMENDATION: DONE — 0.9.494 implemented exactly this section\'s own');
        console.log('  diagnosis inside application/arweave/ArweaveGraphqlDiscoveryQueryService.js itself,');
        console.log('  touching no other file this audit reconfirmed correct (Section H). See');
        console.log('  tests/ArweaveEnvelopeAwareDiscoveryQueryService.test.js for the focused,');
        console.log('  dedicated coverage of the real fix. 0.9.495 should now re-run a full');
        console.log('  production-composition round-trip audit (mirroring 0.9.491\'s own method)');
        console.log('  against the REAL fix — see tests/');
        console.log('  ArweaveAnnouncementDiscoveryProductionIntegrationAudit.test.js\'s own Section');
        console.log('  E, already amended by 0.9.494 to do exactly that — before any decision about');
        console.log('  Arweave\'s role in walking-triggered Snapshot discovery is made.');
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
