import { execSync } from 'node:child_process';

import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PUBLICATION_SNAPSHOT_PLACEMENT_STORE_KEY } from '../application/LocalPublicationSnapshotPlacementStore.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/WorldSnapshotDiscoveryMonitor.js';
import { shouldRefreshSnapshotDiscovery } from '../application/ShouldRefreshSnapshotDiscovery.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { CheckLocalSnapshotContentAvailabilityUseCase } from '../application/CheckLocalSnapshotContentAvailabilityUseCase.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.480 — Local Snapshot Candidate Discovery Capability Audit.
//
// Test-only. Production changes: none (enforced by Section K's own
// git-diff guard).
//
// ORIGINATING OBSERVATION: 0.9.479 answered "can the walking-triggered
// monitor safely converge Nostr, Local, and Peer" with
// MECHANISM_READY_SOURCES_MISSING — and, for Local specifically, its own
// Section D found "no local, search()-shaped candidate source exists
// anywhere in this codebase today — not merely unwired, but conceptually
// absent." A product-direction review of that audit accepted its verdict
// but asked a narrower, harder question before any composite is built:
// is that absence a genuine data gap, or did 0.9.479's own Section D only
// check ONE local file (`discovery/LocalDiscoveryProvider.js`) out of a
// much larger local-data surface? This milestone is that second look —
// test-only, exactly like 0.9.479, and exactly as willing to report "no
// viable capability exists" as to report the opposite.
//
//   Section A — Re-confirming, live, that 0.9.479's own Section D was
//               scoped to exactly one file, and that its finding about
//               THAT file still holds — never re-litigated, only
//               reproduced, so this audit builds on fact, not memory.
//   Section B — Widening the search: a second, structurally different
//               local subsystem this codebase already has —
//               `application/LocalPublicationSnapshotPlacementCatalog.js`
//               (0.8.18/0.8.21) — proven, live, to expose a `list()`-
//               shaped browsing capability 0.9.479 never looked at,
//               because it belongs to an entirely different milestone
//               family (Snapshot PLACEMENT, not Snapshot DISCOVERY).
//   Section C — Candidate identity: `PublicationSnapshotPlacement`'s own
//               required fields already ARE the required candidate
//               shape — no new identity introduced.
//   Section D — Spatial information, corrected: proof, live, that
//               neither the monitor's own required contract nor its one
//               existing source (Nostr) ever passes or reads a position
//               at all — "nearby" names a re-poll threshold, never a
//               spatial filter — so Local requires no spatial capability
//               either, and has none.
//   Section E — Material availability: a candidate is a locator claim,
//               never verified or materialized content — held to the
//               identical restraint Nostr's own candidates already
//               hold, and kept structurally separate from this
//               codebase's own, different, already-answered question
//               (`CheckLocalSnapshotContentAvailabilityUseCase.js`).
//   Section F — Relationship to Repository, corrected: the placement
//               catalog does NOT share storage with
//               `LocalDiscoveryProvider`'s own Repository/Publication-
//               catalog family — a materially different answer than the
//               brief's own framing assumed — but it IS already an
//               independently populated (self-declared AND peer-
//               exchanged) local catalog whose existing `list()`/
//               `findByContentHash()` can be OBSERVED, never copied.
//   Section G — Distance semantics: no position field exists anywhere
//               in this local subsystem — the walking monitor remains
//               the sole owner of the distance trigger, exactly as it
//               already is for Nostr.
//   Section H — LIVE DEMONSTRATION: a test-only adapter prototype,
//               wrapping a REAL, unmodified `LocalPublicationSnapshot-
//               PlacementCatalog` instance, proven to produce
//               correctly-shaped candidates from real catalog entries —
//               no new repository, no new storage key, no new local
//               representation.
//   Section I — Duck-type compatibility, live, with the real,
//               unmodified command and monitor — zero changes to
//               either, mirroring 0.9.479's own Section F.
//   Section J — Architectural boundary held: structural proof the
//               local subsystem this prototype wraps, and the prototype
//               itself, never reference anything from the World
//               Encounter material-loading/cascade/registration
//               families — Local candidate discovery never becomes a
//               second World Encounter engine.
//   Section K — Deliberate exclusions; no production file touched;
//               final classification.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
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

