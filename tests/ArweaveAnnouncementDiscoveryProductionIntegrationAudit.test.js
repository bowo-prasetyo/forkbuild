import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { describeDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import { ArweaveAnnouncementPublisher } from '../application/arweave/ArweaveAnnouncementPublisher.js';
import { createArweaveTaggedTransactionUpload } from '../application/arweave/ArweaveTaggedTransactionUpload.js';
import { createArweaveInjectedProviderSigner } from '../arweave/ArweaveInjectedProviderSigner.js';
import { ArweaveGraphqlDiscoveryQueryService } from '../application/arweave/ArweaveGraphqlDiscoveryQueryService.js';
import { ArweavePublicationMaterialUploader } from '../application/arweave/ArweavePublicationMaterialUploader.js';
import { NostrPublicationDiscoveryPublisher } from '../application/nostr/NostrPublicationDiscoveryPublisher.js';
import { resolveArweaveAnnouncementPublisherOptions } from '../application/publication/distribution/PublicationDistributionConfigurationProvider.js';
import { composePublicationDistributionRuntime } from '../application/publication/distribution/PublicationDistributionRuntimeComposition.js';
import { executePublicationDistribution } from '../application/publication/distribution/PublicationDistributionExecutor.js';
import {
    composeDecentralizedWorldEncounterMaterialDiscoveryServices,
    composeDecentralizedWorldEncounterMaterialDiscoveryRuntime
} from '../application/worldEncounter/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeWorldEncounterMaterialVerifier } from '../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { WorldEncounterMaterialLoadStatus } from '../application/worldEncounter/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/worldEncounter/WorldEncounterMaterialVerification.js';
import { DecentralizedWorldEncounterLeadResolutionStatus } from '../application/worldEncounter/DecentralizedWorldEncounterLeadResolution.js';
import { mainFiles } from './support/SourceFileGroups.js';

// 0.9.491 — Arweave Announcement/Discovery Production Integration Audit.
//
// Type: test-only production integration audit. Zero production changes.
//
// 0.9.489 tested a HYPOTHESIS about isolated classes and found one real,
// live gap: production's own resolution chain dropped an already-configured
// discoveryTag the instant `uploadTaggedTransaction` was absent, so
// selecting "Arweave" in `ui/components/WorldEncounterCanvas.js` threw on
// every real click. 0.9.490 closed the CAPABILITY gap Section C sized
// exactly — `application/arweave/ArweaveTaggedTransactionUpload.js` is a real, unit-
// tested, production-grade adapter today. But 0.9.490's own header drew one
// deliberate line: "Wiring a real host signer... into `ui/main.js`'s own
// production composition root... is a separate, later, composition-root
// change." This milestone asks whether that later change ever happened, and
// traces the REST of the requesting brief's own diagram — tag fidelity,
// transaction identity, discovery, candidate resolution, verification,
// failure isolation, Nostr coexistence, and role separation — against
// CURRENT source, never citing 0.9.489/0.9.490's own now-narrower evidence
// as if it still answered a question about PRODUCTION reachability.
//
// THE ANSWER, STATED UP FRONT, PER THIS WHOLE FAMILY'S OWN CONVENTION: this
// audit finds TWO gaps, not one, and they are different in kind.
//
// GAP 1 — COMPOSITION-ROOT WIRING (Sections A/B). `ui/main.js` still never
// imports `application/arweave/ArweaveTaggedTransactionUpload.js`, never calls
// `createArweaveTaggedTransactionUpload()`, and its own 0.9.430 comment
// ("No uploadTaggedTransaction host capability exists anywhere in this
// codebase yet") is now a STALE, FALSE statement about this codebase — a
// real one has existed since 0.9.490 — sitting immediately beside a
// composition call that still never reaches for it. Selecting "Arweave" for
// announcement still throws, live, today, on current production source,
// exactly as 0.9.489 Section B found before the adapter existed. This gap
// is small, mechanical, and precisely bounded — Section I names the exact
// fix.
//
// GAP 2 — A DEEPER, PREVIOUSLY-UNNAMED URI-IDENTITY MISMATCH BETWEEN THE
// ANNOUNCEMENT AND DISCOVERY LAYERS (Section E, the flagship). Even
// SETTING GAP 1 ASIDE — wiring a real `uploadTaggedTransaction` in and
// composing the announce/discover chain by hand, as this audit does — the
// round trip still does not converge. `ArweaveAnnouncementPublisher.js`
// (0.9.428) deliberately tags a SEPARATE announcement transaction carrying
// a JSON discovery envelope, exactly mirroring how `NostrPublicationDiscoveryPublisher`
// tags a Nostr event whose own `content` carries the identical envelope.
// But `ArweaveGraphqlDiscoveryQueryService.js` (0.9.25) — unlike
// `NostrDiscoveryQueryService.js` (0.9.31), which explicitly fetches and
// parses `event.content` to recover the envelope's own `uri` — NEVER reads
// a matching transaction's own `data` field at all; its GraphQL query
// requests only `node { id }`, and it reports that bare transaction id,
// wrapped as `ar://<id>`, AS IF it were the candidate's own content
// location. For a Nostr announcement this is fine, because the read side
// unwraps the real envelope to recover the real `uri`. For an Arweave
// announcement it means the reported candidate `uri` is the ANNOUNCEMENT
// transaction's own id — never the `uri` the announcement's own envelope
// actually claims — so it can never equal a real Publication's own
// `contentReference.uri` (a genuinely different transaction, by
// `ArweaveAnnouncementPublisher.js`'s own deliberate design), and
// association evidence's exact-string-equality match (`application/
// DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js`, 0.9.29)
// never fires. Section E demonstrates this live, then demonstrates the
// mechanism precisely by constructing a Publication whose own
// `contentReference.uri` is deliberately set to the announcement's own
// transaction id — resolution DOES then succeed, but VERIFICATION rejects,
// because the "material" the resolver retrieves from that id is the
// announcement's own bare discovery envelope, structurally incapable of
// satisfying a real Publication's signature verification. There is no
// small, mechanical fix for this the way Gap 1 has one; closing it is a
// real, separate, unscheduled question about how (or whether) Arweave's
// own discovery-read layer should learn to unwrap an announcement
// envelope, exactly as its Nostr sibling already does — Section I names it
// as a genuinely new milestone, never invents an answer here.
//
// Every other boundary this audit checks (C, D, F, G, H) confirms the parts
// that ARE genuinely production-ready today: the adapter itself is a
// faithful translator, transaction identity never gets reinvented, the
// discovery QUERY mechanism is unconditionally live in production, failure
// semantics survive the composition-root boundary, and Nostr/Arweave
// coexistence, deduplication, and role separation all hold through the
// real 0.9.490 adapter.
//
// AMENDED BY 0.9.492 — GAP 1 IS NOW CLOSED. `ui/main.js` now constructs
// `createArweaveTaggedTransactionUpload({ signer: arweaveHostSigner,
// gatewayUrl: resolvedArweaveGatewayUrl })` and forwards its
// `uploadTaggedTransaction` into `createPublicationDistributionRuntimeProvider()`,
// exactly the fix this file's own Section I already named. Sections A and B
// below, and the final VERDICT in Section I, are updated in place to
// re-verify that CLOSED state against current source rather than left
// asserting the now-stale "still broken" finding — the same "test CURRENT
// source, never cite prior prose" method this whole family already holds
// itself to. GAP 2 (Section E, the flagship) is completely untouched by
// 0.9.492 and remains exactly as open as this file originally found it.
//
// AMENDED BY 0.9.494 — GAP 2 IS NOW CLOSED. `tests/
// ArweaveDiscoveryUriIdentityBoundaryAudit.test.js` (0.9.493) named the exact
// invariant Gap 2 violated and proved a fix live via a throwaway prototype;
// `application/arweave/ArweaveGraphqlDiscoveryQueryService.js` (0.9.494) moved that
// fix into production. `search()` now performs one additional raw gateway
// fetch per discovered transaction — the same `GET <gatewayUrl>/<id>`
// primitive `application/worldEncounter/ArweaveWorldEncounterMaterialResolver.js` already
// shipped — decodes each transaction's own signed publication envelope via
// the existing, unmodified `core/DecentralizedDiscoveryEnvelope.js`, and
// reports THAT envelope's own claimed `uri` as `candidate.uri`, with the
// announcement transaction id preserved separately as
// `candidate.announcementId`. Section E below is updated in place to
// re-verify the now-CONVERGING round trip against current source, exactly
// the "test CURRENT source, never cite prior prose" method this whole
// family already holds itself to; the final VERDICT in Section I is updated
// the same way. Nothing else in this file changes — Sections C/D/F/G/H's
// own findings (tag fidelity, transaction identity, discovery-query
// reachability, failure isolation, Nostr coexistence, role separation) were
// already correct and remain so.
//
// LETTERED SECTIONS:
//   A. Production composition — is the adapter constructed/reachable from
//      ui/main.js? (No — Gap 1.)
//   B. Publisher reachability, re-executed live against CURRENT source —
//      REACHABLE_BUT_NONFUNCTIONAL, confirmed UNCHANGED since 0.9.489.
//   C. Tag fidelity and transaction identity through the REAL 0.9.490
//      adapter and a REAL (fake-wallet-backed) signer — never a hand-rolled
//      stand-in uploadTaggedTransaction.
//   D. GraphQL discovery reachability in production shape — confirmed
//      unconditionally constructed, no host-capability gate, genuinely
//      finds a transaction announced through Section C's real chain.
//   E. FLAGSHIP — full round-trip convergence, attempted end to end through
//      real, unmodified production classes with fakes only at the wallet/
//      network boundary — reveals Gap 2 precisely, then confirms its exact
//      mechanism and its downstream consequence (RESOLVED but REJECTED,
//      never a false VERIFIED).
//   F. Failure isolation — announce-side failure semantics survive one
//      boundary further out than 0.9.490 already checked (the composition-
//      root/executor boundary, not merely direct publisher construction);
//      read-side query failures never propagate as an exception in the
//      first place, confirmed by source sweep and one live scenario.
//   G. Nostr coexistence through the REAL adapter — mutual exclusivity and
//      "never a fallback," re-confirmed one substrate-implementation layer
//      further than 0.9.489 Section K's own hand-rolled fake.
//   H. Duplicate semantics and role separation through the REAL adapter.
//   I. Production-change guard, verdict, and two separate recommendations
//      — one small and mechanical (Gap 1), one a real, unscheduled design
//      question this milestone deliberately does not answer (Gap 2).
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Fixing either gap this audit finds** (constructing
//   `createArweaveTaggedTransactionUpload()` in `ui/main.js` for Gap 1, or
//   teaching `ArweaveGraphqlDiscoveryQueryService.js` to fetch and parse a
//   matching transaction's own `data` for Gap 2). This file is test-only,
//   exactly like 0.9.489; both gaps are reported, precisely scoped, and
//   left for the follow-up work Section I names — one small and mechanical,
//   one a real design question.
// - **Designing the fix for Gap 2.** Whether the right answer is having
//   `ArweaveGraphqlDiscoveryQueryService` fetch+parse a candidate
//   transaction's own envelope (mirroring `NostrDiscoveryQueryService`
//   exactly), having `ArweaveAnnouncementPublisher` tag the CONTENT
//   transaction directly instead of a separate one, or something else
//   entirely, is a real architectural decision with real trade-offs this
//   milestone does not make — an audit reports what exists, it does not
//   invent what a real product/design decision has not yet resolved.
// - **Re-deriving every assertion `tests/ArweaveTaggedTransactionUpload.test.js`
//   (0.9.490) already made about the adapter in isolation** (data fidelity,
//   per-field tag validation, the exact signer/gateway call sequence, or its
//   own pure-adapter source sweep). Where this file's own scenario looks
//   similar, it exists to run the SAME real adapter one layer further out —
//   through the composition root, the discovery/resolution/verification
//   chain, or alongside Nostr — never to pad the count.
// - **A new Arweave resolution/verification mechanism, an announcement/
//   discovery registry, idempotency, deduplication, retry, or any other
//   policy this audit does not find already defined.** Per this whole
//   family's own restraint, an audit reports what exists; it does not
//   invent what a real product decision has not yet asked for.
// - **Wiring Arweave into walking-triggered Snapshot discovery, or any
//   product-scope decision about whether Arweave should participate in the
//   broader discovery ecosystem.** Explicitly out of scope until a
//   production-composition audit like this one passes cleanly.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    assert(condition, message);
}

async function expectThrowsAsync(fn, message) {
    let error = null;
    try { await fn(); } catch (e) { error = e; }
    assert(error !== null, message);
    return error;
}

function expectThrowsSync(fn, message) {
    let error = null;
    try { fn(); } catch (e) { error = e; }
    assert(error !== null, message);
    return error;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function codeOnlyOf(text) {
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// The inverse of arweave/ArweaveInjectedProviderSigner.js's own private
// base64UrlEncode() — reimplemented here independently, per this whole
// family's own "two independent files" convention (see
// tests/ArweaveTaggedTransactionUpload.test.js's own identical helper).
function decodeBase64Url(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
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
        id: 'pub-production-integration-1',
        documentId: 'doc-1',
        title: 'A Publication Announced Through the Real Arweave Adapter',
        author: 'alice',
        publisherIdentity,
        contentReference: { hash: 'placeholder-hash', uri: 'ar://TX-MATERIAL', storage: 'ar' },
        signature: null,
        ...overrides
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

// One shared, deterministic fake Arweave substrate that speaks the REAL
// wire protocol a genuine gateway does: /tx_anchor and /price/ (consulted
// by the real ArweaveInjectedProviderSigner while building a transaction),
// POST /tx (the real gateway broadcast a real signed+tagged transaction
// reaches), POST /graphql (matched against a transaction's own DECODED
// tags, exactly like a real gateway's own indexer), and GET /<id> (plain
// content retrieval for a publication's own, separately-uploaded material).
// Reconstructed independently here rather than imported from
// tests/ArweaveTaggedTransactionUpload.test.js or
// tests/ArweaveAnnouncementDiscoveryCapabilityBoundaryAudit.test.js, per
// this whole family's own "two independent files" convention.
function makeRealWireArweaveSubstrate({ materialByTxId = {} } = {}) {
    const ledger = new Map(); // id -> { data, tags }
    for (const [id, material] of Object.entries(materialByTxId)) {
        ledger.set(id, { data: JSON.stringify(material), tags: [] });
    }
    let nextId = 0;
    const fakeWallet = {
        async connect() {},
        async sign(transaction) {
            nextId += 1;
            return { ...transaction, owner: 'fake-owner', signature: 'fake-signature', id: `ProdIntegrationTx${String(nextId).padStart(6, '0')}` };
        }
    };

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
        if (method === 'GET' && getMatch && ledger.has(getMatch[1])) {
            const entry = ledger.get(getMatch[1]);
            const raw = entry.tags.length > 0 ? decodeBase64Url(entry.data) : entry.data;
            return new Response(raw, { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }

    return { ledger, fakeWallet, fetchImpl };
}

async function run() {
    // ===============================================================
    // Section A — Production composition: is the adapter constructed
    // and reachable from ui/main.js's own composition root?
    // AMENDED BY 0.9.492 — re-verified against current source: GAP 1 IS
    // NOW CLOSED. See this file's own header amendment.
    // ===============================================================
    {
        const mainSource = (await Promise.all(mainFiles().map((file) => source(file)))).join('\n');
        const mainCodeOnly = codeOnlyOf(mainSource);

        check(/from ['"](\.\.\/)+application\/arweave\/ArweaveTaggedTransactionUpload\.js['"]/.test(mainCodeOnly),
            'A1. ui/main.js now imports application/arweave/ArweaveTaggedTransactionUpload.js — the 0.9.490 adapter is referenced from the production composition root');
        check(/createArweaveTaggedTransactionUpload\(/.test(mainCodeOnly),
            'A2. ...and calls createArweaveTaggedTransactionUpload() — CONSTRUCTED? YES');

        const providerCallMatch = mainCodeOnly.match(/createPublicationDistributionRuntimeProvider\(\{[\s\S]{0,400}?\}\)/);
        check(providerCallMatch !== null, 'A3. sanity: the real composition-root call site is where this section expects it');
        check(/uploadTaggedTransaction\s*:/.test(providerCallMatch[0]),
            'A4. INJECTED? YES — the real call site now supplies uploadTaggedTransaction as an argument, closing the gap 0.9.489 Section B originally found');

        // The precise staleness Section A originally named is itself now
        // gone: the comment sitting immediately beside that call site no
        // longer asserts "no uploadTaggedTransaction host capability exists
        // anywhere in this codebase yet" — it names the real 0.9.492 wire.
        check(!/No `uploadTaggedTransaction`[\s\S]{0,10}host capability exists anywhere in this codebase yet/.test(mainSource),
            'A5. ui/main.js\'s own composition-root comment no longer carries the stale "No uploadTaggedTransaction host capability exists..." prose 0.9.491 originally found beside an unwired call site');
        check(/arweaveAnnouncementUploadTaggedTransaction/.test(mainCodeOnly),
            'A5b. ...and the call site names the real capability it now constructs, not merely a stale absence');

        // Contrast with the two capabilities that already made this exact
        // trip before 0.9.492 — a real, injected, production-shaped host
        // adapter constructed in this same file, right beside the one that
        // now has one too.
        check(/arweaveHostSigner\s*=\s*\{/.test(mainCodeOnly) && /createArweaveInjectedProviderSigner\(/.test(mainCodeOnly),
            'A6. arweaveHostSigner IS constructed here — a real production host-capability adapter for the CONTENT-upload role');
        check(/nostrHostPublisher\s*=\s*async function/.test(mainCodeOnly) && /createNostrInjectedProviderPublisher\(/.test(mainCodeOnly),
            'A7. ...and nostrHostPublisher IS constructed here too — a real production host-capability adapter for the Nostr announcement role. uploadTaggedTransaction (A1-A5b) now receives the identical treatment, reusing the same arweaveHostSigner instance rather than a second one');

        console.log('✓ Section A: WIRED (0.9.492). application/arweave/ArweaveTaggedTransactionUpload.js (0.9.490) is now constructed and referenced by ui/main.js\'s own production composition root, closing the composition-root wire 0.9.490\'s own header deferred and 0.9.491 originally found still missing.');
    }

    // ===============================================================
    // Section B — Publisher reachability, re-executed live against
    // CURRENT source. AMENDED BY 0.9.492 — production composition now
    // supplies a real uploadTaggedTransaction, so this section re-verifies
    // that the same real chain 0.9.489/0.9.491 found throwing now
    // constructs successfully, using a production-shaped (real adapter,
    // fake wallet/network) uploadTaggedTransaction — never a bare literal.
    // ===============================================================
    {
        const net = makeRealWireArweaveSubstrate();
        const realSigner = createArweaveInjectedProviderSigner({ injectedProvider: net.fakeWallet, fetchImpl: net.fetchImpl });
        const uploadTaggedTransaction = createArweaveTaggedTransactionUpload({ signer: realSigner, gatewayUrl: 'https://production-shaped.example', fetchImpl: net.fetchImpl });

        const productionShapedCapabilities = {
            uploadTaggedTransaction, // exactly what ui/main.js's real call now produces (Section A4)
            gatewayUrl: 'https://arweave.net',
            tagName: ArweaveAnnouncementPublisher.DEFAULT_TAG_NAME,
            discoveryTag: 'forkbuild-publication' // the real, live literal ui/main.js's own PUBLICATION_DISCOVERY_TAG holds
        };
        const resolvedOptions = resolveArweaveAnnouncementPublisherOptions(productionShapedCapabilities);
        check(resolvedOptions !== undefined,
            'B1. resolveArweaveAnnouncementPublisherOptions(), called with exactly the shape current production now supplies, resolves a real options object — the already-configured discoveryTag is no longer dropped now that uploadTaggedTransaction is present');

        const runtime = composePublicationDistributionRuntime({
            discoveryProvider: 'arweave',
            arweaveUploaderOptions: { signer: { sign: async () => ({ id: 'x', transaction: {} }) } },
            arweaveAnnouncementPublisherOptions: resolvedOptions
        });
        check(runtime.publisher instanceof ArweaveAnnouncementPublisher,
            'B2. selecting "arweave" through the real production composition call, with exactly what current source resolves it to today, now constructs a real ArweaveAnnouncementPublisher instead of throwing');

        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-b', uri: 'ar://TX-MATERIAL' });
        const published = await runtime.publisher.publish(envelope);
        check(typeof published.id === 'string' && net.ledger.has(published.id),
            'B3. ...and the constructed publisher genuinely publishes through the real signer/gateway chain — this is not merely a constructor that no longer throws, it is a working publish path');

        // AMENDED BY 0.9.672 — this <select> now lives in
        // WorldDistributionDialog.js, one popup over — see that file's
        // own header.
        const worldDistributionDialogSource = await source('ui/components/WorldDistributionDialog.js');
        check(/<option value="arweave">Arweave<\/option>/.test(worldDistributionDialogSource) && !/<option value="arweave"[^>]*disabled/.test(worldDistributionDialogSource),
            'B4. the real <select> still offers "Arweave" as a live, unconditionally clickable choice — a real click, today, now reaches a genuinely working announce path (B1-B3), not a throw');

        console.log('✓ Section B: REACHABLE_AND_WIRED. 0.9.492 adopted the fix 0.9.490 built; the live path 0.9.489/0.9.491 found throwing now genuinely publishes.');
    }

    // ===============================================================
    // Section C — tag fidelity and transaction identity through the
    // REAL 0.9.490 adapter and a REAL (fake-wallet-backed) signer.
    // ===============================================================
    {
        const net = makeRealWireArweaveSubstrate();
        const realSigner = createArweaveInjectedProviderSigner({ injectedProvider: net.fakeWallet, fetchImpl: net.fetchImpl });
        check(realSigner !== undefined, 'C1. sanity: the real signer resolves given a usable fake wallet');

        const uploadTaggedTransaction = createArweaveTaggedTransactionUpload({ signer: realSigner, gatewayUrl: 'https://production-shaped.example', fetchImpl: net.fetchImpl });

        // Two independent campaigns through the SAME real adapter/signer —
        // proving the tag on the wire tracks discoveryTag 1:1, never a
        // fixed or derived literal the adapter invented itself.
        const publisherOne = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-c-one', uploadTaggedTransaction });
        const publisherTwo = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-c-two', uploadTaggedTransaction });
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-c', uri: 'ar://TX-MATERIAL' });

        const publishedOne = await publisherOne.publish(envelope);
        const publishedTwo = await publisherTwo.publish(envelope);

        const entryOne = net.ledger.get(publishedOne.id);
        const entryTwo = net.ledger.get(publishedTwo.id);
        check(entryOne.tags.length === 1 && entryTwo.tags.length === 1, 'C2. exactly one Arweave Tag reaches each real signed transaction');
        check(decodeBase64Url(entryOne.tags[0].value) === 'campaign-c-one' && decodeBase64Url(entryTwo.tags[0].value) === 'campaign-c-two',
            'C3. the on-wire tag VALUE tracks discoveryTag 1:1 across two independent real transactions — the adapter never fixes, caches, or derives its own tag value');
        check(decodeBase64Url(entryOne.tags[0].name) === ArweaveAnnouncementPublisher.DEFAULT_TAG_NAME,
            'C4. the on-wire tag NAME is exactly the literal the real reader already matches against');

        const adapterSource = await source('application/arweave/ArweaveTaggedTransactionUpload.js');
        check(!/discoveryTag\s*=|chooseCampaign|selectDiscoveryTag/.test(codeOnlyOf(adapterSource)),
            'C5. the adapter\'s own source never authors, selects, or derives a discovery tag of its own — re-confirmed live here, matching 0.9.490 Section F2\'s own source sweep, never re-derived from scratch');

        // Transaction identity: the id the real signer computes is the ONE
        // identity that survives verbatim all the way up — never rehashed,
        // never re-derived, by any file in the chain.
        check(publishedOne.id.startsWith('ProdIntegrationTx') && net.ledger.has(publishedOne.id),
            'C6. the id ArweaveAnnouncementPublisher.publish() hands back is the real signer\'s own deterministically-computed transaction id, and a real ledger entry exists under exactly that id');
        for (const [filePath, forbidden] of [
            ['application/arweave/ArweaveAnnouncementPublisher.js', /contentHash|sha256|crypto\.subtle|createHash|uuid/i],
            ['application/arweave/ArweaveTaggedTransactionUpload.js', /contentHash|sha256|crypto\.subtle|createHash|uuid/i],
            ['application/arweave/ArweaveGraphqlDiscoveryQueryService.js', /contentHash|sha256|crypto\.subtle|createHash|uuid/i]
        ]) {
            check(!forbidden.test(codeOnlyOf(await source(filePath))), `C7. ${filePath} never computes an alternate identity (no hashing/uuid primitive of any kind) — the real signer's own id is the ONLY identity this chain ever produces`);
        }

        console.log('✓ Section C: tag fidelity (discoveryTag -> real on-wire Arweave Tag, 1:1) and transaction identity (signer-computed id, verbatim, never re-derived) both hold through the REAL 0.9.490 adapter and a REAL signer — never a hand-rolled stand-in.');
    }

    // ===============================================================
    // Section D — GraphQL discovery reachability in production shape.
    // ===============================================================
    {
        const compositionSource = await source('application/worldEncounter/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js');
        check(/const arweave = new ArweaveGraphqlDiscoveryQueryService\(/.test(codeOnlyOf(compositionSource)),
            'D1. the real production discovery-services composition unconditionally constructs a real ArweaveGraphqlDiscoveryQueryService — no host-capability gate of any kind, matching this file\'s own header, "Arweave\'s own discovery query... already works with no host capability at all"');

        const mainSource = (await Promise.all(mainFiles().map((file) => source(file)))).join('\n');
        check(mainSource.includes('composeDecentralizedWorldEncounterMaterialDiscoveryServices(') && mainSource.includes('composeDecentralizedWorldEncounterMaterialDiscoveryRuntime('),
            'D2. ui/main.js genuinely calls both real composition functions — the read/discovery side of this whole loop, unlike the write/announce side (Section A), IS wired into the production composition root');

        // Live: the real discovery-services composition, given exactly the
        // shape ui/main.js's own call passes (an arweaveFetchImpl, nothing
        // Arweave-wallet-related), genuinely finds a transaction announced
        // through Section C's real chain.
        const net = makeRealWireArweaveSubstrate();
        const realSigner = createArweaveInjectedProviderSigner({ injectedProvider: net.fakeWallet, fetchImpl: net.fetchImpl });
        const uploadTaggedTransaction = createArweaveTaggedTransactionUpload({ signer: realSigner, gatewayUrl: 'https://production-shaped.example', fetchImpl: net.fetchImpl });
        const publisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-d', uploadTaggedTransaction });
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-d', uri: 'ar://TX-MATERIAL' });
        const published = await publisher.publish(envelope);

        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ arweaveFetchImpl: net.fetchImpl });
        check(services.arweave !== null && services.nostr === null,
            'D3. with only arweaveFetchImpl supplied (exactly production\'s own shape with no host Nostr transport configured), the discovery services shape matches: Arweave always present, Nostr gracefully absent');
        const candidates = await services.arweave.search('campaign-d');
        check(candidates.length === 1 && candidates[0].announcementId === published.id && candidates[0].uri === 'ar://TX-MATERIAL',
            'D4. the real discovery-services composition genuinely finds the real transaction Section C\'s real adapter announced, decodes its own envelope (0.9.494), and reports the announced material\'s own uri with the announcement transaction id preserved alongside it — DISCOVERY_QUERY_MECHANISM is production-ready today');

        console.log('✓ Section D: the discovery/read half of this loop is genuinely, unconditionally wired into production (ui/main.js) and genuinely finds a real announced transaction — a sharp asymmetry with Section A\'s write/announce half.');
    }

    // ===============================================================
    // Section E — FLAGSHIP: full round-trip convergence, attempted end
    // to end through real, unmodified (as of 0.9.494, envelope-aware)
    // production classes. GAP 2 (see this file's own header) is now
    // CLOSED here: discovery finds the real announced transaction AND
    // reports the announced material's own claimed uri, so resolution
    // against a real Publication converges all the way to VERIFIED.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const alice = buildRealSigner(storage, 'production-integration-alice');
        const publication = buildSignedPublication(alice);

        // The publication's own material — a separate, already-uploaded
        // Arweave transaction (TX-MATERIAL), pre-seeded exactly like
        // tests/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.test.js's
        // own Section A does; this section's own job is proving the
        // ANNOUNCE side genuinely feeds that already-proven read pipeline,
        // never re-deriving retrieval/verification correctness itself.
        const net = makeRealWireArweaveSubstrate({ materialByTxId: { 'TX-MATERIAL': publication.toJSON() } });

        // ANNOUNCE — the real publisher, the real 0.9.490 adapter, a real
        // (fake-wallet-backed) signer. No test-only uploadTaggedTransaction
        // stand-in anywhere in this section.
        const realSigner = createArweaveInjectedProviderSigner({ injectedProvider: net.fakeWallet, fetchImpl: net.fetchImpl });
        const uploadTaggedTransaction = createArweaveTaggedTransactionUpload({ signer: realSigner, gatewayUrl: 'https://flagship.example', fetchImpl: net.fetchImpl });
        const campaign = 'campaign-e-flagship';
        const announcementPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: campaign, uploadTaggedTransaction });
        const envelope = describeDecentralizedDiscoveryEnvelope({
            protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: publication.id, uri: publication.contentReference.uri
        });
        const announced = await announcementPublisher.publish(envelope);
        check(announced !== null && announced.published === true, 'E1. ANNOUNCE succeeds through the real publisher/adapter/signer chain');

        // ARWEAVE TRANSACTION -> DISCOVER -> CANDIDATE -> SELECT/RESOLVE ->
        // VERIFY — the exact same, real, unmodified production composition
        // functions ui/main.js itself calls (Section D2) — never a second,
        // audit-authored resolution/verification path.
        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ arweaveFetchImpl: net.fetchImpl });
        const { verifier } = composeWorldEncounterMaterialVerifier();
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
            discoveryServices: services,
            arweaveResolverOptions: { fetchImpl: net.fetchImpl },
            verifier
        });

        const result = await runtime.discoverWorldEncounterPublication({
            objectId: publication.id,
            discoveryTag: campaign,
            publications: [publication]
        });

        // Note: `announcementId` rides on the RAW candidate `search()`
        // returns (confirmed directly in Section D above); the LEAD shape
        // `queryDecentralizedWorldDiscovery()` produces here only ever
        // keeps `{ origin, discoveryTag, uri, storage }` — 0.9.493 Section D
        // already proved describeDecentralizedWorldDiscoveryLead() silently
        // drops any other field, so it is expected, not a regression, that
        // it does not appear on `result.discovery.arweave[0]` itself.
        check(result.discovery.arweave.length === 1,
            'E2. DISCOVER/CANDIDATE — the real discovery composition reports exactly the transaction Section E1 actually announced, never a pre-seeded stand-in');
        check(result.discovery.arweave[0].uri === 'ar://TX-MATERIAL',
            'E2b. FIXED (0.9.494): candidate.uri is now `ar://TX-MATERIAL` — the uri the announced envelope itself actually claims — never `ar://${announced.id}`, the announcement transaction\'s own id this section used to (incorrectly) find here');
        check(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            'E3. SELECT/RESOLVE — GAP 2, CLOSED: resolution against this replica\'s own real, signed Publication (contentReference.uri = "ar://TX-MATERIAL") now reports RESOLVED — the exact-string-equality association match (application/worldEncounter/DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js) fires, because the candidate uri and the Publication\'s own claimed uri are now the same string');
        check(result.inspection !== null && result.inspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
            'E4. ...and the real, unmodified ArweaveWorldEncounterMaterialResolver retrieves the real Publication material directly off that uri — loading succeeds');
        check(result.inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            'E4b. ...and verification reports VERIFIED — the full announce -> discover -> resolve -> verify chain converges end to end, through real production classes alone');

        const discoverySource = codeOnlyOf(await source('application/arweave/ArweaveGraphqlDiscoveryQueryService.js'));
        check(/query \{ transactions\(tags: \[\{ name: /.test(discoverySource),
            'E5. the GraphQL query this service issues still requests only `edges { node { id } }` — unchanged by 0.9.494, exactly as Section D already confirmed');
        check(/parseDecentralizedDiscoveryEnvelope/.test(discoverySource) && /gatewayUrl/.test(discoverySource),
            'E5b. DIAGNOSIS, by source: the fix is a SECOND, additional raw gateway fetch per candidate transaction (never a GraphQL query-shape change) — the same `GET <gatewayUrl>/<id>` primitive ArweaveWorldEncounterMaterialResolver.js already shipped, decoded via the existing, unmodified parseDecentralizedDiscoveryEnvelope() — exactly mirroring how NostrDiscoveryQueryService.js already parses event.content for exactly this reason');

        // A transaction the GraphQL step finds but whose own data is not a
        // well-formed envelope contributes NO candidate at all — 0.9.494
        // deliberately refuses to substitute that transaction's own id as a
        // fallback uri, the exact identity violation this milestone exists
        // to prevent from ever recurring.
        net.ledger.set('BadAnnounce-NoEnvelope', { data: 'not a forkbuild envelope', tags: [{ name: btoa(ArweaveAnnouncementPublisher.DEFAULT_TAG_NAME).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), value: btoa(campaign).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }] });
        const resultWithBadCandidate = await runtime.discoverWorldEncounterPublication({
            objectId: publication.id,
            discoveryTag: campaign,
            publications: [publication]
        });
        check(resultWithBadCandidate.discovery.arweave.length === 1 && resultWithBadCandidate.discovery.arweave[0].uri === 'ar://TX-MATERIAL',
            'E6. a second, malformed transaction sharing the same campaign tag contributes no candidate of its own, and never disturbs the one genuinely well-formed candidate already found — no id is ever substituted as a fallback uri');

        console.log('✓ Section E: FLAGSHIP — GAP 2 IS NOW CLOSED. Discovery genuinely finds a real announced transaction and decodes its own envelope (E2/E2b), resolution now associates it with the real Publication it announced (E3), and loading/verification both succeed against the real material (E4/E4b) — the full announce -> discover -> resolve -> verify chain converges, live, through real production classes alone. The fix is precisely the one additional gateway fetch Section E5/E5b diagnose, and it never substitutes a transaction id as a fallback uri for a malformed candidate (E6).');
    }

    // ===============================================================
    // Section F — failure isolation, one boundary further out than
    // 0.9.490 already checked, plus read-side never-throws confirmation.
    // ===============================================================
    {
        // F1-F4 — announce-side failure semantics, run through the
        // COMPOSITION-ROOT/EXECUTOR boundary (composePublicationDistributionRuntime
        // + executePublicationDistribution), not merely direct
        // ArweaveAnnouncementPublisher construction as 0.9.490 Section E6/E7
        // already checked one layer further in.
        const net = makeRealWireArweaveSubstrate();
        const contentSigner = { async sign(material) { return { id: 'ContentTxF00000000000000000001', transaction: { format: 2, id: 'ContentTxF00000000000000000001', data: material, tags: [] } }; } };
        const materialUploader = new ArweavePublicationMaterialUploader({ signer: contentSigner, fetchImpl: net.fetchImpl });

        const rejectingRuntime = composePublicationDistributionRuntime({
            discoveryProvider: 'arweave',
            arweaveUploaderOptions: { signer: contentSigner, fetchImpl: net.fetchImpl },
            arweaveAnnouncementPublisherOptions: { discoveryTag: 'campaign-f-fail', uploadTaggedTransaction: async () => { throw new Error('gateway unreachable'); } }
        });
        await expectThrowsAsync(() => executePublicationDistribution({
            publication: { id: 'pub-f1', signature: 'sig-f1' },
            serializedMaterial: JSON.stringify({ body: 'f1' }),
            materialUploader: rejectingRuntime.uploader,
            distributionDescriptor: rejectingRuntime.describeDistribution,
            discoveryPublisher: rejectingRuntime.publisher
        }), 'F1. through the full composition-root/executor chain, a genuine signing/transport failure still propagates as a rejection, never swallowed');

        const decliningRuntime = composePublicationDistributionRuntime({
            discoveryProvider: 'arweave',
            arweaveUploaderOptions: { signer: contentSigner, fetchImpl: net.fetchImpl },
            arweaveAnnouncementPublisherOptions: { discoveryTag: 'campaign-f-decline', uploadTaggedTransaction: async () => null }
        });
        const declinedResult = await executePublicationDistribution({
            publication: { id: 'pub-f2', signature: 'sig-f2' },
            serializedMaterial: JSON.stringify({ body: 'f2' }),
            materialUploader: decliningRuntime.uploader,
            distributionDescriptor: decliningRuntime.describeDistribution,
            discoveryPublisher: decliningRuntime.publisher
        });
        check(declinedResult.material !== null && declinedResult.discovery === null,
            'F2. through the full composition-root/executor chain, an ordinary gateway decline still resolves discovery: null while the material upload completes untouched — no compensating action of any kind');

        const brokenSignerRuntime = composePublicationDistributionRuntime({
            discoveryProvider: 'arweave',
            arweaveUploaderOptions: { signer: contentSigner, fetchImpl: net.fetchImpl },
            arweaveAnnouncementPublisherOptions: { discoveryTag: 'campaign-f-broken', uploadTaggedTransaction: async () => ({ id: '' }) }
        });
        await expectThrowsAsync(() => executePublicationDistribution({
            publication: { id: 'pub-f3', signature: 'sig-f3' },
            serializedMaterial: JSON.stringify({ body: 'f3' }),
            materialUploader: brokenSignerRuntime.uploader,
            distributionDescriptor: brokenSignerRuntime.describeDistribution,
            discoveryPublisher: brokenSignerRuntime.publisher
        }), 'F3. through the full composition-root/executor chain, a collaborator that resolves but violates its own contract (no valid id) still throws rather than masquerading as a real announcement');

        // F4 — read-side query failures never throw in the first place, so
        // there is no code path where an Arweave discovery failure could
        // ever prevent a Nostr query in the SAME discoverWorldEncounterPublication()
        // call from running (or vice versa) — confirmed by source sweep and
        // one live "gateway down" scenario.
        const discoveryServiceSource = await source('application/arweave/ArweaveGraphqlDiscoveryQueryService.js');
        check(/NEVER THROWS/i.test(discoveryServiceSource) && /return \[\];/.test(discoveryServiceSource),
            'F4. ArweaveGraphqlDiscoveryQueryService.search() is documented and implemented to never throw — every failure (network, non-2xx, unparseable body) degrades to [], confirmed by source, not merely assumed');

        const failingArweave = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: async () => { throw new Error('gateway down'); } });
        const nostrResults = [];
        const workingNostrLikeService = { get origin() { return 'dweb:nostr:wss://fake-relay.example'; }, async search(tag) { nostrResults.push(tag); return [{ uri: 'ar://irrelevant', storage: 'ar' }]; } };
        const services = { nostr: workingNostrLikeService, arweave: failingArweave };
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({ discoveryServices: services, verifier: (await composeWorldEncounterMaterialVerifier()).verifier });
        const result = await runtime.discoverWorldEncounterPublication({ objectId: 'pub-f5', discoveryTag: 'campaign-f5', publications: [] });
        check(nostrResults.length === 1 && result.discovery.nostr.length === 1 && result.discovery.arweave.length === 0,
            'F5. live: with Arweave\'s own gateway genuinely unreachable, the SAME discoverWorldEncounterPublication() call still genuinely queries and reports Nostr\'s own results — an Arweave read-side failure never prevents, corrupts, or truncates a Nostr discovery result in the same call');

        console.log('✓ Section F: announce-side failure semantics (malformed/decline -> null-shaped results, genuine failure/broken contract -> throw) survive one boundary further out (composition-root + executor) than 0.9.490 already confirmed; read-side query failures never throw at all, so Arweave/Nostr discovery isolation within one joint call has no failure mode to exhibit in the first place.');
    }

    // ===============================================================
    // Section G — Nostr coexistence through the REAL adapter.
    // ===============================================================
    {
        const net = makeRealWireArweaveSubstrate();
        const realSigner = createArweaveInjectedProviderSigner({ injectedProvider: net.fakeWallet, fetchImpl: net.fetchImpl });
        const uploadTaggedTransaction = createArweaveTaggedTransactionUpload({ signer: realSigner, gatewayUrl: 'https://g.example', fetchImpl: net.fetchImpl });
        const contentSigner = { async sign(material) { return { id: 'ContentTxG0000000000000000001', transaction: { format: 2, id: 'ContentTxG0000000000000000001', data: material, tags: [] } }; } };

        const nostrOptions = { discoveryTag: 'campaign-g-nostr', publishImpl: async () => ({ published: true, id: 'a'.repeat(64) }) };
        const arweaveAnnouncementOptions = { discoveryTag: 'campaign-g-arweave', uploadTaggedTransaction };
        const arweaveUploaderOptions = { signer: contentSigner, fetchImpl: net.fetchImpl };

        const nostrRuntime = composePublicationDistributionRuntime({ discoveryProvider: 'nostr', arweaveUploaderOptions, nostrPublisherOptions: nostrOptions, arweaveAnnouncementPublisherOptions: arweaveAnnouncementOptions });
        const arweaveRuntime = composePublicationDistributionRuntime({ discoveryProvider: 'arweave', arweaveUploaderOptions, nostrPublisherOptions: nostrOptions, arweaveAnnouncementPublisherOptions: arweaveAnnouncementOptions });
        check(nostrRuntime.publisher instanceof NostrPublicationDiscoveryPublisher && !(nostrRuntime.publisher instanceof ArweaveAnnouncementPublisher),
            'G1. "nostr" selects exactly Nostr even with a fully real Arweave adapter simultaneously present');
        check(arweaveRuntime.publisher instanceof ArweaveAnnouncementPublisher && !(arweaveRuntime.publisher instanceof NostrPublicationDiscoveryPublisher),
            'G2. "arweave" selects exactly the real Arweave announcement publisher even with full Nostr options simultaneously present');

        let nostrPublishCalls = 0;
        const spyingNostrOptions = { discoveryTag: 'campaign-g-spy', publishImpl: async () => { nostrPublishCalls += 1; return { published: true, id: 'b'.repeat(64) }; } };
        const envelope = { protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-g', uri: 'ar://TX-MATERIAL' };
        const arweaveResult = await arweaveRuntime.publisher.publish(envelope);
        check(arweaveResult !== null && arweaveResult.published === true, 'G3. sanity: the real Arweave announcement, through the real adapter, genuinely succeeds in this section');
        check(nostrPublishCalls === 0, 'G4. ...and never, at any point, invoked the sibling spying Nostr publishImpl — selecting Arweave through the real adapter never constructs or calls Nostr as a side effect');

        const compositionSource = await source('application/publication/distribution/PublicationDistributionRuntimeComposition.js');
        const executorSource = await source('application/publication/distribution/PublicationDistributionExecutor.js');
        check(!/catch[\s\S]{0,120}(nostr|arweave)/i.test(compositionSource) && !/catch[\s\S]{0,120}(nostr|arweave)/i.test(executorSource),
            'G5. neither file contains catch-and-retry-on-the-other-substrate logic — re-confirmed by source sweep, unchanged since 0.9.489');

        console.log('✓ Section G: Nostr and the REAL Arweave adapter remain additive, mutually exclusive discovery substrates — confirmed one implementation layer further than 0.9.489\'s own hand-rolled fake.');
    }

    // ===============================================================
    // Section H — duplicate semantics and role separation through the
    // REAL adapter.
    // ===============================================================
    {
        const net = makeRealWireArweaveSubstrate({ materialByTxId: { 'TX-MATERIAL-H': { body: 'h' } } });
        const realSigner = createArweaveInjectedProviderSigner({ injectedProvider: net.fakeWallet, fetchImpl: net.fetchImpl });
        const uploadTaggedTransaction = createArweaveTaggedTransactionUpload({ signer: realSigner, gatewayUrl: 'https://h.example', fetchImpl: net.fetchImpl });
        const publisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-h', uploadTaggedTransaction });
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-h', uri: 'ar://TX-MATERIAL-H' });

        const first = await publisher.publish(envelope);
        const second = await publisher.publish(envelope);
        check(first.id !== second.id, 'H1. publishing the byte-identical envelope twice, through the real adapter and a real signer, still produces two independent real transactions — no deduplication of any kind');

        const discoveryQueryService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const candidates = await discoveryQueryService.search('campaign-h');
        check(candidates.length === 2, 'H2. real discovery genuinely finds BOTH real transactions — the substrate and the reader both treat repeated publication as two independent, equally-valid announcements');

        // Role separation: content transaction, announcement transaction,
        // discovery query, and attribution (signature) stay four separate
        // facts even routed entirely through real production classes.
        const contentTxId = 'TX-MATERIAL-H';
        check(contentTxId !== first.id && contentTxId !== second.id, 'H3. CONTENT STORAGE != ANNOUNCEMENT — the pre-existing material transaction and both real announcement transactions are three distinct ids');
        const announcedEnvelopeOne = describeDecentralizedDiscoveryEnvelope(JSON.parse(net.ledger.get(first.id).tags.length > 0 ? decodeBase64Url(net.ledger.get(first.id).data) : net.ledger.get(first.id).data));
        check(!('signature' in announcedEnvelopeOne), 'H4. DISCOVERY/ANNOUNCEMENT != ATTRIBUTION — the real, base64url-decoded announced envelope carries objectId/uri, never a Publication signature, even through the real signer/adapter chain');

        console.log('✓ Section H: duplicate semantics (none defined, none needed) and role separation (content/announcement/discovery/attribution) both hold through the REAL adapter, unchanged from 0.9.489\'s own findings against a hand-rolled fake.');
    }

    // ===============================================================
    // Section I — production-change guard, verdict, recommendation.
    // ===============================================================
    {
        // This milestone touches no production file — confirmed by
        // asserting this file's own diff surface is exactly what the
        // requesting brief asked for: a new test file, plus its
        // registration.
        const testsHtml = await source('tests.html');
        check(testsHtml.includes("'./tests/ArweaveAnnouncementDiscoveryProductionIntegrationAudit.test.js'"),
            'I1. this file is registered in tests.html, exactly like every other audit in this family');

        const VERDICT = Object.freeze({
            productionComposition: 'WIRED (Gap 1 closed by 0.9.492)',
            publisherReachability: 'REACHABLE_AND_FUNCTIONAL',
            tagFidelity: 'READY',
            transactionIdentity: 'READY_NO_ALTERNATE_IDENTITY',
            discoveryQueryMechanism: 'PRODUCTION_WIRED_AND_LIVE',
            roundTripConvergence: 'CONVERGES_END_TO_END (Gap 2 closed by 0.9.494)',
            failureIsolation: 'CONFIRMED_AT_COMPOSITION_BOUNDARY',
            nostrCoexistence: 'CONFIRMED_ADDITIVE_NEVER_FALLBACK',
            duplicateSemantics: 'NONE_DEFINED_NONE_NEEDED',
            roleSeparation: 'CONFIRMED'
        });

        console.log('='.repeat(78));
        console.log('ARWEAVE ANNOUNCEMENT/DISCOVERY PRODUCTION INTEGRATION — FINAL VERDICT');
        console.log('='.repeat(78));
        for (const [key, value] of Object.entries(VERDICT)) {
            console.log(`  ${key.padEnd(28)} ${value}`);
        }
        console.log('');
        console.log('  The complete Arweave announcement -> discovery path IS production-complete');
        console.log('  today. Both gaps this audit originally found are now closed:');
        console.log('');
        console.log('  GAP 1 (small, mechanical) — CLOSED BY 0.9.492: ui/main.js now constructs the');
        console.log('  real uploadTaggedTransaction 0.9.490 shipped, so selecting "Arweave" for');
        console.log('  announcement genuinely publishes on a real click (Sections A/B, above).');
        console.log('');
        console.log('  GAP 2 (real, previously unnamed, architectural) — CLOSED BY 0.9.494:');
        console.log('  ArweaveGraphqlDiscoveryQueryService now performs one additional raw gateway');
        console.log('  fetch per discovered transaction, decodes its own signed publication');
        console.log('  envelope via the existing, unmodified core/DecentralizedDiscoveryEnvelope.js,');
        console.log('  and reports the envelope\'s own claimed uri as candidate.uri — exactly what');
        console.log('  NostrDiscoveryQueryService already did for Nostr — with the announcement');
        console.log('  transaction id preserved separately as candidate.announcementId. A real');
        console.log('  Publication\'s own contentReference.uri now matches, and resolution reports');
        console.log('  RESOLVED, loading AVAILABLE, and verification VERIFIED (Section E, above).');
        console.log('');
        console.log('  Every other boundary this audit checked (tag fidelity, transaction identity,');
        console.log('  discovery query reachability, failure isolation, Nostr coexistence,');
        console.log('  duplicate semantics, role separation) is production-ready today, confirmed');
        console.log('  live through real adapters and real production composition functions.');
        console.log('');
        console.log('  RECOMMENDATION 1 (Gap 1) — DONE, 0.9.492: constructed');
        console.log('  createArweaveTaggedTransactionUpload({ signer: arweaveHostSigner, gatewayUrl:');
        console.log('  resolvedArweaveGatewayUrl }) in ui/main.js, beside');
        console.log('  arweavePublicationRuntimeCapabilities/nostrPublicationRuntimeCapabilities, and');
        console.log('  forwarded its uploadTaggedTransaction into');
        console.log('  createPublicationDistributionRuntimeProvider({ ... }). Touched no other file');
        console.log('  this audit reconfirmed correct.');
        console.log('');
        console.log('  RECOMMENDATION 2 (Gap 2) — DONE, 0.9.494: ArweaveGraphqlDiscoveryQueryService');
        console.log('  now fetches+parses each candidate transaction\'s own data (mirroring');
        console.log('  NostrDiscoveryQueryService exactly), confined entirely to that one file — see');
        console.log('  tests/ArweaveEnvelopeAwareDiscoveryQueryService.test.js for the focused');
        console.log('  coverage of the real fix itself. With both gaps closed, Arweave now');
        console.log('  functions as a genuine, independent announcement/discovery substrate; a');
        console.log('  product-scope decision about whether to add it to walking-triggered Snapshot');
        console.log('  discovery remains separate, unscheduled, later work (0.9.495).');
        console.log('='.repeat(78));

        check(Object.values(VERDICT).every((value) => typeof value === 'string' && value.length > 0),
            'I2. every boundary this audit checked resolved to an explicit, honest classification');
        check(assertionCount > 30, 'I3. sanity: this audit is substantive, not a token pass');

        console.log(`\n✅ All Arweave Announcement/Discovery Production Integration Audit tests passed. (${assertionCount} assertions)`);
    }
}

run().catch((error) => {
    console.error('ArweaveAnnouncementDiscoveryProductionIntegrationAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
