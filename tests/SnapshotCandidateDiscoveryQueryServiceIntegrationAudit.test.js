import { execSync } from 'node:child_process';

import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, SNAPSHOT_DISCOVERY_ENVELOPE_VERSION } from '../core/SnapshotDiscoveryEnvelope.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { LocalSnapshotCandidateDiscoveryQueryService } from '../application/LocalSnapshotCandidateDiscoveryQueryService.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { SnapshotCandidateDiscoveryQueryService } from '../application/SnapshotCandidateDiscoveryQueryService.js';
import { composeSnapshotCandidateDiscoveryRuntime } from '../application/SnapshotCandidateDiscoveryRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { SnapshotPlacementResolver } from '../application/SnapshotPlacementResolver.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.9.485 — Walking-Triggered Snapshot Candidate Query Service Integration
// Audit.
//
// Production changes: application/LocalSnapshotCandidateDiscoveryQueryService.js
// (new), application/SnapshotCandidateDiscoveryQueryService.js (new),
// application/SnapshotCandidateDiscoveryRuntimeComposition.js (new), and
// ui/main.js (composes + provides the new service under
// `snapshotCandidateDiscoveryQueryService`; the pre-existing
// `discoverSnapshotCandidatesCommand`/`worldSnapshotDiscoveryMonitor`
// wiring is UNCHANGED — see Section K).
//
// ORIGINATING QUESTION. tests/PassivePeerSnapshotDiscoveryEndToEndIntegration
// Audit.test.js (0.9.484) closed the passive-peer mechanism end to end and
// named this milestone by number: "0.9.485's own Local + Nostr candidate
// query composition can now build on Peer as a passive, catalog-populating
// ingestion mechanism proven, live, all the way to hash-verified bytes —
// never as a third independent query provider." This audit proves that
// composition now exists, is architecturally sound, and is production-wired
// — without yet being threaded into walking discovery itself (0.9.486's own,
// deliberately separate, next step).
//
//   Section A — Contract: Local and Nostr sources share one shape.
//   Section B — Local candidates surface through the Local adapter.
//   Section C — Peer-derived candidates surface through Local, uniformly.
//   Section D — Nostr candidates surface through a real NostrSnapshot
//               DiscoveryQueryService instance.
//   Section E — Multi-source convergence.
//   Section F — Deduplication: identical claims collapse; claims that
//               merely share a contentHash do not.
//   Section G — Failure isolation across all four OK/FAIL combinations.
//   Section H — Provenance: no new PEER query-source identity invented.
//   Section I — Locator semantics: candidates remain unverified claims.
//   Section J — No material resolution.
//   Section K — No walking coupling.
//   Section L — No ranking/fallback.
//   Section M — Production composition root.
//   Section N — Boundary audit + this milestone's own diff scope.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

function readSource(relativePath) {
    return execSync(`cat "${relativePath}"`, { cwd: SOURCE_ROOT.pathname }).toString();
}

function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rliE' : '-rlE';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
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

function makeNostrEnvelopeEvent({ contentHash, locator, storage, publicationId, claimedPosition }) {
    const content = {
        protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
        version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
        contentHash, locator, storage
    };
    if (publicationId !== undefined) {
        content.publicationId = publicationId;
        content.claimedPosition = claimedPosition || { x: 0, y: 0, z: 0 };
    }
    return { content: JSON.stringify(content) };
}

const PRODUCTION_FILES = [
    'application/LocalSnapshotCandidateDiscoveryQueryService.js',
    'application/SnapshotCandidateDiscoveryQueryService.js',
    'application/SnapshotCandidateDiscoveryRuntimeComposition.js'
];

