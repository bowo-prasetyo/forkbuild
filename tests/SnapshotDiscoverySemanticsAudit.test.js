import { readFile } from 'node:fs/promises';

import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { executeDiscoverSnapshotCommand } from '../application/DiscoverSnapshotCommand.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { resolveSnapshotPublicationAttribution } from '../application/SnapshotPublicationAttribution.js';
import { SnapshotPublicationAttributionOutcome } from '../application/SnapshotPublicationAttributionOutcome.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';

// 0.9.149 — Snapshot Discovery Semantics Audit & API Boundary.
//
// 0.9.148's own audit proved decentralized Snapshot discovery end to end —
// but every scenario in it, and in every Snapshot-discovery test before
// it, asked the identical shape of question: "does a locator exist for
// THIS ONE, already-known contentHash?" That is `resolve()`'s own
// contract (application/DecentralizedSnapshotResolver.js, 0.9.134) —
// attribution-oriented resolution, not browsing. Nothing in this codebase
// has ever asked the OTHER question `application/
// NostrSnapshotDiscoveryQueryService.js#search()` was already, quietly,
// capable of answering all along: "what has been announced under this
// discoveryTag, period — regardless of which contentHash each candidate
// happens to name?" This file is the audit that makes that latent
// capability explicit, proves it is already sound, and draws the API
// boundary between the two questions in test/documentation form — the
// identical "prove it, don't just assert it in prose" posture 0.9.135,
// 0.9.139, 0.9.141, 0.9.145, and 0.9.148 already hold for their own
// subsystems.
//
// TEST-ONLY. ZERO PRODUCTION CHANGES. `application/
// NostrSnapshotDiscoveryQueryService.js`, `application/
// DecentralizedSnapshotResolver.js`, `application/DiscoverSnapshotCommand.js`,
// `application/DiscoverSnapshotRuntimeComposition.js`, `application/
// SnapshotPublicationAttribution.js`, and `core/SnapshotDiscoveryEnvelope.js`
// are read only, never edited by this milestone. Every behavior this file
// exercises was already true before this audit ran; nothing here changes
// what any of those files do.
//
//   ATTRIBUTION-ORIENTED RESOLUTION            BROWSING-ORIENTED DISCOVERY
//   "Can I retrieve THIS               "What has been announced under
//    exact content?"                    this discoveryTag, at all?"
//
//        contentHash                          discoveryTag
//            │                                     │
//            ▼                                     ▼
//   DecentralizedSnapshotResolver          NostrSnapshotDiscoveryQueryService
//        .resolve(tag, hash)                    .search(tag)
//            │                                     │
//            ▼                                     ▼
//   ONE verified answer                    EVERY announced candidate,
//   (or a specific,                        UNFILTERED by contentHash,
//    structural failure)                   UNRANKED, UNVERIFIED
//
// Both operations already exist, unmodified, in this codebase. Neither
// secretly performs the other's job: `search()` never narrows to one
// candidate or verifies anything; `resolve()` never returns "whatever
// else was discovered" as if it, too, were requested. This file proves
// that boundary holds today, section by section, matching the six
// questions this milestone's own brief posed:
//
//   Section A: candidate discovery — one discoveryTag produces many
//              candidates, across DIFFERENT contentHashes, with no
//              selection performed
//   Section B: candidate preservation — every field a candidate carries,
//              and the relay order it arrived in, survives unranked
//   Section C: discovery carries no verification verdict — a bare
//              candidate's own shape has no room for one
//   Section D: discovery never retrieves bytes — `search()` has no
//              ContentStore dependency to retrieve them with
//   Section E: the existing resolver is untouched — `resolve()` still
//              answers only the one, exact contentHash it was asked for,
//              even when `search()`'s own result for the identical
//              discoveryTag contains several other candidates too
//   Section F: attribution stays downstream — a candidate `search()`
//              surfaces is never itself attributable; only after it
//              flows through the UNMODIFIED resolve() -> attribution
//              chain does a verdict become possible
//
// WHAT THIS MILESTONE DELIBERATELY DOES NOT DO.
// - **No new application-facing operation.** A narrow
//   "list every candidate under this tag" command (something like a
//   `DiscoverSnapshotCandidatesCommand`) is exactly the kind of seam this
//   audit's own Section A proves is already possible — building that
//   seam, and any UI atop it, stays entirely unscheduled, later work.
// - **No ranking, deduplication, or "group by contentHash" logic of any
//   kind.** Section B's own point is that none exists today; this
//   milestone adds none either.
// - **No change to the `DiscoveryTag`/`contentHash` vocabulary, wire
//   envelope, or outcome enums.** `DecentralizedSnapshotResolutionOutcome`
//   and `SnapshotPublicationAttributionOutcome` are read, never extended.
// - **No UI change of any kind.** `ui/views/WorldView.js` and every
//   sibling component are untouched; whether/how a future "Discover
//   Snapshots" (browsing) affordance would sit next to today's "Discover
//   Snapshot" (attribution-check) action is an unscheduled, later
//   decision.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function envelopeOf(overrides = {}) {
    return {
        protocol: 'forkbuild-snapshot-discovery',
        version: 1,
        contentHash: 'default-hash',
        locator: 'ar://default-locator',
        storage: 'ar',
        ...overrides
    };
}

