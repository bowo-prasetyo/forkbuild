import { execSync } from 'node:child_process';

import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, SNAPSHOT_DISCOVERY_ENVELOPE_VERSION } from '../core/SnapshotDiscoveryEnvelope.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { LocalSnapshotCandidateDiscoveryQueryService } from '../application/LocalSnapshotCandidateDiscoveryQueryService.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { ArweaveSnapshotDiscoveryQueryService } from '../application/ArweaveSnapshotDiscoveryQueryService.js';
import { SnapshotCandidateDiscoveryQueryService } from '../application/SnapshotCandidateDiscoveryQueryService.js';
import { composeSnapshotCandidateDiscoveryRuntime } from '../application/SnapshotCandidateDiscoveryRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/WorldSnapshotDiscoveryMonitor.js';
import { SnapshotPlacementResolver } from '../application/SnapshotPlacementResolver.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.9.500 — Compose Arweave into Snapshot Candidate Discovery.
//
// tests/SnapshotCandidateDiscoveryQueryServiceIntegrationAudit.test.js
// (0.9.485) proved Local+Nostr composition; tests/
// ArweaveWalkingTriggeredSnapshotDiscoveryIntegrationBoundaryAudit.test.js
// (0.9.496) and tests/ArweaveSnapshotDiscoveryCapabilityBoundaryAudit.test.js
// (0.9.497) both concluded the composite query-service seam was ALREADY
// N-source-general, waiting only on a Snapshot-vocabulary-shaped Arweave
// source — which 0.9.499's own ArweaveSnapshotDiscoveryQueryService then
// built. This milestone is composition only: `application/
// SnapshotCandidateDiscoveryRuntimeComposition.js` now injects that
// already-built, UNMODIFIED class as a third source, exactly the way
// Nostr already was, and `ui/main.js` constructs its ONE instance. This
// file is the dedicated audit of that addition — the existing 0.9.485
// audit is updated only where its own regex needed to change to match the
// new wiring (see its own "UPDATED BY 0.9.500" header note); every
// Local/Nostr-only scenario it already covers is not re-litigated here.
//
//   Section A — Production composition: exactly one Arweave Snapshot
//               query service construction site, Local/Nostr unchanged.
//   Section B — Contract: Arweave source shares the identical
//               search(discoveryTag) duck type.
//   Section C — Three-source convergence in one search() call.
//   Section D — Arweave candidates retain contentHash/locator/storage,
//               unchanged, through the composite.
//   Section E — Cross-source deduplication: identical
//               storage+contentHash+locator across all three sources
//               collapses to one.
//   Section F — Same contentHash, different locator (Arweave vs. Nostr)
//               remains two distinct candidates.
//   Section G — Failure matrix: all eight Local/Nostr/Arweave
//               availability combinations.
//   Section H — Zero-source availability: the existing empty result,
//               never an error.
//   Section I — No ranking/fallback; arrival order preserved.
//   Section J — No second discovery path; command/monitor/resolver
//               untouched by this milestone.
//   Section K — No Snapshot resolution during candidate discovery.
//   Section L — An Arweave announcement transaction id never becomes a
//               candidate locator, observed through the composite.
//   Section M — Query-count baseline: one observation invokes the
//               Arweave source's own search() exactly once.
//   Section N — Deliberately-excluded vocabulary absent from the diff.
//   Section O — Scope guard.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

function readSource(relativePath) {
    return execSync(`cat "${relativePath}"`, { cwd: SOURCE_ROOT.pathname }).toString();
}

function stripLineComments(source) {
    return source.replace(/\/\/.*$/gm, '');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeNostrQueryImpl(events) {
    return async () => events;
}

function makeNostrEnvelopeEvent({ contentHash, locator, storage }) {
    return { content: JSON.stringify({ protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION, contentHash, locator, storage }) };
}

// Mirrors tests/ArweaveSnapshotDiscoveryQueryService.test.js's own
// makeFakeGateway — a deterministic, network-free stand-in for both
// Arweave's GraphQL gateway and its raw transaction gateway.
function makeFakeArweaveGateway({ transactionIds = [], envelopes = {} } = {}) {
    let graphqlCalls = 0;
    let gatewayCalls = 0;
    const gatewayRequestedIds = [];
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if ((options.method || 'GET') === 'POST') {
            graphqlCalls += 1;
            return { ok: true, json: async () => ({ data: { transactions: { edges: transactionIds.map((id) => ({ node: { id } })) } } }) };
        }
        gatewayCalls += 1;
        const id = parsed.pathname.slice(1);
        gatewayRequestedIds.push(id);
        if (Object.prototype.hasOwnProperty.call(envelopes, id)) {
            return { ok: true, headers: { get: () => null }, text: async () => envelopes[id] };
        }
        return { ok: false, headers: { get: () => null }, text: async () => 'not found' };
    }
    return { fetchImpl, counts: () => ({ graphqlCalls, gatewayCalls }), gatewayRequestedIds };
}