async function run() {
    console.log('=== 0.9.485 — Snapshot Candidate Discovery Query Service Integration Audit ===\n');

    // ===============================================================
    // Section A — Contract: Local and Nostr sources share one shape.
    // ===============================================================
    {
        const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const localSource = new LocalSnapshotCandidateDiscoveryQueryService(catalog);
        const nostrSource = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl([]) });

        assert(typeof localSource.search === 'function' && typeof nostrSource.search === 'function',
            '1. both Local and Nostr sources expose a search() method.');
        assert(localSource.search.length <= 1 && nostrSource.search.length <= 1,
            '2. both search() methods accept exactly one (discoveryTag) argument — the identical shape application/DiscoverSnapshotCandidatesCommand.js already requires.');

        const composite = new SnapshotCandidateDiscoveryQueryService([nostrSource, localSource]);
        assert(typeof composite.search === 'function',
            '3. the composite service itself exposes the identical search(discoveryTag) shape — usable anywhere a single source already is.');

        console.log('✓ Section A: LocalSnapshotCandidateDiscoveryQueryService and NostrSnapshotDiscoveryQueryService both implement the identical duck-typed search(discoveryTag) contract, and the composite service built from them exposes that same contract back out.');
    }

    // ===============================================================
    // Section B — Local candidates.
    // ===============================================================
    let bLocal, bCatalog;
    {
        bCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        bCatalog.add(new PublicationSnapshotPlacement({
            publicationId: 'pub-local-1', contentHash: 'hash-local-1', storage: 'ipfs', locator: 'ipfs://CID-local-1'
        }));
        bLocal = new LocalSnapshotCandidateDiscoveryQueryService(bCatalog);
        const composite = new SnapshotCandidateDiscoveryQueryService([bLocal]);

        const candidates = await composite.search('forkbuild-snapshot');
        assert(candidates.length === 1, '1. a single locally-declared placement produces exactly one candidate.');
        assert(candidates[0].contentHash === 'hash-local-1' && candidates[0].locator === 'ipfs://CID-local-1'
            && candidates[0].storage === 'ipfs' && candidates[0].publicationId === 'pub-local-1',
            '2. that candidate carries the declared placement\'s own fields, unchanged.');

        console.log('✓ Section B: a locally declared placement is returned through the composite query, via the Local adapter alone.');
    }

    // ===============================================================
    // Section C — Peer-derived candidates, through Local.
    // ===============================================================
    {
        // tests/PassivePeerSnapshotDiscoveryEndToEndIntegrationAudit.test.js
        // (0.9.484) already proved, live, over a real two-peer connection,
        // that a peer ANNOUNCE reaches this exact catalog via
        // application/PublicationSnapshotPlacementPeerExchange.js#_importAndPublish()
        // -> application/PublicationSnapshotPlacementExchange.js#importPlacement()
        // -> catalog.add() — and that the catalog itself then holds a
        // placement indistinguishable, by shape, from one added locally.
        // Re-running that whole live transport here would only re-derive
        // what 0.9.484 already exhaustively proved; this section instead
        // proves the ONE fact new to this milestone — that
        // LocalSnapshotCandidateDiscoveryQueryService, wrapping the SAME
        // catalog, surfaces such a placement through the composite query
        // with zero special-casing — by adding a second placement to the
        // Section B catalog the identical way catalog.add() itself is
        // reached in production (a real PublicationSnapshotPlacement,
        // added directly), standing in for "arrived via peer ANNOUNCE."
        bCatalog.add(new PublicationSnapshotPlacement({
            publicationId: 'pub-peer-1', contentHash: 'hash-peer-1', storage: 'arweave', locator: 'ar://tx-peer-1'
        }));

        const composite = new SnapshotCandidateDiscoveryQueryService([bLocal]);
        const candidates = await composite.search('forkbuild-snapshot');
        const own = candidates.find((c) => c.publicationId === 'pub-local-1');
        const peer = candidates.find((c) => c.publicationId === 'pub-peer-1');
        assert(own && peer, '1. the SAME single search() call surfaces both the earlier LOCAL placement and the newly-cataloged PEER-shaped one.');
        assert(Object.keys(own).sort().join(',') === Object.keys(peer).sort().join(','),
            '2. both candidates carry the identical field shape — nothing in the candidate stream distinguishes LOCAL from PEER origin, exactly as 0.9.484\'s own Section K already established for the catalog itself.');

        console.log('✓ Section C: a peer-announced placement — indistinguishable, by the catalog\'s own design, from a locally-declared one — is returned through Local, demonstrating the intended architecture: Peer ANNOUNCE -> Local catalog -> Local adapter -> Composite query, never a third query provider.');
    }

    // ===============================================================
    // Section D — Nostr candidates.
    // ===============================================================
    let dNostr;
    {
        const events = [makeNostrEnvelopeEvent({ contentHash: 'hash-nostr-1', locator: 'ar://tx-nostr-1', storage: 'arweave' })];
        dNostr = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(events) });
        const composite = new SnapshotCandidateDiscoveryQueryService([dNostr]);

        const candidates = await composite.search('forkbuild-snapshot');
        assert(candidates.length === 1 && candidates[0].contentHash === 'hash-nostr-1' && candidates[0].locator === 'ar://tx-nostr-1',
            '1. a real, unmodified NostrSnapshotDiscoveryQueryService instance\'s own announcement is returned through the composite query, unchanged.');

        console.log('✓ Section D: Nostr-discovered candidates, from a real NostrSnapshotDiscoveryQueryService instance (0.9.133, unmodified — no separate "Nostr adapter" class was needed, since it already matches the search(tag) contract), are returned by the composite query.');
    }

    // ===============================================================
    // Section E — Multi-source convergence.
    // ===============================================================
    {
        const composite = new SnapshotCandidateDiscoveryQueryService([dNostr, bLocal]);
        const candidates = await composite.search('forkbuild-snapshot');
        const wantIds = ['hash-nostr-1', 'hash-local-1', 'hash-peer-1'];
        for (const hash of wantIds) {
            assert(candidates.some((c) => c.contentHash === hash), `1. candidate ${hash} from the appropriate source is present in the unified result.`);
        }
        assert(candidates.length === 3, '2. exactly the union of both sources\' own candidates is returned — three total, no more, no fewer.');

        console.log('✓ Section E: the same discoveryTag, searched once, with candidates available from both Nostr and Local, produces one unified result carrying every distinct candidate from both.');
    }

    // ===============================================================
    // Section F — Deduplication.
    // ===============================================================
    {
        // F1. The SAME candidate — identical storage+contentHash+locator —
        // reported by two independent sources collapses to one entry.
        const sharedCandidate = { contentHash: 'hash-shared', locator: 'ipfs://CID-shared', storage: 'ipfs', publicationId: 'pub-shared' };
        const sourceA = { search: async () => [{ ...sharedCandidate }] };
        const sourceB = { search: async () => [{ ...sharedCandidate }] };
        const composite = new SnapshotCandidateDiscoveryQueryService([sourceA, sourceB]);
        const candidates = await composite.search('tag');
        assert(candidates.length === 1, '1. the identical claim, reported by two sources, collapses to exactly one candidate.');
        assert(candidates[0].publicationId === 'pub-shared', '2. the surviving candidate is the first-seen source\'s own (constructor order), verbatim.');

        // F2. THE SUBTLE CASE the milestone's own brief asked to be settled
        // structurally rather than by intuition: two candidates sharing a
        // contentHash but naming DIFFERENT locators are NOT the same
        // candidate — core/PublicationSnapshotPlacement.js's own header
        // explicitly holds these as two independently coexisting,
        // never-collapsed placements.
        const sourceC = { search: async () => [{ contentHash: 'hash-multi', locator: 'ipfs://CID-A', storage: 'ipfs' }] };
        const sourceD = { search: async () => [{ contentHash: 'hash-multi', locator: 'ipfs://CID-B', storage: 'ipfs' }] };
        const compositeMulti = new SnapshotCandidateDiscoveryQueryService([sourceC, sourceD]);
        const multiCandidates = await compositeMulti.search('tag');
        assert(multiCandidates.length === 2,
            '3. two candidates sharing a contentHash but naming DIFFERENT locators are both kept — the identical "different locators, never collapsed" rule core/PublicationSnapshotPlacement.js\'s own header already establishes for placements.');

        // F3. Symmetrically, the identical locator+storage but a
        // DIFFERENT contentHash is also never collapsed — a different
        // claim about what bytes live there.
        const sourceE = { search: async () => [{ contentHash: 'hash-X', locator: 'ipfs://CID-shared-2', storage: 'ipfs' }] };
        const sourceF = { search: async () => [{ contentHash: 'hash-Y', locator: 'ipfs://CID-shared-2', storage: 'ipfs' }] };
        const compositeConflict = new SnapshotCandidateDiscoveryQueryService([sourceE, sourceF]);
        const conflictCandidates = await compositeConflict.search('tag');
        assert(conflictCandidates.length === 2,
            '4. two candidates naming the same locator but a DIFFERENT contentHash are also both kept — never silently collapsed into one, which could hide a genuine conflict.');

        console.log('✓ Section F: deduplication collapses only a candidate whose storage+contentHash+locator all agree — the exact identity the existing PublicationSnapshotPlacement/candidate contract already establishes distinguishes one claim from another — and never contentHash alone.');
    }

    // ===============================================================
    // Section G — Failure isolation across all four combinations.
    // ===============================================================
    {
        const workingLocal = { search: async () => [{ contentHash: 'hash-g-local', locator: 'ipfs://g-local', storage: 'ipfs' }] };
        const workingNostr = { search: async () => [{ contentHash: 'hash-g-nostr', locator: 'ar://g-nostr', storage: 'arweave' }] };
        const rejectingSource = { search: () => Promise.reject(new Error('boom')) };
        const throwingSource = { search: () => { throw new Error('boom-sync'); } };
        const nonArraySource = { search: async () => 'not-an-array' };

        // G1. Local OK, Nostr OK.
        {
            const c = new SnapshotCandidateDiscoveryQueryService([workingNostr, workingLocal]);
            const result = await c.search('tag');
            assert(result.length === 2, '1. Local OK / Nostr OK: both sources\' candidates present.');
        }
        // G2. Local FAIL (rejecting), Nostr OK.
        {
            const c = new SnapshotCandidateDiscoveryQueryService([workingNostr, rejectingSource]);
            const result = await c.search('tag');
            assert(result.length === 1 && result[0].contentHash === 'hash-g-nostr',
                '2. Local FAIL (rejects) / Nostr OK: Nostr\'s own candidate still returned; the whole call never rejects.');
        }
        // G3. Local OK, Nostr FAIL (throws synchronously).
        {
            const c = new SnapshotCandidateDiscoveryQueryService([throwingSource, workingLocal]);
            const result = await c.search('tag');
            assert(result.length === 1 && result[0].contentHash === 'hash-g-local',
                '3. Local OK / Nostr FAIL (throws synchronously): Local\'s own candidate still returned.');
        }
        // G4. Local FAIL, Nostr FAIL (one rejects, one resolves non-array).
        {
            const c = new SnapshotCandidateDiscoveryQueryService([nonArraySource, rejectingSource]);
            const result = await c.search('tag');
            assert(Array.isArray(result) && result.length === 0,
                '4. Local FAIL / Nostr FAIL: the whole call still resolves, to an empty array, never rejecting or throwing.');
        }

        console.log('✓ Section G: every one of the four Local-OK/FAIL × Nostr-OK/FAIL combinations leaves the successful source\'s own candidates intact and never rejects or throws the whole search() call — a rejecting promise, a synchronous throw, and a non-array resolution are all isolated identically.');
    }

    // ===============================================================
    // Section H — Provenance.
    // ===============================================================
    {
        const compositeSource = stripLineComments(readSource('application/SnapshotCandidateDiscoveryQueryService.js'));
        const localSourceCode = stripLineComments(readSource('application/LocalSnapshotCandidateDiscoveryQueryService.js'));
        assert(!/PlacementAcquisitionKind/.test(compositeSource) && !/PlacementAcquisitionKind/.test(localSourceCode),
            '1. neither the composite service nor the Local adapter imports or references application/PlacementAcquisitionKind.js — no new PEER query-source identity is invented merely because a candidate might have originated from a peer.');
        assert(!/\borigin\b|acquisitionKind|provenance/i.test(compositeSource),
            '2. the composite service carries no origin/acquisitionKind/provenance field or concept of its own anywhere in its source.');

        console.log('✓ Section H: existing acquisition/provenance semantics (application/PlacementAcquisitionKind.js, unmodified) are preserved exactly as they already were — this milestone invents no new PEER query-source identity, and no candidate the composite returns ever carries a provenance field.');
    }

    // ===============================================================
    // Section I — Locator semantics.
    // ===============================================================
    {
        const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        catalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-i', contentHash: 'hash-i', storage: 'ipfs', locator: 'ipfs://CID-i' }));
        const composite = new SnapshotCandidateDiscoveryQueryService([new LocalSnapshotCandidateDiscoveryQueryService(catalog)]);
        const [candidate] = await composite.search('tag');

        const keys = Object.keys(candidate).sort();
        assert(keys.join(',') === 'contentHash,locator,publicationId,storage',
            `1. a returned candidate carries exactly the locator-claim fields (contentHash, locator, publicationId, storage) — found: ${keys.join(',')}.`);
        assert(candidate.bytes === undefined && candidate.verified === undefined && candidate.resolved === undefined,
            '2. no "bytes"/"verified"/"resolved" field is ever present — a candidate remains a locator CLAIM, never verified content.');

        console.log('✓ Section I: returned objects remain candidate locator claims — the identical shape every existing source in this family already produces — never anything resembling verified or retrieved content.');
    }

    // ===============================================================
    // Section J — No material resolution.
    // ===============================================================
    {
        const allSource = PRODUCTION_FILES.map((f) => stripLineComments(readSource(f))).join('\n');
        assert(!/SnapshotPlacementResolver/.test(allSource),
            '1. none of this milestone\'s three new files import, construct, or mention SnapshotPlacementResolver anywhere in their own source.');

        // Behavioral confirmation: a resolver constructed independently is
        // never invoked by the composite query — proven by monkey-patching
        // its one method and confirming a full search() cycle never calls it.
        let resolveCalls = 0;
        const resolver = new SnapshotPlacementResolver(new LocalAuthorizationVerifier());
        const originalResolve = resolver.resolve.bind(resolver);
        resolver.resolve = (...args) => { resolveCalls += 1; return originalResolve(...args); };

        const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        catalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-j', contentHash: 'hash-j', storage: 'ipfs', locator: 'ipfs://CID-j' }));
        const composite = new SnapshotCandidateDiscoveryQueryService([new LocalSnapshotCandidateDiscoveryQueryService(catalog)]);
        await composite.search('tag');
        assert(resolveCalls === 0, '2. a resolver instance that exists in the same test run is never called by a search() cycle — the composite query never resolves bytes.');

        console.log('✓ Section J: the composite service does not invoke SnapshotPlacementResolver, by source and behaviorally — candidate discovery and byte resolution remain two separate steps.');
    }

    // ===============================================================
    // Section K — No walking coupling.
    // ===============================================================
    {
        const allSource = PRODUCTION_FILES.map((f) => stripLineComments(readSource(f))).join('\n');
        assert(!/WorldSnapshotDiscoveryMonitor/.test(allSource),
            '1. none of this milestone\'s three new files import or mention WorldSnapshotDiscoveryMonitor.');
        assert(!/\bposition\b|movementThreshold|shouldRefresh|requestId/i.test(allSource),
            '2. no position, movement-threshold, shouldRefresh, or requestId concept exists anywhere in these three files — walking-trigger logic stays entirely WorldSnapshotDiscoveryMonitor\'s own.');

        // Behavioral confirmation: the composite service works standalone,
        // with no monitor constructed or imported anywhere in this section.
        const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        catalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-k', contentHash: 'hash-k', storage: 'ipfs', locator: 'ipfs://CID-k' }));
        const composite = new SnapshotCandidateDiscoveryQueryService([new LocalSnapshotCandidateDiscoveryQueryService(catalog)]);
        const result = await executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'forkbuild-snapshot', discoveryQueryService: composite });
        assert(result.length === 1 && result[0].contentHash === 'hash-k',
            '3. the composite service works through the existing, unmodified executeDiscoverSnapshotCandidatesCommand() boundary with no monitor anywhere in the picture.');

        // The pre-existing walking wiring is confirmed UNCHANGED by this
        // milestone: ui/main.js's own discoverSnapshotCandidatesCommand
        // still calls the single Nostr queryService alone, not the new
        // composite — wiring the composite in is 0.9.486's own job.
        const mainSource = readSource('ui/main.js');
        assert(/const discoverSnapshotCandidatesCommand = \(\) => executeDiscoverSnapshotCandidatesCommand\(\{\s*\n\s*discoveryTag: 'forkbuild-snapshot',\s*\n\s*discoveryQueryService: snapshotDiscoveryQueryService/.test(mainSource),
            '4. ui/main.js\'s own pre-existing discoverSnapshotCandidatesCommand still calls snapshotDiscoveryQueryService (Nostr) alone, unchanged — this milestone provides the new composite alongside it, without threading it into walking discovery yet.');

        console.log('✓ Section K: the composite service carries no walking-trigger concept of any kind, works standalone through the existing command boundary with no monitor present, and this milestone leaves the walking-triggered monitor\'s own existing wiring completely unchanged.');
    }

    // ===============================================================
    // Section L — No ranking/fallback.
    // ===============================================================
    {
        const allSource = PRODUCTION_FILES.map((f) => stripLineComments(readSource(f))).join('\n');
        assert(!/preferredSource|trustScore|rank\(|reselect|fallbackSource/i.test(allSource),
            '1. no ranking, preference, trust-scoring, or reselection concept exists anywhere in these three files.');

        // Behavioral confirmation: order is "sources in constructor order,
        // each source's own results in its own order" — never re-sorted.
        const sourceOne = { search: async () => [{ contentHash: 'z-last', locator: 'l-z', storage: 's' }, { contentHash: 'a-first', locator: 'l-a', storage: 's' }] };
        const sourceTwo = { search: async () => [{ contentHash: 'm-middle', locator: 'l-m', storage: 's' }] };
        const composite = new SnapshotCandidateDiscoveryQueryService([sourceOne, sourceTwo]);
        const candidates = await composite.search('tag');
        assert(candidates.map((c) => c.contentHash).join(',') === 'z-last,a-first,m-middle',
            '2. results preserve arrival order — first source\'s own results in their own order, then the next source\'s — never alphabetized, ranked, or otherwise reordered.');

        console.log('✓ Section L: results are never silently ranked, preferred, or reselected — order is exactly "sources in constructor order, each source\'s own results in its own order," and no ranking vocabulary exists anywhere in these files.');
    }

    // ===============================================================
    // Section M — Production composition root.
    // ===============================================================
    {
        // M1. Both sources usable: a real NostrSnapshotDiscoveryQueryService
        // and a real LocalPublicationSnapshotPlacementCatalog.
        const events = [makeNostrEnvelopeEvent({ contentHash: 'hash-m-nostr', locator: 'ar://m-nostr', storage: 'arweave' })];
        const nostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(events) });
        const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        catalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-m', contentHash: 'hash-m-local', storage: 'ipfs', locator: 'ipfs://CID-m' }));

        const { queryService } = composeSnapshotCandidateDiscoveryRuntime({
            nostrSnapshotDiscoveryQueryService: nostrService,
            placementCatalog: catalog
        });
        assert(queryService instanceof SnapshotCandidateDiscoveryQueryService,
            '1. composeSnapshotCandidateDiscoveryRuntime() constructs a real SnapshotCandidateDiscoveryQueryService.');
        const candidates = await queryService.search('forkbuild-snapshot');
        assert(candidates.some((c) => c.contentHash === 'hash-m-nostr') && candidates.some((c) => c.contentHash === 'hash-m-local'),
            '2. the composed service genuinely queries both the real Nostr service and the real Local catalog it was handed.');

        // M2. Graceful degradation: no usable Nostr capability still
        // produces a working, Local-only composite — never a throw.
        const { queryService: localOnly } = composeSnapshotCandidateDiscoveryRuntime({
            nostrSnapshotDiscoveryQueryService: null,
            placementCatalog: catalog
        });
        const localOnlyCandidates = await localOnly.search('forkbuild-snapshot');
        assert(localOnlyCandidates.length === 1 && localOnlyCandidates[0].contentHash === 'hash-m-local',
            '3. an absent Nostr capability degrades to a working, Local-only composite — never a throw, never a null queryService.');

        // M3. A missing placementCatalog still throws — required, never
        // defaulted, mirroring LocalSnapshotCandidateDiscoveryQueryService's
        // own constructor contract.
        let threw = false;
        try { composeSnapshotCandidateDiscoveryRuntime({ nostrSnapshotDiscoveryQueryService: nostrService }); }
        catch { threw = true; }
        assert(threw, '4. composeSnapshotCandidateDiscoveryRuntime() still throws when no placementCatalog is supplied at all.');

        // M4. ui/main.js actually wires this composition from the SAME
        // singleton collaborators — never a second Nostr construction, and
        // never a second catalog.
        const mainSource = stripLineComments(readSource('ui/main.js'));
        assert(/composeSnapshotCandidateDiscoveryRuntime\(\{\s*\n\s*nostrSnapshotDiscoveryQueryService: snapshotDiscoveryQueryService,\s*\n\s*placementCatalog: publicationSnapshotPlacementCatalog/.test(mainSource),
            '5. ui/main.js composes the runtime from the SAME snapshotDiscoveryQueryService and publicationSnapshotPlacementCatalog instances it already built for other purposes — never a second construction of either.');
        assert(!/new NostrSnapshotDiscoveryQueryService\([^)]*\)[\s\S]{0,400}composeSnapshotCandidateDiscoveryRuntime/.test(mainSource),
            '6. no second NostrSnapshotDiscoveryQueryService is constructed near this wiring.');
        const catalogConstructionSites = grepFiles('new LocalPublicationSnapshotPlacementCatalog\\(', ['application', 'ui']);
        assert(!catalogConstructionSites.includes('application/SnapshotCandidateDiscoveryRuntimeComposition.js')
            && !catalogConstructionSites.includes('application/LocalSnapshotCandidateDiscoveryQueryService.js')
            && !catalogConstructionSites.includes('ui/main.js'),
            `7. this milestone's own new files, and ui/main.js, construct no NEW LocalPublicationSnapshotPlacementCatalog of their own (found catalog construction sites: ${JSON.stringify(catalogConstructionSites)}) — they only ever receive the one pre-existing instance.`);
        assert(/app\.provide\('snapshotCandidateDiscoveryQueryService', snapshotCandidateDiscoveryQueryService\)/.test(mainSource),
            '8. the composed service is provided under its own key, distinct from the pre-existing discoverSnapshotCandidatesCommand/worldSnapshotDiscoveryMonitor provisions.');

        console.log('✓ Section M: the composition root constructs exactly one SnapshotCandidateDiscoveryQueryService from the existing, already-composed concrete Nostr and Local collaborators — no new global singleton, no second Nostr client, no second catalog — and gracefully degrades to a Local-only composite when no Nostr capability is available.');
    }

    // ===============================================================
    // Section N — Boundary audit.
    // ===============================================================
    {
        const allSource = PRODUCTION_FILES.map((f) => readSource(f)).join('\n');
        const allCode = stripLineComments(allSource);

        // N1. No peer protocol / peer exchange coupling.
        assert(!/import[^\n]*Peer|new\s+\w*Peer\w*\(/.test(allCode),
            '1. none of this milestone\'s three new files import or construct any Peer-named class — Peer\'s own contribution arrives entirely through the already-populated catalog.');
        const peerProtocolSource = stripLineComments(readSource('application/PublicationSnapshotPlacementPeerProtocol.js'));
        assert(!/SnapshotCandidateDiscoveryQueryService/.test(peerProtocolSource),
            '2. the peer protocol file has no knowledge of this milestone\'s new service either — the separation holds in both directions.');

        // N2. World Encounter material loading untouched.
        assert(!/WorldEncounter/.test(allCode),
            '3. no World Encounter material-loading concept appears anywhere in this milestone\'s new files.');

        // N3. Publication discovery/verification/attribution untouched.
        assert(!/import[^\n]*(?:VerifyPublicationUseCase|SnapshotPublicationAttribution|DecentralizedWorldDiscovery)/.test(allCode),
            '4. no Publication verification, attribution, or decentralized-lead machinery is imported anywhere in this milestone\'s new files.');

        // N4. Snapshot resolution/verification untouched (reconfirmed
        // structurally here; Section J already reconfirmed it behaviorally).
        assert(!/SnapshotPlacementResolutionOutcome/.test(allCode),
            '5. no resolution-outcome vocabulary appears anywhere in this milestone\'s new files.');

        // N5. Nostr announcement/publishing untouched — this milestone
        // only ever READS through the existing, unmodified query service.
        assert(!/NostrSnapshotDiscoveryPublisher|publishImpl/.test(allCode),
            '6. no Nostr publishing capability is referenced anywhere in this milestone\'s new files — this is a read-only composition.');
        const publisherSource = readSource('application/NostrSnapshotDiscoveryPublisher.js');
        assert(!/SnapshotCandidateDiscoveryQueryService/.test(publisherSource),
            '7. the Nostr publisher file is untouched by, and has no knowledge of, this milestone\'s new service.');

        // N6. Placement creation untouched.
        const createUseCaseSource = readSource('application/CreatePublicationSnapshotPlacementUseCase.js');
        assert(!/SnapshotCandidateDiscoveryQueryService/.test(createUseCaseSource),
            '8. application/CreatePublicationSnapshotPlacementUseCase.js is untouched by this milestone.');

        // N7. This milestone's own diff is scoped to exactly what its own
        // header names: three new application files, this one new test
        // file, tests.html's own registration, and ui/main.js.
        const changedFiles = execSync('git status --porcelain', { cwd: SOURCE_ROOT.pathname })
            .toString().split('\n').map((line) => line.replace(/\n$/, '')).filter(Boolean)
            .map((line) => line.slice(3).trim());
        const expectedProductionChange = 'ui/main.js';
        const unexpectedProductionChanges = changedFiles.filter((f) =>
            !f.startsWith('tests/') && f !== 'tests.html' && f !== expectedProductionChange
            && !PRODUCTION_FILES.includes(f));
        assert(unexpectedProductionChanges.length === 0,
            `9. this milestone's own working-tree changes are scoped to its three new application files, ui/main.js, tests/, and tests.html — found unexpected: ${JSON.stringify(unexpectedProductionChanges)}.`);

        console.log('✓ Section N: no changes to the peer protocol, peer exchange, World Encounter, Publication discovery/verification, Snapshot resolution, Nostr announcement/publishing, or placement creation — confirmed by source, in both directions — and this milestone\'s own diff is scoped to exactly what it claims.');
    }

    console.log('\n✓ FINAL DECISION.\n' +
'\n' +
'OUTCOME: SNAPSHOT_CANDIDATE_DISCOVERY_QUERY_SERVICE_READY.\n' +
'\n' +
"WHY. Local and Nostr candidate sources share one duck-typed search(discoveryTag) contract (Section A); a locally\n" +
'declared placement (Section B) and a peer-delivered one, indistinguishable through the same Local adapter (Section\n' +
"C), both surface correctly, alongside Nostr's own candidates (Section D), in one unified, converged result (Section\n" +
'E). Deduplication collapses only a candidate whose storage+contentHash+locator all agree — never contentHash alone\n' +
"-- reusing core/PublicationSnapshotPlacement.js's own already-established identity rule rather than inventing a new\n" +
'candidateId (Section F). Every combination of source failure leaves the working source\'s own candidates intact\n' +
'(Section G). No new PEER query-source identity was invented (Section H); candidates remain unverified locator\n' +
'claims (Section I); the service never resolves bytes (Section J) and carries no walking-trigger concept of any kind\n' +
"(Section K), leaving the pre-existing walking-triggered monitor's own wiring completely unchanged. No ranking or\n" +
'fallback exists (Section L). The production composition root builds exactly one composite from the existing,\n' +
'already-composed Nostr and Local collaborators, degrading gracefully to Local-only when no Nostr capability is\n' +
'available (Section M). Every named architectural boundary holds, and this milestone\'s own diff is scoped to\n' +
'exactly three new application files plus the one new provision in ui/main.js (Section N).\n' +
'\n' +
'WHAT THIS MEANS. The mechanisms 0.9.480 through 0.9.484 proved one link at a time -- Local browsing, Nostr\n' +
'browsing, and passive Peer ingestion into Local -- now compose into one, real, production-wired discovery\n' +
'capability: Local + Nostr as query sources, Peer remaining a passive, catalog-populating ingestion path, never a\n' +
'third query provider. It is provided, not yet consumed -- threading it into\n' +
"application/DiscoverSnapshotCandidatesCommand.js's own walking-triggered command, so movement actually converges\n" +
"Local+Nostr+passive-Peer, is 0.9.486's own, deliberately separate, next and now very small step.\n");

    console.log('\n✅ All Snapshot Candidate Discovery Query Service Integration Audit tests passed.');
}

run().then(() => {
    console.log('\n✓ All SnapshotCandidateDiscoveryQueryServiceIntegrationAudit tests passed');
}).catch((error) => {
    console.error('\n✗ SnapshotCandidateDiscoveryQueryServiceIntegrationAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