function eventOf(content, overrides = {}) {
    return {
        id: 'event-id',
        pubkey: 'some-pubkey',
        kind: 1,
        tags: [['t', 'audit-tag']],
        content: typeof content === 'string' ? content : JSON.stringify(content),
        sig: 'some-signature',
        ...overrides
    };
}

function makeFakeRelay(events) {
    const calls = [];
    async function queryImpl(relayUrl, filter) {
        calls.push({ relayUrl, filter });
        return events;
    }
    return { calls, queryImpl };
}

function makeFakeArweaveGateway() {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            network.set(transaction.id, transaction.data);
            return new Response('OK', { status: 200 });
        }
        const id = parsed.pathname.slice(1);
        if (!network.has(id)) return new Response('not found', { status: 404 });
        return new Response(network.get(id));
    }
    return { network, fetchImpl };
}

function makeFakeArweaveSigner() {
    let counter = 0;
    async function sign(material) {
        counter += 1;
        return { id: `fake-audit-tx-${counter}`, transaction: { id: `fake-audit-tx-${counter}`, data: material } };
    }
    return { sign };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function run() {
    // ===============================================================
    // Section A — candidate discovery: one discoveryTag, many candidates,
    // across DIFFERENT contentHashes, with no selection performed.
    // ===============================================================
    {
        const events = [
            eventOf(envelopeOf({ contentHash: 'hash-alpha', locator: 'ar://tx-alpha', storage: 'ar' })),
            eventOf(envelopeOf({ contentHash: 'hash-beta', locator: 'ipfs://cid-beta', storage: 'ipfs' })),
            eventOf(envelopeOf({ contentHash: 'hash-gamma', locator: 'ar://tx-gamma', storage: 'ar' }))
        ];
        const relay = makeFakeRelay(events);
        const queryService = new NostrSnapshotDiscoveryQueryService({ queryImpl: relay.queryImpl });

        const candidates = await queryService.search('audit-section-a-tag');

        assert(candidates.length === 3,
            'A1. search() reports every candidate announced under the tag, regardless of how many distinct contentHashes they name — "what is available" never narrows to one');
        assert(new Set(candidates.map((c) => c.contentHash)).size === 3,
            'A2. the three candidates genuinely name three DIFFERENT contentHashes — this is heterogeneous browsing, not several locators for one Snapshot (that case is already covered by 0.9.148 Section D)');
        assert(candidates.map((c) => c.locator).join(',') === 'ar://tx-alpha,ipfs://cid-beta,ar://tx-gamma',
            'A3. relay order is preserved exactly — search() performs no sort, no grouping, no "pick one" step of its own');
        assert(relay.calls.length === 1,
            'A4. exactly one relay query answers a browsing request — search() does not fan out per candidate or per contentHash');

        console.log('✓ Section A: one discoveryTag genuinely produces many, heterogeneous candidates through the existing, unmodified search() — candidate discovery already works without any new operation');
    }

    // ===============================================================
    // Section B — candidate preservation: every field a candidate carries,
    // and the order it arrived in, survives unranked.
    // ===============================================================
    {
        const events = [
            eventOf(envelopeOf({ contentHash: 'preserve-1', locator: 'ar://preserve-tx-1', storage: 'ar' }), { id: 'relay-event-1' }),
            eventOf(envelopeOf({ contentHash: 'preserve-2', locator: 'ar://preserve-tx-2', storage: 'ar' }), { id: 'relay-event-2' }),
            eventOf(envelopeOf({ contentHash: 'preserve-3', locator: 'ar://preserve-tx-3', storage: 'ar' }), { id: 'relay-event-3' })
        ];
        const relay = makeFakeRelay(events);
        const queryService = new NostrSnapshotDiscoveryQueryService({ queryImpl: relay.queryImpl });

        const candidates = await queryService.search('audit-section-b-tag');

        assert(candidates.length === 3, 'B0. sanity: three candidates genuinely returned');
        assert(candidates[0].contentHash === 'preserve-1' && candidates[0].locator === 'ar://preserve-tx-1' && candidates[0].storage === 'ar',
            'B1. the FIRST candidate carries exactly the contentHash/locator/storage the FIRST relay event announced');
        assert(candidates[1].contentHash === 'preserve-2' && candidates[2].contentHash === 'preserve-3',
            'B2. the SECOND and THIRD candidates preserve their own relay-arrival order too — no reordering by hash, locator, or storage type');

        // "storage type" and "content hash" survive; nothing about WHICH
        // relay event or WHICH pubkey announced it is fabricated or lost —
        // a candidate is exactly { contentHash, locator, storage }, no more
        // and no less, matching application/
        // NostrSnapshotDiscoveryQueryService.js's own documented shape.
        for (const candidate of candidates) {
            const keys = Object.keys(candidate).sort();
            assert(keys.join(',') === 'contentHash,locator,storage',
                'B3. a candidate carries EXACTLY the documented three fields — never more (no fabricated ranking score, no relay metadata bolted on) and never fewer');
        }

        console.log('✓ Section B: candidate identity (contentHash/locator/storage) and relay-arrival order both survive verbatim — no ranking, grouping, or field loss is introduced by search()');
    }

    // ===============================================================
    // Section C — discovery carries no verification verdict: a bare
    // candidate's own shape has no room for one.
    // ===============================================================
    {
        const events = [eventOf(envelopeOf({ contentHash: 'verdict-hash', locator: 'ar://verdict-tx' }))];
        const relay = makeFakeRelay(events);
        const queryService = new NostrSnapshotDiscoveryQueryService({ queryImpl: relay.queryImpl });

        const candidates = await queryService.search('audit-section-c-tag');
        assert(candidates.length === 1, 'C0. sanity: one candidate genuinely discovered');

        const candidate = candidates[0];
        const forbiddenKeys = ['outcome', 'status', 'verified', 'trusted', 'match', 'resolved', 'bytes'];
        for (const key of forbiddenKeys) {
            assert(!(key in candidate),
                `C1. a discovered candidate never carries a '${key}' field — merely being discovered is never, itself, a verdict of any kind`);
        }

        // Structural confirmation that this is architectural, not a
        // fixture coincidence: the vocabulary a caller could even ask
        // for from a resolved/attributed result never appears in the
        // discovery layer's own source.
        const queryServiceCode = await codeOnlySource('application/NostrSnapshotDiscoveryQueryService.js');
        assert(!/\bMATCH\b|\bNO_MATCH\b|VERIFIED|RESOLVED\b/.test(queryServiceCode),
            'C2. application/NostrSnapshotDiscoveryQueryService.js itself never references MATCH/NO_MATCH/VERIFIED/RESOLVED — that vocabulary belongs entirely to the resolution/attribution layers, never to discovery');

        console.log('✓ Section C: a bare discovered candidate carries no outcome/status/verdict field of any kind, structurally as well as behaviorally — discovery cannot manufacture a verdict merely by existing');
    }

    // ===============================================================
    // Section D — discovery never retrieves bytes: search() has no
    // ContentStore dependency to retrieve them with.
    // ===============================================================
    {
        // D1. Runtime proof: a discovery-only composition — no
        // arweaveContentStoreOptions supplied at all — still discovers
        // every candidate. If search() secretly needed to retrieve
        // bytes to do its job, an absent content store would make
        // discovery itself fail; it does not.
        const events = [
            eventOf(envelopeOf({ contentHash: 'no-store-1', locator: 'ar://no-store-tx-1' })),
            eventOf(envelopeOf({ contentHash: 'no-store-2', locator: 'ar://no-store-tx-2' }))
        ];
        const relay = makeFakeRelay(events);
        const runtime = composeDiscoverSnapshotRuntime({
            nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: relay.queryImpl }
            // arweaveContentStoreOptions deliberately omitted — no signer,
            // no fetchImpl, no ContentStore of any kind exists here.
        });
        assert(runtime.contentStore === null, 'D1. sanity: no ContentStore was constructed at all in this scenario');
        assert(runtime.resolver !== null, 'D2. sanity: the resolver was still constructed — discovery capability does not depend on retrieval capability');

        const rawCandidates = await runtime.resolver._queryService.search('audit-section-d-tag');
        assert(rawCandidates.length === 2,
            'D3. FLAGSHIP — every candidate is discovered even though NO ContentStore exists anywhere in this composition; discovery cannot be silently performing retrieval, because there is nothing here for it to retrieve WITH');

        // D2. Structural confirmation: the discovery file itself never
        // imports a ContentStore, and never calls a `.get(` retrieval
        // method — the architectural reason D1's runtime behavior is
        // guaranteed, not coincidental.
        const queryServiceCode = await codeOnlySource('application/NostrSnapshotDiscoveryQueryService.js');
        assert(!queryServiceCode.includes('ContentStore'),
            'D4. application/NostrSnapshotDiscoveryQueryService.js never imports any ContentStore — it structurally cannot retrieve bytes');
        assert(!/\.get\s*\(/.test(queryServiceCode),
            'D5. ...and never calls a `.get()` retrieval method of any kind');

        console.log('✓ Section D: discovery genuinely completes with no ContentStore in existence anywhere in the composition, and the discovery file itself has no retrieval capability to misuse — discovery answering "what was announced" never silently becomes "let me go fetch it"');
    }

    // ===============================================================
    // Section E — the existing resolver is untouched: resolve() still
    // answers only the ONE exact contentHash it was asked for, even when
    // search() for the identical discoveryTag reports several others too.
    // ===============================================================
    {
        const discoveryTag = 'audit-section-e-tag';
        const gateway = makeFakeArweaveGateway();
        const signer = makeFakeArweaveSigner();
        const contentStore = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });

        const wanted = await contentStore.put('Section E: the one Snapshot actually requested');
        const decoyOne = await contentStore.put('Section E: an entirely unrelated Snapshot, decoy one');
        const decoyTwo = await contentStore.put('Section E: an entirely unrelated Snapshot, decoy two');

        const events = [
            eventOf(envelopeOf({ contentHash: decoyOne.hash, locator: decoyOne.uri, storage: decoyOne.storage })),
            eventOf(envelopeOf({ contentHash: wanted.hash, locator: wanted.uri, storage: wanted.storage })),
            eventOf(envelopeOf({ contentHash: decoyTwo.hash, locator: decoyTwo.uri, storage: decoyTwo.storage }))
        ];
        const relay = makeFakeRelay(events);
        const queryService = new NostrSnapshotDiscoveryQueryService({ queryImpl: relay.queryImpl });

        // First, confirm the BROWSING view genuinely contains all three —
        // the premise this section's own attribution-oriented check
        // depends on.
        const browsed = await queryService.search(discoveryTag);
        assert(browsed.length === 3, 'E1. sanity: search() itself reports all three heterogeneous candidates for this tag, unfiltered');

        // Now, the EXISTING, UNMODIFIED resolver: asked for exactly ONE
        // contentHash, it must resolve to exactly that one Snapshot's own
        // bytes — never a decoy, and never "whichever candidate came
        // first" the way search() itself has no opinion about.
        const resolver = new DecentralizedSnapshotResolver(queryService);
        const resolved = await executeDiscoverSnapshotCommand({ discoveryTag, contentHash: wanted.hash, resolver, contentStore });

        assert(resolved.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            'E2. the unmodified resolver still reaches RESOLVED for the exact contentHash requested, even though the discovery layer beneath it reported two OTHER candidates under the identical tag');
        assert(resolved.candidates.length === 1 && resolved.candidates[0].locator === wanted.uri,
            'E3. resolve()\'s own candidates field is filtered to the requested contentHash only — never the browsing-layer\'s full, heterogeneous list Section E1 just proved exists');
        const resolvedText = typeof resolved.bytes === 'string' ? resolved.bytes : new TextDecoder().decode(resolved.bytes);
        assert(resolvedText === 'Section E: the one Snapshot actually requested',
            'E4. the retrieved bytes are genuinely the requested Snapshot\'s own — not a decoy that happened to sit earlier in relay order');

        // The FOUR-LAYER failure vocabulary application/
        // DecentralizedSnapshotResolutionOutcome.js already names is
        // exactly as it was before this audit — this milestone adds no
        // fifth outcome and narrows none of the existing four.
        const outcomeValues = Object.values(DecentralizedSnapshotResolutionOutcome).sort();
        assert(outcomeValues.join(',') === ['content-hash-mismatch', 'content-unavailable', 'not-discovered', 'resolved', 'store-unavailable'].sort().join(','),
            'E5. DecentralizedSnapshotResolutionOutcome carries exactly its own five pre-existing values — this audit reads that vocabulary, never extends it');

        console.log('✓ Section E: resolve() remains exactly the "attribution-oriented, one exact answer" operation it already was — a browsing-shaped discovery result underneath it changes nothing about resolve()\'s own targeted contract');
    }

    // ===============================================================
    // Section F — attribution stays downstream: a candidate search()
    // surfaces is never itself attributable; only after it flows through
    // the unmodified resolve() -> attribution chain does a verdict become
    // possible.
    // ===============================================================
    {
        const discoveryTag = 'audit-section-f-tag';
        const gateway = makeFakeArweaveGateway();
        const signer = makeFakeArweaveSigner();
        const contentStore = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });

        const genuine = await contentStore.put('Section F: content a Publication genuinely holds');
        const unrelated = await contentStore.put('Section F: an entirely unrelated announcement under the same tag');

        const events = [
            eventOf(envelopeOf({ contentHash: unrelated.hash, locator: unrelated.uri, storage: unrelated.storage })),
            eventOf(envelopeOf({ contentHash: genuine.hash, locator: genuine.uri, storage: genuine.storage }))
        ];
        const relay = makeFakeRelay(events);
        const queryService = new NostrSnapshotDiscoveryQueryService({ queryImpl: relay.queryImpl });

        // F1. A caller BROWSING first — the shape a future "Discover
        // Snapshots" (plural) affordance would present.
        const candidates = await queryService.search(discoveryTag);
        assert(candidates.length === 2, 'F0. sanity: two heterogeneous candidates genuinely discovered under the shared tag');

        // F2. Feeding a bare, merely-browsed candidate straight to
        // attribution is refused outright — browsing a list is never
        // itself a verdict, no matter which candidate in the list a
        // caller looks at.
        const publication = new Publication({ id: 'pub-audit-f', documentId: 'doc-audit-f', contentReference: new ContentReference({ hash: genuine.hash }) });
        let threw = false;
        try {
            resolveSnapshotPublicationAttribution(publication, candidates.find((c) => c.contentHash === genuine.hash));
        } catch {
            threw = true;
        }
        assert(threw, 'F1. a candidate taken directly off search()\'s own browsing result — even the RIGHT one, by contentHash — cannot be attributed at all; it carries no `outcome`, so attribution refuses it as a caller contract violation, never a shortcut verdict');

        // F3. The SAME candidate, once a caller explicitly selects it and
        // resolves it through the UNMODIFIED existing chain, DOES reach a
        // genuine verdict — proving the future pipeline
        // (browse -> select -> resolve -> attribute) already composes
        // cleanly out of existing, unmodified primitives.
        const selected = candidates.find((c) => c.contentHash === genuine.hash);
        const resolver = new DecentralizedSnapshotResolver(queryService);
        const resolved = await executeDiscoverSnapshotCommand({ discoveryTag, contentHash: selected.contentHash, resolver, contentStore });
        assert(resolved.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'F2. the explicitly selected candidate resolves genuinely');

        const attribution = resolveSnapshotPublicationAttribution(publication, resolved);
        assert(attribution.outcome === SnapshotPublicationAttributionOutcome.MATCH,
            'F3. FLAGSHIP — browse (search()) -> select (a caller\'s own choice) -> resolve (the unmodified resolver) -> attribute (the unmodified attribution function) composes to a genuine MATCH, entirely out of primitives that already existed before this audit; no new operation was required to prove the pipeline sound');

        console.log('✓ Section F: a bare, browsed candidate is never itself attributable; only after explicit selection and the existing, unmodified resolve() step does a verdict become reachable — attribution stays strictly downstream of resolution, never of discovery alone');
    }

    console.log('\n✅ All Snapshot Discovery Semantics Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