function arweaveEnvelopeJson({ contentHash, locator, storage }) {
    return JSON.stringify({ protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION, contentHash, locator, storage });
}

function pos(x, y, z) { return { x, y, z }; }
function ctx(position) { return { position }; }

function buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService = null, arweaveSnapshotDiscoveryQueryService = null, placementCatalog }) {
    const { queryService } = composeSnapshotCandidateDiscoveryRuntime({ nostrSnapshotDiscoveryQueryService, arweaveSnapshotDiscoveryQueryService, placementCatalog });
    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({
        discoveryTag: 'forkbuild-snapshot',
        discoveryQueryService: queryService
    });
    const monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand });
    return { queryService, discoverSnapshotCandidatesCommand, monitor };
}

async function run() {
    console.log('=== 0.9.500 — Compose Arweave into Snapshot Candidate Discovery: Integration Audit ===\n');

    // ===============================================================
    // Section A — Production composition.
    // ===============================================================
    {
        const mainSource = stripLineComments(readSource('ui/main.js'));

        const constructionSites = execSync('grep -rlE "new ArweaveSnapshotDiscoveryQueryService\\(" application ui --include="*.js" || true', { cwd: SOURCE_ROOT.pathname })
            .toString().trim().split('\n').filter(Boolean);
        assert(constructionSites.length === 1 && constructionSites[0] === 'ui/main.js',
            `1. exactly one production file constructs an ArweaveSnapshotDiscoveryQueryService (found: ${JSON.stringify(constructionSites)}).`);
        assert((mainSource.match(/new ArweaveSnapshotDiscoveryQueryService\(/g) || []).length === 1,
            '2. ui/main.js constructs exactly one ArweaveSnapshotDiscoveryQueryService instance.');

        assert(/composeSnapshotCandidateDiscoveryRuntime\(\{\s*\n\s*nostrSnapshotDiscoveryQueryService: snapshotDiscoveryQueryService,\s*\n\s*arweaveSnapshotDiscoveryQueryService,\s*\n\s*placementCatalog: publicationSnapshotPlacementCatalog/.test(mainSource),
            '3. ui/main.js composes the runtime with all three collaborators: snapshotDiscoveryQueryService (Nostr, unchanged), arweaveSnapshotDiscoveryQueryService (new), and publicationSnapshotPlacementCatalog (unchanged).');
        assert((mainSource.match(/composeSnapshotCandidateDiscoveryRuntime\(/g) || []).length === 1,
            '4. ui/main.js still calls composeSnapshotCandidateDiscoveryRuntime() exactly once — no second composition site.');
        assert(!/new NostrSnapshotDiscoveryQueryService\([^)]*\)[\s\S]{0,400}composeSnapshotCandidateDiscoveryRuntime/.test(mainSource),
            '5. no second NostrSnapshotDiscoveryQueryService construction was introduced near this wiring.');
        assert((mainSource.match(/new WorldSnapshotDiscoveryMonitor\(/g) || []).length === 1,
            '6. exactly one WorldSnapshotDiscoveryMonitor is still constructed — this milestone adds no second walking-trigger path.');

        console.log('✓ Section A: exactly one ArweaveSnapshotDiscoveryQueryService is constructed, in ui/main.js, and is the one new collaborator composeSnapshotCandidateDiscoveryRuntime() now accepts — the pre-existing Nostr and Local wiring, and the single walking monitor, are unchanged.');
    }

    // ===============================================================
    // Section B — Contract.
    // ===============================================================
    {
        const gateway = makeFakeArweaveGateway({ transactionIds: [] });
        const arweaveSource = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });
        assert(typeof arweaveSource.search === 'function' && arweaveSource.search.length <= 1,
            '1. ArweaveSnapshotDiscoveryQueryService exposes the identical duck-typed search(discoveryTag) contract Local and Nostr already do.');

        const { queryService } = composeSnapshotCandidateDiscoveryRuntime({
            arweaveSnapshotDiscoveryQueryService: arweaveSource,
            placementCatalog: new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider())
        });
        assert(queryService instanceof SnapshotCandidateDiscoveryQueryService,
            '2. the composite accepts an Arweave-only roster (plus the always-present Local source) and still builds a real SnapshotCandidateDiscoveryQueryService.');

        console.log('✓ Section B: ArweaveSnapshotDiscoveryQueryService matches the identical search(discoveryTag) duck type this whole family already shares, and is accepted by the composite exactly like any other source.');
    }

    // ===============================================================
    // Section C — Three-source convergence.
    // ===============================================================
    let catalog, localCandidate;
    {
        catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        catalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-c-local', contentHash: 'hash-c-local', storage: 'ipfs', locator: 'ipfs://CID-c-local' }));
        localCandidate = { contentHash: 'hash-c-local', locator: 'ipfs://CID-c-local' };

        const nostrEvents = [makeNostrEnvelopeEvent({ contentHash: 'hash-c-nostr', locator: 'ar://c-nostr', storage: 'arweave' })];
        const nostrSource = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(nostrEvents) });

        const ANNOUNCEMENT_ID = 'AnnounceTxC0000000000000000000000000000';
        const gateway = makeFakeArweaveGateway({
            transactionIds: [ANNOUNCEMENT_ID],
            envelopes: { [ANNOUNCEMENT_ID]: arweaveEnvelopeJson({ contentHash: 'hash-c-arweave', locator: 'ar://ContentTxC00000000000000000000000000', storage: 'arweave' }) }
        });
        const arweaveSource = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });

        const { queryService } = composeSnapshotCandidateDiscoveryRuntime({
            nostrSnapshotDiscoveryQueryService: nostrSource,
            arweaveSnapshotDiscoveryQueryService: arweaveSource,
            placementCatalog: catalog
        });
        const candidates = await queryService.search('forkbuild-snapshot');

        assert(candidates.some((c) => c.contentHash === 'hash-c-local'), '1. the Local candidate is present.');
        assert(candidates.some((c) => c.contentHash === 'hash-c-nostr'), '2. the Nostr candidate is present.');
        assert(candidates.some((c) => c.contentHash === 'hash-c-arweave'), '3. the Arweave candidate is present.');
        assert(candidates.length === 3, '4. exactly the union of all three sources — three candidates, no more, no fewer — is returned from ONE search() call.');

        console.log('✓ Section C: Local, Nostr, and Arweave candidates all surface from a single search(discoveryTag) call against the three-source composite.');
    }

    // ===============================================================
    // Section D — Arweave candidate field retention.
    // ===============================================================
    {
        const ANNOUNCEMENT_ID = 'AnnounceTxD0000000000000000000000000000';
        const CONTENT_TX = 'ar://ContentTxD00000000000000000000000000';
        const gateway = makeFakeArweaveGateway({
            transactionIds: [ANNOUNCEMENT_ID],
            envelopes: { [ANNOUNCEMENT_ID]: arweaveEnvelopeJson({ contentHash: 'hash-d', locator: CONTENT_TX, storage: 'arweave' }) }
        });
        const arweaveSource = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });
        const emptyCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const { queryService } = composeSnapshotCandidateDiscoveryRuntime({ arweaveSnapshotDiscoveryQueryService: arweaveSource, placementCatalog: emptyCatalog });

        const candidates = await queryService.search('forkbuild-snapshot');
        assert(candidates.length === 1, '1. exactly one Arweave-origin candidate is returned.');
        assert(candidates[0].contentHash === 'hash-d' && candidates[0].locator === CONTENT_TX && candidates[0].storage === 'arweave',
            '2. the candidate carries its contentHash/locator/storage unchanged, passed through the composite verbatim.');

        console.log('✓ Section D: an Arweave-discovered candidate\'s contentHash, locator, and storage survive the composite unchanged.');
    }

    // ===============================================================
    // Section E — Cross-source deduplication.
    // ===============================================================
    {
        // The example this milestone's own brief names: ar://ABC + hash-X,
        // reported identically by Local, Nostr, AND Arweave, converges to
        // exactly one candidate.
        const sharedCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        sharedCatalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-e', contentHash: 'hash-X', storage: 'arweave', locator: 'ar://ABC' }));

        const nostrEvents = [makeNostrEnvelopeEvent({ contentHash: 'hash-X', locator: 'ar://ABC', storage: 'arweave' })];
        const nostrSource = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(nostrEvents) });

        const ANNOUNCEMENT_ID = 'AnnounceTxE0000000000000000000000000000';
        const gateway = makeFakeArweaveGateway({
            transactionIds: [ANNOUNCEMENT_ID],
            envelopes: { [ANNOUNCEMENT_ID]: arweaveEnvelopeJson({ contentHash: 'hash-X', locator: 'ar://ABC', storage: 'arweave' }) }
        });
        const arweaveSource = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });

        const { queryService } = composeSnapshotCandidateDiscoveryRuntime({
            nostrSnapshotDiscoveryQueryService: nostrSource,
            arweaveSnapshotDiscoveryQueryService: arweaveSource,
            placementCatalog: sharedCatalog
        });
        const candidates = await queryService.search('forkbuild-snapshot');
        assert(candidates.length === 1, '1. ar://ABC + hash-X, reported by Local, Nostr, AND Arweave alike, converges to exactly one candidate.');
        assert(candidates[0].contentHash === 'hash-X' && candidates[0].locator === 'ar://ABC' && candidates[0].storage === 'arweave',
            '2. the surviving candidate carries the correct, shared identity.');

        console.log('✓ Section E: the SAME storage+contentHash+locator claim, reported by all three sources at once, still collapses to exactly one candidate — the dedup key is unchanged by adding a third source.');
    }

    // ===============================================================
    // Section F — Same hash, different locator remains distinct.
    // ===============================================================
    {
        // This milestone's own brief: Arweave ar://ABC+hash-X vs. Nostr
        // ar://DEF+hash-X must remain TWO candidates.
        const ANNOUNCEMENT_ID = 'AnnounceTxF0000000000000000000000000000';
        const gateway = makeFakeArweaveGateway({
            transactionIds: [ANNOUNCEMENT_ID],
            envelopes: { [ANNOUNCEMENT_ID]: arweaveEnvelopeJson({ contentHash: 'hash-X', locator: 'ar://ABC', storage: 'arweave' }) }
        });
        const arweaveSource = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });
        const nostrEvents = [makeNostrEnvelopeEvent({ contentHash: 'hash-X', locator: 'ar://DEF', storage: 'arweave' })];
        const nostrSource = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(nostrEvents) });

        const { queryService } = composeSnapshotCandidateDiscoveryRuntime({
            nostrSnapshotDiscoveryQueryService: nostrSource,
            arweaveSnapshotDiscoveryQueryService: arweaveSource,
            placementCatalog: new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider())
        });
        const candidates = await queryService.search('forkbuild-snapshot');
        assert(candidates.length === 2, '1. ar://ABC+hash-X (Arweave) and ar://DEF+hash-X (Nostr) remain TWO distinct candidates — same contentHash never means same locator.');
        assert(candidates.some((c) => c.locator === 'ar://ABC') && candidates.some((c) => c.locator === 'ar://DEF'),
            '2. both distinct locators are present in the result.');

        console.log('✓ Section F: two candidates sharing a contentHash but naming different locators — one from Arweave, one from Nostr — are never collapsed into one.');
    }

    // ===============================================================
    // Section G — Failure matrix (all eight combinations).
    // ===============================================================
    {
        const workingLocalCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        workingLocalCatalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-g', contentHash: 'hash-g-local', storage: 'ipfs', locator: 'ipfs://g-local' }));
        const emptyLocalCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());

        const workingNostr = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl([makeNostrEnvelopeEvent({ contentHash: 'hash-g-nostr', locator: 'ar://g-nostr', storage: 'arweave' })]) });
        const failingNostr = { search: () => Promise.reject(new Error('nostr-down')) };

        function makeWorkingArweave() {
            const id = 'AnnounceTxG0000000000000000000000000000';
            const gateway = makeFakeArweaveGateway({ transactionIds: [id], envelopes: { [id]: arweaveEnvelopeJson({ contentHash: 'hash-g-arweave', locator: 'ar://g-arweave', storage: 'arweave' }) } });
            return new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });
        }
        const failingArweave = { search: () => Promise.reject(new Error('arweave-down')) };

        const matrix = [
            { local: true, nostr: true, arweave: true, expectHashes: ['hash-g-local', 'hash-g-nostr', 'hash-g-arweave'] },
            { local: false, nostr: true, arweave: true, expectHashes: ['hash-g-nostr', 'hash-g-arweave'] },
            { local: true, nostr: false, arweave: true, expectHashes: ['hash-g-local', 'hash-g-arweave'] },
            { local: true, nostr: true, arweave: false, expectHashes: ['hash-g-local', 'hash-g-nostr'] },
            { local: false, nostr: false, arweave: true, expectHashes: ['hash-g-arweave'] },
            { local: false, nostr: true, arweave: false, expectHashes: ['hash-g-nostr'] },
            { local: true, nostr: false, arweave: false, expectHashes: ['hash-g-local'] },
            { local: false, nostr: false, arweave: false, expectHashes: [] }
        ];

        let index = 0;
        for (const row of matrix) {
            index += 1;
            const placementCatalog = row.local ? workingLocalCatalog : emptyLocalCatalog;
            const nostrSnapshotDiscoveryQueryService = row.nostr ? workingNostr : failingNostr;
            const arweaveSnapshotDiscoveryQueryService = row.arweave ? makeWorkingArweave() : failingArweave;

            const { queryService } = composeSnapshotCandidateDiscoveryRuntime({ nostrSnapshotDiscoveryQueryService, arweaveSnapshotDiscoveryQueryService, placementCatalog });
            const candidates = await queryService.search('forkbuild-snapshot');
            const gotHashes = candidates.map((c) => c.contentHash).sort();
            const wantHashes = row.expectHashes.slice().sort();
            assert(JSON.stringify(gotHashes) === JSON.stringify(wantHashes),
                `${index}. Local=${row.local ? '✓' : '✗'} Nostr=${row.nostr ? '✓' : '✗'} Arweave=${row.arweave ? '✓' : '✗'}: expected ${JSON.stringify(wantHashes)}, got ${JSON.stringify(gotHashes)}.`);
            assert(Array.isArray(candidates), `${index}b. search() always resolves to an array, never a rejection, for this combination.`);
        }

        console.log('✓ Section G: all eight Local/Nostr/Arweave availability combinations produce exactly the expected candidate set, and the whole call never rejects — no source is ever a fallback for another.');
    }

    // ===============================================================
    // Section H — Zero-source availability.
    // ===============================================================
    {
        const { queryService } = composeSnapshotCandidateDiscoveryRuntime({
            nostrSnapshotDiscoveryQueryService: { search: () => Promise.reject(new Error('down')) },
            arweaveSnapshotDiscoveryQueryService: { search: () => Promise.reject(new Error('down')) },
            placementCatalog: new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider())
        });
        const candidates = await queryService.search('forkbuild-snapshot');
        assert(Array.isArray(candidates) && candidates.length === 0,
            '1. with Local empty, Nostr failing, and Arweave failing, search() resolves to the existing, ordinary empty result — never a throw, never null.');

        console.log('✓ Section H: zero-source availability degrades to the pre-existing empty-array result, unchanged by adding Arweave.');
    }

    // ===============================================================
    // Section I — No ranking/fallback; arrival order preserved.
    // ===============================================================
    {
        const allSource = stripLineComments(readSource('application/SnapshotCandidateDiscoveryRuntimeComposition.js'))
            + stripLineComments(readSource('application/SnapshotCandidateDiscoveryQueryService.js'));
        assert(!/preferredSource|trustScore|rank\(|reselect|fallbackSource/i.test(allSource),
            '1. no ranking, preference, trust-scoring, or reselection concept exists in the composition or composite files.');

        const nostrSource = { search: async () => [{ contentHash: 'n1', locator: 'l-n1', storage: 's' }] };
        const arweaveSource = { search: async () => [{ contentHash: 'a1', locator: 'l-a1', storage: 's' }] };
        const catalogWithOne = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        catalogWithOne.add(new PublicationSnapshotPlacement({ publicationId: 'pub-i', contentHash: 'loc1', storage: 's', locator: 'l-loc1' }));

        const { queryService } = composeSnapshotCandidateDiscoveryRuntime({
            nostrSnapshotDiscoveryQueryService: nostrSource,
            arweaveSnapshotDiscoveryQueryService: arweaveSource,
            placementCatalog: catalogWithOne
        });
        const candidates = await queryService.search('tag');
        assert(candidates.map((c) => c.contentHash).join(',') === 'n1,a1,loc1',
            `2. results preserve construction order — Nostr, then Arweave, then Local — never re-sorted or ranked (got: ${candidates.map((c) => c.contentHash).join(',')}).`);

        console.log('✓ Section I: no ranking/fallback vocabulary exists in either file, and result order is exactly "sources in construction order, each source\'s own results in its own order."');
    }

    // ===============================================================
    // Section J — No second discovery path; command/monitor/resolver
    // untouched.
    // ===============================================================
    {
        const compositionSource = stripLineComments(readSource('application/SnapshotCandidateDiscoveryRuntimeComposition.js'));
        assert(!/WorldSnapshotDiscoveryMonitor|SnapshotPlacementResolver|WorldEncounter/.test(compositionSource),
            '1. the composition file mentions no monitor, resolver, or World Encounter concept — it only ever builds and injects sources.');

        const mainSource = stripLineComments(readSource('ui/main.js'));
        assert(/const discoverSnapshotCandidatesCommand = \(\) => executeDiscoverSnapshotCandidatesCommand\(\{\s*\n\s*discoveryTag: 'forkbuild-snapshot',\s*\n\s*discoveryQueryService: snapshotCandidateDiscoveryQueryService/.test(mainSource),
            '2. ui/main.js\'s own discoverSnapshotCandidatesCommand still calls the SAME snapshotCandidateDiscoveryQueryService binding — this milestone changed what feeds that binding, never the wiring around it.');
        assert(/new WorldSnapshotDiscoveryMonitor\(\{ discoverSnapshotCandidatesCommand \}\)/.test(mainSource),
            '3. worldSnapshotDiscoveryMonitor still wraps the SAME, unmodified discoverSnapshotCandidatesCommand.');

        // Behavioral confirmation: the composite works through the
        // existing, unmodified command/monitor boundary with three real
        // sources composed.
        const { monitor } = buildWalkingPipeline({
            nostrSnapshotDiscoveryQueryService: new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl([]) }),
            arweaveSnapshotDiscoveryQueryService: new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: makeFakeArweaveGateway({ transactionIds: [] }).fetchImpl }),
            placementCatalog: catalog
        });
        await monitor.observe(ctx(pos(0, 0, 0)));
        assert(monitor.lastError === null && monitor.lastResult.some((c) => c.contentHash === localCandidate.contentHash),
            '4. a real walking-triggered observe() call, through the existing, unmodified monitor and command, still surfaces the Local candidate alongside the (empty, here) Nostr/Arweave sources.');

        console.log('✓ Section J: no second discovery path exists; application/DiscoverSnapshotCandidatesCommand.js and application/WorldSnapshotDiscoveryMonitor.js remain exactly as they were, both by source and by live behavior.');
    }

    // ===============================================================
    // Section K — No Snapshot resolution during candidate discovery.
    // ===============================================================
    {
        let resolveCalls = 0;
        const resolver = new SnapshotPlacementResolver(new LocalAuthorizationVerifier());
        const originalResolve = resolver.resolve.bind(resolver);
        resolver.resolve = (...args) => { resolveCalls += 1; return originalResolve(...args); };

        const id = 'AnnounceTxK0000000000000000000000000000';
        const gateway = makeFakeArweaveGateway({ transactionIds: [id], envelopes: { [id]: arweaveEnvelopeJson({ contentHash: 'hash-k', locator: 'ar://k', storage: 'arweave' }) } });
        const arweaveSource = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });
        const { queryService } = composeSnapshotCandidateDiscoveryRuntime({ arweaveSnapshotDiscoveryQueryService: arweaveSource, placementCatalog: new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider()) });
        await queryService.search('tag');

        assert(resolveCalls === 0, '1. a resolver instance sitting in the same test run is never invoked by a search() cycle that now includes Arweave — candidate discovery and byte resolution stay two separate steps.');

        console.log('✓ Section K: composing Arweave into candidate discovery invokes no resolution of any kind — confirmed behaviorally against a real SnapshotPlacementResolver.');
    }

    // ===============================================================
    // Section L — Announcement transaction id never becomes a locator.
    // ===============================================================
    {
        const ANNOUNCEMENT_ID = 'AnnounceTxL0000000000000000000000000000';
        const CONTENT_TX = 'ar://ContentTxL00000000000000000000000000';
        const gateway = makeFakeArweaveGateway({
            transactionIds: [ANNOUNCEMENT_ID],
            envelopes: { [ANNOUNCEMENT_ID]: arweaveEnvelopeJson({ contentHash: 'hash-l', locator: CONTENT_TX, storage: 'arweave' }) }
        });
        const arweaveSource = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });
        const { queryService } = composeSnapshotCandidateDiscoveryRuntime({ arweaveSnapshotDiscoveryQueryService: arweaveSource, placementCatalog: new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider()) });

        const candidates = await queryService.search('tag');
        assert(candidates.length === 1, '1. exactly one candidate reaches the composite.');
        assert(candidates[0].locator === CONTENT_TX, '2. the candidate\'s locator names the CONTENT transaction the envelope itself declared.');
        assert(candidates[0].locator !== `ar://${ANNOUNCEMENT_ID}` && !candidates[0].locator.includes(ANNOUNCEMENT_ID),
            '3. the candidate\'s locator never names, or embeds, the ANNOUNCEMENT transaction id this file\'s own gateway fetch targeted — even after passing through the composite\'s own dedup/shape validation.');

        console.log('✓ Section L: an Arweave announcement transaction id never becomes a candidate locator, confirmed on the far side of the composite (not just inside ArweaveSnapshotDiscoveryQueryService.js\'s own unit coverage).');
    }

    // ===============================================================
    // Section M — Query-count baseline.
    // ===============================================================
    {
        const transactionIds = ['AnnounceTxM1', 'AnnounceTxM2', 'AnnounceTxM3'];
        const envelopes = {};
        transactionIds.forEach((id, i) => { envelopes[id] = arweaveEnvelopeJson({ contentHash: `hash-m-${i}`, locator: `ar://content-m-${i}`, storage: 'arweave' }); });
        const gateway = makeFakeArweaveGateway({ transactionIds, envelopes });
        const arweaveSource = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });

        let arweaveSearchCalls = 0;
        const originalSearch = arweaveSource.search.bind(arweaveSource);
        arweaveSource.search = (...args) => { arweaveSearchCalls += 1; return originalSearch(...args); };

        const { monitor } = buildWalkingPipeline({
            nostrSnapshotDiscoveryQueryService: new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl([]) }),
            arweaveSnapshotDiscoveryQueryService: arweaveSource,
            placementCatalog: new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider())
        });

        // ONE walking observation.
        await monitor.observe(ctx(pos(0, 0, 0)));

        assert(arweaveSearchCalls === 1, `1. one walking-triggered observation invokes the Arweave source's own search() EXACTLY once (got ${arweaveSearchCalls}) — never accidentally twice.`);
        const { graphqlCalls, gatewayCalls } = gateway.counts();
        assert(graphqlCalls === 1, `2. that one observation issues exactly one GraphQL request (got ${graphqlCalls}).`);
        assert(gatewayCalls === transactionIds.length, `3. that one observation issues exactly one gateway fetch PER discovered announcement transaction — ${transactionIds.length} found, ${gatewayCalls} fetched.`);
        assert(monitor.lastResult.length === transactionIds.length, '4. all three Arweave-discovered candidates reach the monitor\'s own result from that single observation.');

        console.log(`✓ Section M: one walking-triggered observation costs exactly 1 GraphQL request + N (=${transactionIds.length}) announcement-body gateway fetches from the Arweave source, and invokes that source's own search() exactly once — a factual baseline, not yet optimized, matching this milestone's own brief ("establish the actual behavior... don't optimize it yet").`);
    }

    // ===============================================================
    // Section N — Deliberately-excluded vocabulary absent from the diff.
    // ===============================================================
    {
        const diffSource = stripLineComments(readSource('application/SnapshotCandidateDiscoveryRuntimeComposition.js'));
        const excludedPattern = /walkingDistance|distanceFilter|\bcache\b|caching|throttl|batchQuery|graphqlBatch|retry|retries|\brank\(|preferredSource|fallbackSource|announcementSync/i;
        assert(!excludedPattern.test(diffSource),
            '1. application/SnapshotCandidateDiscoveryRuntimeComposition.js introduces none of: Arweave-specific walking/distance logic, caching, throttling, GraphQL batching, retry logic, ranking, preferred-source selection, automatic fallback, or cross-source announcement synchronization.');

        console.log('✓ Section N: none of the deliberately-excluded vocabulary this milestone\'s own brief named appears anywhere in the production composition file.');
    }

    // ===============================================================
    // Section O — Scope guard.
    // ===============================================================
    {
        const changedFiles = execSync('git status --porcelain -- . ":(exclude)ui/components/PublicationCard.js" ":(exclude)ui/components/PublicationList.js"' /* AMENDED BY 0.9.638 -- excludes ui/components/PublicationCard.js/PublicationList.js, its own unrelated, separately-justified Commentary distribution-selector UI change */, { cwd: SOURCE_ROOT.pathname })
            .toString().split('\n').map((line) => line.replace(/\n$/, '')).filter(Boolean)
            .map((line) => line.slice(3).trim());
        const expectedProductionFiles = ['application/SnapshotCandidateDiscoveryRuntimeComposition.js', 'ui/main.js'];
        const unexpectedProductionChanges = changedFiles.filter((f) =>
            !f.startsWith('tests/') && f !== 'tests.html' && !expectedProductionFiles.includes(f));
        assert(unexpectedProductionChanges.length === 0,
            `1. this milestone's own working-tree changes are scoped to application/SnapshotCandidateDiscoveryRuntimeComposition.js, ui/main.js, tests/, and tests.html — found unexpected: ${JSON.stringify(unexpectedProductionChanges)}.`);

        assert(!changedFiles.includes('application/DiscoverSnapshotCandidatesCommand.js'),
            '2. application/DiscoverSnapshotCandidatesCommand.js is untouched.');
        assert(!changedFiles.includes('application/WorldSnapshotDiscoveryMonitor.js'),
            '3. application/WorldSnapshotDiscoveryMonitor.js is untouched.');
        assert(!changedFiles.includes('application/SnapshotPlacementResolver.js'),
            '4. application/SnapshotPlacementResolver.js is untouched.');
        assert(!changedFiles.includes('application/ArweaveSnapshotDiscoveryQueryService.js'),
            '5. application/ArweaveSnapshotDiscoveryQueryService.js itself (0.9.499) is untouched — this milestone injects it, never modifies it.');

        console.log('✓ Section O: this milestone\'s own diff is scoped to exactly what it claims — the composition file, ui/main.js, and tests — with the walking pipeline\'s own command/monitor/resolver files, and the Arweave source class itself, all left unmodified.');
    }

    console.log('\n✓ FINAL DECISION.\n' +
'\n' +
'OUTCOME: ARWEAVE_COMPOSED_AS_THIRD_SNAPSHOT_CANDIDATE_SOURCE.\n' +
'\n' +
'WHY. Exactly one ArweaveSnapshotDiscoveryQueryService is constructed, in ui/main.js, and injected into the existing\n' +
'composeSnapshotCandidateDiscoveryRuntime() alongside the unchanged Nostr and Local wiring (Section A). The Arweave\n' +
'source shares the identical search(discoveryTag) contract (Section B), and Local+Nostr+Arweave all converge in one\n' +
'search() call (Section C), with Arweave candidates carrying their contentHash/locator/storage through unchanged\n' +
'(Section D). The existing storage+contentHash+locator dedup key collapses an identical claim reported by all three\n' +
"sources (Section E) while keeping same-hash/different-locator claims distinct (Section F). Every one of the eight\n" +
'Local/Nostr/Arweave availability combinations produces exactly the expected result, with no source ever a fallback\n' +
'for another (Section G), and zero availability degrades to the pre-existing empty result (Section H). No ranking or\n' +
'fallback exists, and result order is untouched (Section I). No second discovery path was introduced — the walking\n' +
'command and monitor are unchanged, by source and by live behavior (Section J) — and candidate discovery still never\n' +
'resolves bytes (Section K). An announcement transaction id never becomes a candidate locator, confirmed on the far\n' +
'side of the composite (Section L). One walking-triggered observation costs exactly one GraphQL request plus one\n' +
"gateway fetch per discovered announcement, and invokes the Arweave source's own search() exactly once — a measured\n" +
'baseline, deliberately left unoptimized (Section M). None of the deliberately-excluded vocabulary — distance\n' +
'filtering, caching, throttling, batching, retries, ranking, preferred-source selection, automatic fallback, or\n' +
'cross-source announcement synchronization — appears anywhere in the diff (Section N), which is itself scoped to\n' +
'exactly the composition file and ui/main.js (Section O).\n' +
'\n' +
'WHAT THIS MEANS. Walking-triggered Snapshot candidate discovery now converges Local, Nostr, and Arweave behind one\n' +
'source-agnostic composite, with the walking pipeline (DiscoverSnapshotCandidatesCommand, WorldSnapshotDiscoveryMonitor,\n' +
'SnapshotPlacementResolver, World Encounter, material loading, verification, placement, Repository admission) never\n' +
"touched. The next, deliberately separate milestone (0.9.501) is the flagship walk -> trigger -> Local/Nostr/Arweave\n" +
"discovery -> candidate selection -> resolve -> hash verify -> materialize -> place -> Repository admission -> World\n" +
'Encounter closure, against real production composition.\n');

    console.log('\n✅ All Snapshot Candidate Discovery Arweave Composition Integration Audit tests passed.');
}

run().then(() => {
    console.log('\n✓ All SnapshotCandidateDiscoveryArweaveCompositionIntegrationAudit tests passed');
}).catch((error) => {
    console.error('\n✗ SnapshotCandidateDiscoveryArweaveCompositionIntegrationAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