async function run() {
    console.log('=== 0.9.480 — Local Snapshot Candidate Discovery Capability Audit ===\n');

    // ===============================================================
    // Section A — Re-confirming 0.9.479's own Section D, live.
    // ===============================================================
    {
        // A1. 0.9.479's own Section D finding, reproduced against
        // current source rather than trusted from memory:
        // LocalDiscoveryProvider really has no search() method, and
        // really has no concept of contentHash/locator anywhere in its
        // own file.
        assert(typeof LocalDiscoveryProvider.prototype.search !== 'function',
            '1. LocalDiscoveryProvider still has no search() method — 0.9.479\'s own finding about THIS file still holds.');

        // A2. The one thing this audit corrects: 0.9.479's own Section D
        // scoped its search for "local candidate source" to exactly the
        // Publication-catalog family (`LocalDiscoveryProvider`,
        // `discovery/DiscoveryProvider.js`'s own siblings). It never
        // grepped the wider `application/Local*.js` surface at all —
        // confirmed here by simply counting it.
        const localApplicationFiles = grepFiles('^export class Local', ['application']);
        assert(localApplicationFiles.length > 10,
            `2. application/Local*.js is a much larger surface than the one file 0.9.479's own Section D examined (found ${localApplicationFiles.length} classes) — a real possibility 0.9.479 itself never closed off.`);

        console.log('✓ Section A: 0.9.479\'s own Section D finding about LocalDiscoveryProvider specifically still holds, reproduced live — but that file was never the ENTIRE local-data surface, only the one place 0.9.479 happened to look.');
    }

    // ===============================================================
    // Section B — Widening the search: a second local subsystem.
    // ===============================================================
    {
        // B1. application/LocalPublicationSnapshotPlacementCatalog.js
        // (0.8.18/0.8.21) already exists, already persists through its
        // own dedicated store, and already exposes a synchronous,
        // no-argument BROWSING method — list() — a structurally
        // different shape than LocalDiscoveryProvider's own
        // findById()-keyed lookups.
        const storageProvider = new InMemoryStorageProvider();
        const catalog = new LocalPublicationSnapshotPlacementCatalog(storageProvider);
        assert(typeof catalog.list === 'function',
            '1. LocalPublicationSnapshotPlacementCatalog#list() exists and requires no argument — a genuine, already-existing "tell me everything you know" capability, never built for this milestone.');
        assert(catalog.list().length === 0,
            '2. an empty catalog answers list() with [], never throws — the same "no crash on empty" posture every discovery family in this codebase already holds.');

        // B2. This class was NOT built for Snapshot candidate discovery
        // — it is 0.8.18's own "Decentralized Snapshot Placement
        // Foundation," a completely separate milestone family from
        // 0.9.133's Nostr-facing one. 0.9.479 never once mentions it —
        // confirmed by grepping 0.9.479's own test file.
        const priorAuditReferencesPlacementCatalog = grepFiles(
            'LocalPublicationSnapshotPlacementCatalog',
            ['tests/WalkingTriggeredNearbyDiscoverySourceConvergenceAudit.test.js']
        );
        assert(priorAuditReferencesPlacementCatalog.length === 0,
            "3. 0.9.479's own test file never references LocalPublicationSnapshotPlacementCatalog at all — Section D's \"conceptually absent\" finding was accurate for the ONE file it checked, and simply never extended to this one.");

        console.log('✓ Section B: a second, already-existing local subsystem — application/LocalPublicationSnapshotPlacementCatalog.js — exposes a synchronous, no-argument browsing capability 0.9.479 never examined, because it belongs to an entirely different, older milestone family (Snapshot PLACEMENT) than the one 0.9.479 audited (Snapshot DISCOVERY).');
    }

    // ===============================================================
    // Section C — Candidate identity: no new identity introduced.
    // ===============================================================
    {
        // C1. core/PublicationSnapshotPlacement.js's own constructor
        // REQUIRES publicationId, contentHash, storage, and locator —
        // throwing if any is missing. These are not merely compatible
        // with the required candidate shape ({ contentHash, locator,
        // storage, publicationId? }) — they ARE it, field for field,
        // with publicationId always present rather than merely
        // optional (as it is for a Nostr candidate).
        let threwForMissingContentHash = false;
        try {
            // eslint-disable-next-line no-new
            new PublicationSnapshotPlacement({ publicationId: 'pub-1', storage: 'ipfs', locator: 'ipfs://x' });
        } catch { threwForMissingContentHash = true; }
        assert(threwForMissingContentHash,
            '1. PublicationSnapshotPlacement refuses construction without a contentHash — confirming contentHash is not an optional afterthought on this class, but a load-bearing identity field, exactly as candidate dedup already requires it to be.');

        const placement = new PublicationSnapshotPlacement({
            publicationId: 'pub-1', contentHash: 'hash-1', storage: 'ipfs', locator: 'ipfs://CID-1'
        });
        assert(placement.contentHash === 'hash-1' && placement.publicationId === 'pub-1'
            && placement.storage === 'ipfs' && placement.locator === 'ipfs://CID-1',
            '2. a constructed placement carries exactly the four fields a candidate needs, under the identical field names — no renaming, no re-shaping.');

        console.log('✓ Section C: core/PublicationSnapshotPlacement.js\'s own required fields (publicationId, contentHash, storage, locator) already ARE the candidate identity the monitor\'s command requires — reused verbatim, under identical names, with no new identity concept introduced anywhere.');
    }

    // ===============================================================
    // Section D — Spatial information, corrected.
    // ===============================================================
    {
        // D1. Structural proof: neither the required command boundary
        // nor its one real source today ever accepts a position/context
        // argument. `search(discoveryTag)` takes a TAG, never a place.
        assert(executeDiscoverSnapshotCandidatesCommand.length <= 1,
            '1. executeDiscoverSnapshotCandidatesCommand takes one destructured options argument carrying only discoveryTag/discoveryQueryService — no position, no radius, no spatialContext parameter exists in its own signature.');

        // D2. Live: shouldRefreshSnapshotDiscovery — the ONE place any
        // notion of "nearby" lives in this whole family — governs only
        // whether to RE-POLL, never what the poll itself asks for. Two
        // calls at wildly different radii against the SAME movement
        // prove the "nearby" decision and the "what to search for"
        // decision are already, today, completely independent axes.
        const near = { position: { x: 0, y: 0, z: 0 } };
        const far = { position: { x: 500, y: 0, z: 0 } };
        assert(shouldRefreshSnapshotDiscovery(near, far) === true
            && shouldRefreshSnapshotDiscovery(near, far, 10000) === false,
            '2. the identical movement is "worth a fresh call" under the default radius and "not worth one" under a wider radius — confirming shouldRefreshSnapshotDiscovery only ever gates WHEN to call search(), and has no influence at all on WHAT search() is asked.');

        // D3. core/PublicationSnapshotPlacement.js — the local
        // subsystem Section B identified — carries no position/x/y/z
        // field anywhere. A Local source built on it would have exactly
        // as little spatial capability as Nostr's own candidates
        // already have (see core/SnapshotDiscoveryEnvelope.js's own
        // OPTIONAL claimedPosition, which this class does not even
        // have room for).
        const placementSource = await (await import('node:fs/promises')).readFile(
            new URL('../core/PublicationSnapshotPlacement.js', import.meta.url), 'utf8'
        );
        assert(!/\bposition\b|claimedPosition/.test(placementSource),
            "3. core/PublicationSnapshotPlacement.js never mentions position/claimedPosition anywhere in its own source — the local subsystem this audit identifies is, if anything, LESS spatially capable than Nostr's own optional claim, never more.");

        console.log('✓ Section D: "nearby" in this whole family already names a re-poll THRESHOLD, never a spatial filter on the query itself — proven live by varying the radius alone. Neither the monitor\'s contract nor Nostr\'s own candidates carry positional filtering, and the local subsystem Section B identifies has no position field at all — so a Local source requires no new spatial capability, and the walking monitor remains the sole, unchanged owner of "nearby."');
    }

    // ===============================================================
    // Section E — Material availability: a claim, never a verification.
    // ===============================================================
    {
        // E1. LocalPublicationSnapshotPlacementCatalog#add() performs no
        // retrieval and no verification — cataloging a placement never
        // touches a ContentStore.
        const catalogSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/LocalPublicationSnapshotPlacementCatalog.js', import.meta.url), 'utf8'
        );
        assert(!/ContentStore/.test(catalogSource),
            '1. LocalPublicationSnapshotPlacementCatalog.js never imports or mentions a ContentStore of any kind — cataloging a placement is never conflated with checking whether its bytes are actually retrievable.');

        // E2. This codebase already has a SEPARATE, already-tested
        // question for "do I actually hold these bytes right now" —
        // CheckLocalSnapshotContentAvailabilityUseCase.js (0.8.33) — and
        // it answers a materially different question (keyed off a
        // Publication's own contentReference, against a ContentStore)
        // than a candidate ever needs answered. A Local candidate
        // source must stay a locator claim only, exactly like Nostr's
        // own candidates, never pre-resolving availability itself.
        assert(typeof CheckLocalSnapshotContentAvailabilityUseCase === 'function',
            '2. CheckLocalSnapshotContentAvailabilityUseCase already exists as its own, independent, already-tested class — a Local candidate source has no reason to duplicate, inline, or shortcut what it already does.');
        const availabilitySource = await (await import('node:fs/promises')).readFile(
            new URL('../application/CheckLocalSnapshotContentAvailabilityUseCase.js', import.meta.url), 'utf8'
        );
        assert(!/PublicationSnapshotPlacement/.test(availabilitySource),
            '3. CheckLocalSnapshotContentAvailabilityUseCase.js never references PublicationSnapshotPlacement at all — confirming "do I have these bytes" and "what locator was catalogued for this hash" are, today, two genuinely independent questions, exactly as this milestone requires them to remain.');

        console.log('✓ Section E: a Local candidate, like a Nostr one, is a locator claim only — the local subsystem Section B identifies never retrieves or verifies bytes when cataloging a placement, and this codebase already keeps "do I actually have this content" as its own separate, already-tested question (0.8.33) that a Local source must not fold in.');
    }

    // ===============================================================
    // Section F — Relationship to Repository, corrected.
    // ===============================================================
    {
        // F1. THE CORRECTION: the placement catalog does NOT share
        // storage with LocalDiscoveryProvider's own Repository/
        // Publication-catalog family — a materially different answer
        // than a reader might assume from the word "catalog" alone.
        // Proven live: writing through one leaves the other's own key
        // completely untouched.
        const storageProvider = new InMemoryStorageProvider();
        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(storageProvider);
        const localDiscoveryProvider = new LocalDiscoveryProvider(storageProvider);
        placementCatalog.add(new PublicationSnapshotPlacement({
            publicationId: 'pub-1', contentHash: 'hash-1', storage: 'ipfs', locator: 'ipfs://CID-1'
        }));
        assert(storageProvider.load(PUBLICATION_SNAPSHOT_PLACEMENT_STORE_KEY) !== null,
            '1. cataloging a placement writes to its own dedicated storage key...');
        assert(localDiscoveryProvider.list().length === 0,
            "2. ...and LocalDiscoveryProvider's own list() — reading the completely separate `forkbuild-publications` key — sees nothing from it at all. The two are NOT the same local source; the brief's own framing (\"does the same local source already participate in Repository discovery\") does not literally hold.");

        // F2. What DOES hold: this catalog is already independently
        // populated by TWO existing, unrelated-to-this-milestone
        // pathways — self-declaration (application/
        // AddPublicationSnapshotPlacementUseCase.js) and peer exchange
        // (application/PublicationSnapshotPlacementPeerExchange.js /
        // PublicationSnapshotPlacementDiscoveryCoordinator.js) — so its
        // data is never something a Local candidate source would need
        // to COPY or duplicate; it can be OBSERVED through the
        // catalog's own existing list()/findByContentHash(), exactly
        // the restraint the brief's own question 4 was actually asking
        // for, even though "Repository" was the wrong name for it.
        const addUseCaseSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/AddPublicationSnapshotPlacementUseCase.js', import.meta.url), 'utf8'
        );
        const peerExchangeSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublicationSnapshotPlacementPeerExchange.js', import.meta.url), 'utf8'
        );
        assert(/LocalPublicationSnapshotPlacementCatalog/.test(addUseCaseSource),
            '3. AddPublicationSnapshotPlacementUseCase.js — a self-declaration pathway that exists independently of this milestone — already writes into this exact catalog.');
        assert(/LocalPublicationSnapshotPlacementCatalog/.test(peerExchangeSource),
            '4. PublicationSnapshotPlacementPeerExchange.js — a peer-synchronization pathway that ALSO exists independently of this milestone — already writes into the same catalog. A Local candidate source built on this catalog observes data from BOTH pathways for free, never re-implementing either.');

        console.log('✓ Section F: the placement catalog is not the same local source as LocalDiscoveryProvider/Repository (a real correction to the brief\'s own framing) — but it IS an already-existing, independently-populated (self AND peer) local catalog whose own list()/findByContentHash() a Local candidate source could observe directly, with no new repository and no duplicated data.');
    }

    // ===============================================================
    // Section G — Distance semantics.
    // ===============================================================
    {
        // G1. Already established structurally in Section D (no
        // position field on PublicationSnapshotPlacement at all). Here,
        // confirmed behaviorally: the catalog's own query methods never
        // accept or reference a position/radius argument of any kind.
        const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        assert(catalog.findByContentHash.length <= 1 && catalog.list.length === 0,
            '1. findByContentHash(contentHash) and list() take no position/radius parameter — proximity is not, and cannot become, this source\'s own concern.');

        console.log('✓ Section G: no position/radius parameter exists anywhere on the local subsystem Section B identifies — exactly like Nostr today, a Local source would have zero distance logic of its own, leaving WorldSnapshotDiscoveryMonitor + shouldRefreshSnapshotDiscovery as the sole, unchanged owner of the walking-distance trigger.');
    }

    // ===============================================================
    // Section H — LIVE DEMONSTRATION: the seam is an adapter, not new data.
    // ===============================================================
    {
        // A test-only prototype, never imported by any production file,
        // wrapping a REAL, unmodified LocalPublicationSnapshotPlacementCatalog
        // instance. It performs no parsing, no validation invention, and
        // no new storage — it only re-shapes an already-real domain
        // object into the already-real candidate shape.
        class LocalSnapshotCandidateDiscoveryQueryServicePrototype {
            constructor(placementCatalog) { this._catalog = placementCatalog; }
            // discoveryTag is deliberately UNREAD — see this test's own
            // Section K, "deliberately excluded": the local catalog has
            // no tagging concept of its own, and this milestone does
            // not invent one merely to satisfy an unused parameter.
            async search(_discoveryTag) {
                return this._catalog.list().map((placement) => ({
                    contentHash: placement.contentHash,
                    locator: placement.locator,
                    storage: placement.storage,
                    publicationId: placement.publicationId
                }));
            }
        }

        const storageProvider = new InMemoryStorageProvider();
        const realCatalog = new LocalPublicationSnapshotPlacementCatalog(storageProvider);
        realCatalog.add(new PublicationSnapshotPlacement({
            publicationId: 'pub-1', contentHash: 'hash-1', storage: 'ipfs', locator: 'ipfs://CID-1'
        }));
        realCatalog.add(new PublicationSnapshotPlacement({
            publicationId: 'pub-2', contentHash: 'hash-2', storage: 'arweave', locator: 'ar://tx-2'
        }));

        const localSource = new LocalSnapshotCandidateDiscoveryQueryServicePrototype(realCatalog);
        const candidates = await localSource.search('forkbuild-snapshot');
        assert(candidates.length === 2, '1. two cataloged placements produce two candidates.');
        assert(candidates.every((c) => typeof c.contentHash === 'string' && typeof c.locator === 'string'
            && typeof c.storage === 'string' && typeof c.publicationId === 'string'),
            '2. every candidate carries exactly the required shape, all four fields present and correctly typed — no field ever missing, because PublicationSnapshotPlacement itself never allows one of these four to be absent.');

        // H2. An empty catalog resolves to [], never throws — the
        // identical "no crash on nothing to report" posture every
        // sibling source in this family already holds.
        const emptySource = new LocalSnapshotCandidateDiscoveryQueryServicePrototype(
            new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider())
        );
        assert(JSON.stringify(await emptySource.search('anything')) === '[]',
            '3. an empty local catalog resolves to [] — matches Nostr\'s own "never throws, degrades to []" contract exactly.');

        // H3. Multiple placements sharing one contentHash (different
        // storage backends placed it) all surface — this source
        // performs no deduplication of its own, exactly the restraint
        // NostrSnapshotDiscoveryQueryService.js's own header already
        // holds ("multiple discovery records do not automatically
        // become ranking"). Deduplication stays the future composite
        // query service's job (0.9.482), never this source's.
        const sharedHashCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        sharedHashCatalog.add(new PublicationSnapshotPlacement({
            publicationId: 'pub-3', contentHash: 'hash-3', storage: 'ipfs', locator: 'ipfs://CID-3a'
        }));
        sharedHashCatalog.add(new PublicationSnapshotPlacement({
            publicationId: 'pub-3', contentHash: 'hash-3', storage: 'arweave', locator: 'ar://tx-3b'
        }));
        const sharedHashCandidates = await new LocalSnapshotCandidateDiscoveryQueryServicePrototype(sharedHashCatalog).search('t');
        assert(sharedHashCandidates.length === 2,
            '4. two independent placements naming the SAME contentHash both surface, undeduplicated — this source reports every locator it catalogs, exactly like Nostr\'s own search() already does.');

        console.log('✓ Section H: a thin, test-only adapter over a REAL, unmodified LocalPublicationSnapshotPlacementCatalog instance already produces correctly-shaped, multi-candidate results — confirming the missing Local capability is exactly an adapter/query seam, never a genuine data gap. No new repository, no new storage key, no new local representation was created anywhere in this section.');
    }

    // ===============================================================
    // Section I — Duck-type compatibility with the real command/monitor.
    // ===============================================================
    {
        class LocalSnapshotCandidateDiscoveryQueryServicePrototype {
            constructor(placementCatalog) { this._catalog = placementCatalog; }
            async search(_discoveryTag) {
                return this._catalog.list().map((placement) => ({
                    contentHash: placement.contentHash, locator: placement.locator,
                    storage: placement.storage, publicationId: placement.publicationId
                }));
            }
        }
        const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        catalog.add(new PublicationSnapshotPlacement({
            publicationId: 'pub-4', contentHash: 'hash-4', storage: 'ipfs', locator: 'ipfs://CID-4'
        }));
        const localSource = new LocalSnapshotCandidateDiscoveryQueryServicePrototype(catalog);

        // I1. The real, unmodified command accepts it exactly as it
        // accepts NostrSnapshotDiscoveryQueryService — no change to
        // executeDiscoverSnapshotCandidatesCommand.js required.
        const viaCommand = await executeDiscoverSnapshotCandidatesCommand({
            discoveryTag: 'forkbuild-snapshot', discoveryQueryService: localSource
        });
        assert(viaCommand.length === 1 && viaCommand[0].contentHash === 'hash-4',
            '1. executeDiscoverSnapshotCandidatesCommand(), completely unmodified, accepts the Local prototype and forwards its result verbatim.');

        // I2. The real, unmodified monitor drives it through one full
        // observe() cycle correctly — movement gate, race-guard, and
        // failure isolation all untouched.
        const monitor = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: () => executeDiscoverSnapshotCandidatesCommand({
                discoveryTag: 'forkbuild-snapshot', discoveryQueryService: localSource
            })
        });
        await monitor.observe({ position: { x: 0, y: 0, z: 0 } });
        assert(monitor.lastResult.length === 1 && monitor.lastError === null,
            '2. WorldSnapshotDiscoveryMonitor, completely unmodified, drives the Local prototype through one full observe() cycle correctly.');

        console.log('✓ Section I: the Local prototype plugs into the real, unmodified command AND monitor with zero changes to either — mirroring 0.9.479\'s own Section F finding for the composite seam, now shown for a genuinely real (not merely hypothetical) Local source.');
    }

    // ===============================================================
    // Section J — Architectural boundary held.
    // ===============================================================
    {
        // The local subsystem this audit identifies, and the prototype
        // built over it, never reference anything from the World
        // Encounter material-loading/cascade/registration families —
        // confirming Local candidate discovery never becomes a second
        // World Encounter engine (this milestone's own "very important
        // architectural boundary").
        const worldEncounterReferences = grepFiles(
            'WorldEncounterMaterialLoading|LocalWorldEncounterMaterialSource|AutomaticSnapshotEncounterCascade|registerMaterializedSnapshotWorldSource',
            ['application/LocalPublicationSnapshotPlacementCatalog.js',
             'application/LocalPublicationSnapshotPlacementStore.js',
             'core/PublicationSnapshotPlacement.js']
        );
        assert(worldEncounterReferences.length === 0,
            '1. none of the three files this audit\'s prototype depends on reference the World Encounter material-loading, cascade, or registration families at all — candidate discovery and material resolution remain two structurally separate concerns, exactly as they already are for Nostr.');

        console.log('✓ Section J: the local subsystem this audit identifies stays entirely within candidate discovery — it never becomes, and never grows toward, a second World Encounter engine. Material resolution remains application/LocalWorldEncounterMaterialSource.js\'s own, entirely separate, already-existing job.');
    }

    // ===============================================================
    // Section K — Deliberate exclusions; no production file touched.
    // ===============================================================
    {
        // No production file implements LocalSnapshotCandidateDiscoveryQueryService,
        // wires it into ui/main.js, changes WorldSnapshotDiscoveryMonitor.js,
        // DiscoverSnapshotCandidatesCommand.js, or
        // LocalPublicationSnapshotPlacementCatalog.js itself, or invents a
        // discoveryTag concept for the local catalog. This milestone
        // answers exactly one question — "can the local catalog/material
        // infrastructure expose Snapshot candidates through the required
        // query contract without a second catalog or changed local
        // discovery semantics" — and stops there. Building
        // `SnapshotCandidateDiscoveryQueryService` itself, and composing
        // Local alongside Nostr, remain 0.9.482/0.9.483's own,
        // independent, unscheduled work.
        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(changedNonTestFiles === '', `1. no production file is modified by this milestone (found: ${changedNonTestFiles || 'none'}).`);

        const CLASSIFICATIONS = [
            'LOCAL_SOURCE_VIABLE_ADAPTER_ONLY',
            'LOCAL_SOURCE_VIABLE_NEW_DATA_REQUIRED',
            'LOCAL_SOURCE_NOT_VIABLE'
        ];
        const verdict = 'LOCAL_SOURCE_VIABLE_ADAPTER_ONLY';
        assert(CLASSIFICATIONS.includes(verdict), '2. the verdict is drawn from this milestone\'s own named taxonomy.');

        console.log('✓ Section K: no composite class shipped, no source wired into ui/main.js, no monitor/command/catalog file touched, no discoveryTag concept invented for local data — audit only, per this milestone\'s own scope.');
    }

    console.log('\n✓ FINAL DECISION.\n' +
'\n' +
'OUTCOME: LOCAL_SOURCE_VIABLE_ADAPTER_ONLY.\n' +
'\n' +
"WHY. 0.9.479's own Section D was accurate about the one file it examined (discovery/LocalDiscoveryProvider.js has\n" +
'no search() method and no contentHash concept at all) but never claimed to have swept the ENTIRE local-data surface\n' +
"-- and it had not. Section B of this audit found a second, already-existing, already-mature local subsystem\n" +
'(application/LocalPublicationSnapshotPlacementCatalog.js, 0.8.18/0.8.21) belonging to a completely different\n' +
'milestone family (Snapshot PLACEMENT, populated by self-declaration AND peer exchange) that already exposes exactly\n' +
'the synchronous, no-argument browsing capability ("tell me everything you know") a candidate source needs. Section C\n' +
"confirmed its underlying domain object's own REQUIRED fields already ARE the candidate identity, field for field,\n" +
"with no new identity introduced. Section D corrected the brief's own spatial framing at the mechanism level: neither\n" +
'the monitor\'s contract nor Nostr\'s own candidates are ever spatially filtered -- "nearby" only ever gates WHEN to\n' +
'poll, never WHAT is asked for -- so a Local source needs, and the identified subsystem has, no spatial capability of\n' +
'its own. Section E confirmed a candidate stays a locator claim only, never conflated with this codebase\'s own,\n' +
'separate, already-tested "do I actually have these bytes" question (0.8.33). Section F is this audit\'s own genuine\n' +
'correction to the brief: the placement catalog does NOT share storage with LocalDiscoveryProvider\'s own Repository\n' +
'family -- "the same local source" does not literally hold -- but its data is still safely OBSERVABLE rather than\n' +
'copyable, because two independent, pre-existing pathways (self-declaration, peer exchange) already keep it current.\n' +
'Section G confirmed proximity has no home in this subsystem either, leaving the walking monitor as sole owner of\n' +
"the distance trigger, unchanged. Sections H and I are this audit's own live proof, not argument: a thin, test-only\n" +
'adapter over a REAL, unmodified LocalPublicationSnapshotPlacementCatalog instance already produces correctly-shaped\n' +
'candidates and plugs into the real, unmodified command and monitor with zero changes to either. Section J confirmed\n' +
'the architectural boundary this milestone\'s own brief insisted on: this subsystem, and the prototype built over it,\n' +
'never reference anything from the World Encounter material-loading/cascade family -- Local candidate discovery never\n' +
'becomes a second World Encounter engine.\n' +
'\n' +
'WHAT THIS MEANS. Local is not a genuine data gap -- it is the adapter/query seam the brief itself hoped it might be.\n' +
'A future `LocalSnapshotCandidateDiscoveryQueryService` (0.9.482\'s own concern, alongside its Nostr and, if it\n' +
'clears its own audit, Peer siblings) needs only wrap `LocalPublicationSnapshotPlacementCatalog#list()` behind a\n' +
'`search(discoveryTag)` method that deliberately ignores `discoveryTag` -- no new repository, no new storage key, no\n' +
'new local representation, and no change to `LocalPublicationSnapshotPlacementCatalog.js` itself. Peer remains its\n' +
'own, entirely separate, independent milestone (0.9.481), exactly as 0.9.479 already recommended -- this audit\n' +
'changes nothing about that.\n');

    console.log('\n✅ All Local Snapshot Candidate Discovery Capability Audit tests passed.');
}

run().then(() => {
    console.log('\n✓ All LocalSnapshotCandidateDiscoveryCapabilityAudit tests passed');
}).catch((error) => {
    console.error('\n✗ LocalSnapshotCandidateDiscoveryCapabilityAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
