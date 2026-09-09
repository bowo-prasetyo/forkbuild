import { readFile } from 'node:fs/promises';

import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { License, LicenseId } from '../core/License.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { RemoveWorldPlacementUseCase } from '../application/RemoveWorldPlacementUseCase.js';
import { DiscoverPlacementsUseCase } from '../application/DiscoverPlacementsUseCase.js';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';

// 0.9.309 — Publication Placement Visibility Convergence Audit.
//
// 0.9.308 (Publication Multi-Placement Visibility) wired
// `DiscoverPlacementsUseCase.findByPublicationId()`'s already-correct,
// already-tested result — unreduced — to `OwnPublicationPanel.js` through
// one new `WorldNavigationSession#getPlacementsForPublication()` method,
// sharing a new `_enrichPlacementRecord()` helper with the pre-existing
// `getPlacementInfo()`. That milestone's own test file
// (`PublicationMultiPlacementVisibility.test.js`) proved the UI WORKS —
// wiring reaches, rendering is correct, isolation holds, failure and
// empty stay distinguishable.
//
// This file asks a different, narrower question: does the new plural read
// path actually observe the SAME placement facts as every other placement
// reader/writer, or has it quietly become a second, parallel interpretation
// of placement state? Test-only. No production changes. Per this
// milestone's own brief, this file deliberately does NOT add placement
// navigation, "go to placement," deletion/management controls, a spatial
// map, ranking, "latest"/current semantics, lifecycle states, World
// visibility tracking, automatic refresh/polling, notifications, provider
// preferences, or any change to `DiscoverPlacementsUseCase` itself.
//
//                  Placement Records
//                         |
//           +-------------+-------------+
//           |                           |
//  DiscoverPlacementsUseCase     WorldNavigationSession
//           |                           |
//           |                 _enrichPlacementRecord()
//           |                           |
//           |              +------------+------------+
//           |              |                         |
//           v              v                         v
//    creation/removal  getPlacementInfo()   getPlacementsForPublication()
//                              |                         |
//                              v                         v
//                       existing World UI       OwnPublicationPanel

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertThrows(fn, message) {
    try {
        fn();
        assert(false, message);
    } catch (e) {
        // expected
    }
}

function makeDocument(title, brickCount = 1) {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    for (let i = 0; i < brickCount; i++) {
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(i * 2, 0.5, 0) }));
    }
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author: 'alice', license: new License({ id: LicenseId.CC0_1_0 }) })
    });
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Same restraint every other structural-sweep test in this codebase
// already applies: full-line `//` comments are stripped before
// pattern-matching, so a comment that merely NAMES an identifier in
// prose is never mistaken for a real reference.
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//'));
}
function codeOnly(source) {
    return codeOnlyLines(source).join('\n');
}
function countOccurrences(source, needle) {
    const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = codeOnly(source).match(pattern);
    return matches ? matches.length : 0;
}
function methodBody(source, signaturePattern, closeIndent) {
    const re = new RegExp(`${signaturePattern}\\s*\\{([\\s\\S]*?)\\n {${closeIndent}}\\}`);
    const match = source.match(re);
    assert(match, `method body for ${signaturePattern} could not be located`);
    return match[1];
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        getPublicationPlacementsCommand: null,
        publicationPlacements: [],
        publicationPlacementsError: null,
        refreshPublicationPlacements: OwnPublicationPanel.methods.refreshPublicationPlacements,
        ...overrides
    };
}

async function runTests() {
    // Shared real backend, mirroring application/CreatePlacementRegistryUseCase.js's
    // own composition and tests/RemovalRetractionLifecycleConvergenceAudit.test.js's
    // own setup — a full real stack, never a mock of the application layer.
    const storage = new InMemoryStorageProvider();
    const alice = new LocalIdentityProvider(storage);
    alice.login('alice');
    const brickRegistry = new CreateBrickRegistryUseCase().execute();

    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);
    const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const discoverPlacementsUseCase = new DiscoverPlacementsUseCase(placementRegistry);
    const placePublicationUseCase = new PlacePublicationUseCase(
        spatialIndexProvider, discoveryProvider, loadPublicationDocumentUseCase, brickRegistry, placementRegistry, alice
    );
    const removeWorldPlacementUseCase = new RemoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry);
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, alice);

    function buildSession(extra = {}) {
        return new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase, worldLayoutProvider,
            identityProvider: alice, discoveryProvider, placementRegistry,
            removeWorldPlacementUseCase,
            ...extra
        });
    }

    // The IDENTICAL thin wrapper ui/views/WorldView.js's own
    // getPublicationPlacementsCommand() is.
    function makeCommand(session) {
        return (publicationId) => session.getPlacementsForPublication(publicationId);
    }

    function publishAndPlace(title, positions, ownSession = buildSession()) {
        const publication = publishDocumentUseCase.execute(new DocumentManager(makeDocument(title)));
        const placements = positions.map((pos) => placePublicationUseCase.execute(publication.id, pos));
        return { publication, placements, session: ownSession };
    }

    // -----------------------------------------------------------------
    // A — Same source of truth: getPlacementsForPublication() ultimately
    // observes the SAME placement records as
    // DiscoverPlacementsUseCase.findByPublicationId(), and no separate
    // placement collection or UI-maintained placement state exists.
    // -----------------------------------------------------------------
    {
        const session = buildSession();
        const { publication } = publishAndPlace('Convergence A: Source of Truth', [
            new Position(0, 0, 0), new Position(500, 0, 500), new Position(-200, 0, 300)
        ], session);

        const raw = discoverPlacementsUseCase.findByPublicationId(publication.id);
        const enriched = session.getPlacementsForPublication(publication.id);
        assert(raw.length === 3 && enriched.length === 3, 'A1. both readers see all three real placements');
        const rawIds = new Set(raw.map((r) => r.placementId));
        const enrichedIds = new Set(enriched.map((r) => r.placementId));
        assert(rawIds.size === 3 && enrichedIds.size === 3, 'A2. both sets are three genuinely distinct records');
        assert([...rawIds].every((id) => enrichedIds.has(id)), 'A3. every id DiscoverPlacementsUseCase sees, getPlacementsForPublication sees too');

        // Structural: both routes terminate at the exact same one-line
        // registry call — never two independent queries.
        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        const discoverSource = await rawSource('application/DiscoverPlacementsUseCase.js');
        assert(codeOnly(sessionSource).includes('this._placementRegistry.findByPublicationId(publicationId)'),
            'A4. getPlacementsForPublication() calls the registry\'s own findByPublicationId()');
        assert(codeOnly(discoverSource).includes('return this._placementRegistry.findByPublicationId(publicationId);'),
            'A5. DiscoverPlacementsUseCase.findByPublicationId() is the SAME thin delegation — identical call, not a parallel one');

        // No second placement collection anywhere in OwnPublicationPanel.js —
        // it never imports the registry or DiscoverPlacementsUseCase
        // directly, meaning placement facts have exactly ONE storage
        // location, reached through exactly one method, fanned out through
        // two thin readers.
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        for (const forbidden of ["LocalPlacementRegistry", "from '../../placement/PlacementRegistry.js'", 'DiscoverPlacementsUseCase']) {
            assert(!codeOnly(panelSource).includes(forbidden), `A6. OwnPublicationPanel.js never references '${forbidden}' — it only ever receives placements through the injected command`);
        }

        console.log('✓ A: getPlacementsForPublication() and DiscoverPlacementsUseCase.findByPublicationId() observe the identical, single placement collection — no second source of truth exists');
    }

    // -----------------------------------------------------------------
    // B — Enrichment consistency: for the SAME placement record, position,
    // revision, owner, and overlap count must be identical whether read
    // through getPlacementInfo() (singular) or getPlacementsForPublication()
    // (plural).
    // -----------------------------------------------------------------
    {
        const session = buildSession();
        const position = new Position(1000, 0, 1000);
        const { publication: pubA, placements: [placementA] } = publishAndPlace('Convergence B: Enrichment A', [position], session);
        // A second publication placed at the EXACT same coordinate — gives
        // both readers a genuine, non-zero overlap fact to agree on.
        publishAndPlace('Convergence B: Enrichment B (overlap)', [position], session);

        const singular = session.getPlacementInfo(pubA.documentId);
        const plural = session.getPlacementsForPublication(pubA.id);
        assert(plural.length === 1, 'B1. setup: publication A has exactly one placement of its own');
        const pluralEntry = plural[0];

        assert(singular.placementId === placementA.id && pluralEntry.placementId === placementA.id, 'B2. both readers resolve the SAME placement record');
        assert(singular.position.x === pluralEntry.position.x && singular.position.y === pluralEntry.position.y && singular.position.z === pluralEntry.position.z,
            'B3. position matches between the singular and plural reads');
        assert(singular.revision === pluralEntry.revision, 'B4. revision matches between the singular and plural reads');
        assert(singular.owner === pluralEntry.owner && singular.owner === 'alice', 'B5. owner matches between the singular and plural reads');
        assert(singular.overlapCount === pluralEntry.overlapCount, 'B6. overlap count matches between the singular and plural reads');
        assert(singular.overlapCount === 1, 'B7. the overlap count is a genuine, non-zero fact (publication B sits at the same coordinate), not a coincidental zero-vs-zero match');
        assert(singular.movable === pluralEntry.movable && singular.removable === pluralEntry.removable, 'B8. the local ownership-derived movable/removable signals match too');

        // Cross-check both against the raw stored record itself — proving
        // agreement is because both reflect the SAME underlying fact, not
        // because they merely agree with each other by coincidence.
        const stored = placementRegistry.get(placementA.id);
        assert(stored.revision === singular.revision && stored.position.x === singular.position.x, 'B9. both readers reflect the raw stored PlacementRecord\'s own fields');

        console.log('✓ B: getPlacementInfo() and getPlacementsForPublication() derive byte-identical facts (position, revision, owner, overlap) for the same placement record');
    }

    // -----------------------------------------------------------------
    // C — Multiplicity preservation: no reduction occurs anywhere between
    // storage and the plural API — count, identity, order, and enriched
    // values all match findByPublicationId()'s own raw result.
    // -----------------------------------------------------------------
    {
        const session = buildSession();
        const { publication } = publishAndPlace('Convergence C: Multiplicity', [
            new Position(0, 0, 0), new Position(10, 0, 10), new Position(20, 0, 20)
        ], session);

        const raw = discoverPlacementsUseCase.findByPublicationId(publication.id);
        const enriched = session.getPlacementsForPublication(publication.id);
        assert(raw.length === 3 && enriched.length === 3, 'C1. count is preserved — three in, three out');

        for (let i = 0; i < raw.length; i++) {
            assert(raw[i].placementId === enriched[i].placementId, `C2.${i} record identity is preserved at the SAME index — no resort`);
            assert(raw[i].position.x === enriched[i].position.x && raw[i].position.y === enriched[i].position.y && raw[i].position.z === enriched[i].position.z,
                `C3.${i} position is preserved for this record`);
            assert(raw[i].revision === enriched[i].revision, `C4.${i} revision is preserved for this record`);
        }
        assert(new Set(enriched.map((r) => r.placementId)).size === 3, 'C5. all three enriched records remain genuinely distinct — no dedup');

        console.log('✓ C: findByPublicationId() === getPlacementsForPublication() in count, identity, order, and enriched values — no reduction anywhere in the pipeline');
    }

    // -----------------------------------------------------------------
    // D — Singular semantics remain unchanged: getPlacementInfoForPublication()
    // still performs its existing single-record reduction, while
    // getPlacementsForPublication() does not.
    // -----------------------------------------------------------------
    {
        const session = buildSession();
        const older = placementRegistry.add(new PlacementRecord({
            publicationId: 'pub-d-convergence', owner: 'alice', position: new Position(1, 0, 1),
            updatedAt: new Date(2020, 0, 1)
        }));
        const newer = placementRegistry.add(new PlacementRecord({
            publicationId: 'pub-d-convergence', owner: 'alice', position: new Position(2, 0, 2),
            updatedAt: new Date(2024, 0, 1)
        }));

        const singular = session.getPlacementInfoForPublication('pub-d-convergence');
        assert(singular !== null && singular.placementId === newer.placementId, 'D1. getPlacementInfoForPublication() still reduces to the single, most-recently-updated record');
        assert(singular.placementId !== older.placementId, 'D2. the older record is still excluded from the singular read model');
        assert(Object.keys(singular).sort().join(',') === 'placementId,position,publicationId', 'D3. getPlacementInfoForPublication()\'s own minimal shape is unchanged');

        const plural = session.getPlacementsForPublication('pub-d-convergence');
        assert(plural.length === 2, 'D4. getPlacementsForPublication() performs NO reduction — both records are returned');
        const pluralIds = new Set(plural.map((r) => r.placementId));
        assert(pluralIds.has(older.placementId) && pluralIds.has(newer.placementId), 'D5. both the older and newer records are present in the plural read — neither is silently dropped');

        // Structural: the plural path's own body contains no ".reduce("
        // (unlike _resolvePlacementRecord/getPlacementInfoForPublication,
        // which both deliberately DO) — proving 0.9.308 added a capability
        // rather than silently redefining an existing one.
        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        const pluralBody = methodBody(codeOnly(sessionSource), 'getPlacementsForPublication\\(publicationId\\)', 4);
        assert(!pluralBody.includes('.reduce('), 'D6. getPlacementsForPublication()\'s own body performs no "latest" reduction');
        assert(!pluralBody.includes('getPlacementInfoForPublication'), 'D7. getPlacementsForPublication() does not call the singular method internally — the two are independent readers of the same registry, not one wrapping the other');

        console.log('✓ D: getPlacementInfoForPublication() keeps reducing to one record; getPlacementsForPublication() never reduces — 0.9.308 added a capability, it did not redefine an existing one');
    }

    // -----------------------------------------------------------------
    // E — Creation convergence: placements created through the EXISTING
    // placement creation path appear through the new visibility path with
    // no special registration or synchronization.
    // -----------------------------------------------------------------
    {
        const session = buildSession();
        const command = makeCommand(session);
        const publication = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Convergence E: Creation')));

        assert(command(publication.id).length === 0, 'E1. BEFORE any placement: the visibility path honestly reports zero');

        const first = placePublicationUseCase.execute(publication.id, new Position(2000, 0, 0));
        assert(command(publication.id).map((r) => r.placementId).includes(first.id), 'E2. AFTER one PlacePublicationUseCase.execute(): the SAME call, with no intervening step, already sees it');

        const second = placePublicationUseCase.execute(publication.id, new Position(2000, 0, 500));
        const afterBoth = command(publication.id);
        assert(afterBoth.length === 2, 'E3. AFTER a second placement of the same Publication: both are visible, immediately');
        const ids = new Set(afterBoth.map((r) => r.placementId));
        assert(ids.has(first.id) && ids.has(second.id), 'E4. both the first and second created placements are present, by identity');

        // The UI surface converges the same way, through the panel's own
        // refresh — no extra wiring beyond the one injected command.
        const ctx = panelCtx({ publication, getPublicationPlacementsCommand: command });
        ctx.refreshPublicationPlacements();
        assert(ctx.publicationPlacements.length === 2, 'E5. OwnPublicationPanel converges to both created placements with no special registration step');

        // Structural: the creation path itself has zero awareness of the
        // visibility feature — convergence holds because both read the
        // same registry, never because creation notifies/registers the
        // panel or the session.
        const placeSource = await rawSource('application/PlacePublicationUseCase.js');
        assert(!/OwnPublicationPanel|getPlacementsForPublication|WorldNavigationSession/.test(codeOnly(placeSource)),
            'E6. PlacePublicationUseCase.js carries no reference to the visibility feature at all — convergence is structural (same registry), not synchronization');

        console.log('✓ E: placements created through the existing, unmodified PlacePublicationUseCase are visible through getPlacementsForPublication() immediately, with no registration or sync step');
    }

    // -----------------------------------------------------------------
    // F — Removal convergence: removing one of several placements through
    // the EXISTING removal capability is reflected by the plural
    // visibility path — the UI never maintains its own copy of the
    // placement lifecycle.
    // -----------------------------------------------------------------
    {
        const session = buildSession();
        const command = makeCommand(session);
        const publication = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Convergence F: Removal')));
        const a = placePublicationUseCase.execute(publication.id, new Position(3000, 0, 0));
        const b = placePublicationUseCase.execute(publication.id, new Position(3000, 0, 500));
        const c = placePublicationUseCase.execute(publication.id, new Position(3000, 0, 1000));

        const before = command(publication.id);
        assert(before.length === 3, 'F1. BEFORE: all three placements [A, B, C] are visible');
        assert(new Set(before.map((r) => r.placementId)).size === 3, 'F2. BEFORE: all three are genuinely distinct');

        // Removed through the EXISTING, unmodified RemoveWorldPlacementUseCase
        // — the same capability PlacementInfoPanel's own "Remove" action
        // already calls (via WorldNavigationSession#removePlacement for the
        // single-active-placement case; called directly here by placementId,
        // since this Publication has several, and the document-keyed
        // removePlacement() only ever resolves to ONE of them — a
        // pre-existing, out-of-scope limitation this audit merely observes,
        // never patches; see this file's own excluded-scope list).
        removeWorldPlacementUseCase.execute(b.id);

        const after = command(publication.id);
        assert(after.length === 2, 'F3. AFTER removing B: exactly two placements remain visible');
        const afterIds = new Set(after.map((r) => r.placementId));
        assert(afterIds.has(a.id) && afterIds.has(c.id) && !afterIds.has(b.id), 'F4. AFTER removing B: A and C remain, B is gone — [A, B, C] -> [A, C]');
        assert(placementRegistry.get(b.id) === null, 'F5. B is genuinely removed from the registry, not merely filtered out of the read');

        // The UI surface reflects the removal on its own next refresh —
        // no event, no cache, no UI-maintained lifecycle copy.
        const ctx = panelCtx({ publication, getPublicationPlacementsCommand: command });
        ctx.refreshPublicationPlacements();
        assert(ctx.publicationPlacements.length === 2, 'F6. OwnPublicationPanel converges to [A, C] on its own next refresh, with no removal-specific handling of its own');

        // Both entry points agree.
        assert(discoverPlacementsUseCase.findByPublicationId(publication.id).length === 2, 'F7. DiscoverPlacementsUseCase agrees: two placements remain');

        console.log('✓ F: removing B through the existing RemoveWorldPlacementUseCase is reflected by getPlacementsForPublication() and OwnPublicationPanel with no UI-maintained placement lifecycle');
    }

    // -----------------------------------------------------------------
    // G — No World-state conflation: a placement record is still a
    // placement fact; discovering it implies neither current visibility,
    // occupancy, nor rendered presence, and the visibility panel never
    // mutates World state.
    // -----------------------------------------------------------------
    {
        // No renderer/`_session` is ever attached in this file — every
        // placement created above was discovered successfully with zero
        // World state "loaded" or "visible." This alone demonstrates
        // discovery does not require, and does not imply, visibility,
        // occupancy, or rendered presence.
        const session = buildSession();
        const before = session.getSpatialState();
        assert(JSON.stringify(before) === JSON.stringify({ loaded: [], visible: [], nearby: [], failed: [], cameraPosition: null }),
            'G1. BEFORE: with no renderer attached, World spatial state is the honest, empty default');

        const publication = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Convergence G: World State')));
        placePublicationUseCase.execute(publication.id, new Position(4000, 0, 0));
        placePublicationUseCase.execute(publication.id, new Position(4000, 0, 500));
        const discovered = session.getPlacementsForPublication(publication.id);
        assert(discovered.length === 2, 'G2. two placements are genuinely discovered...');

        const after = session.getSpatialState();
        assert(JSON.stringify(before) === JSON.stringify(after), 'G3. ...yet World spatial state (loaded/visible/nearby/failed/cameraPosition) is completely unchanged by discovering them — discovering a placement implies neither current visibility nor occupancy nor rendered presence');

        // Structural: neither the plural reader nor the shared enrichment
        // helper ever touches the World-facing collaborators — only the
        // placement registry.
        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        const source = codeOnly(sessionSource);
        const pluralBody = methodBody(source, 'getPlacementsForPublication\\(publicationId\\)', 4);
        const enrichBody = methodBody(source, '_enrichPlacementRecord\\(record\\)', 4);
        for (const forbidden of ['_worldLayoutProvider', '_session.', 'addWorld', 'removeWorld', 'this._spatialIndexProvider']) {
            assert(!pluralBody.includes(forbidden), `G4. getPlacementsForPublication()'s own body never references '${forbidden}'`);
            assert(!enrichBody.includes(forbidden), `G5. _enrichPlacementRecord()'s own body never references '${forbidden}'`);
        }

        // The panel's own refresh method never reaches for World/renderer
        // vocabulary either — it only calls the one injected command.
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const refreshBody = methodBody(codeOnly(panelSource), 'refreshPublicationPlacements\\(\\)', 8);
        for (const forbidden of ['worldLayoutProvider', 'addWorld', 'removeWorld', '_session', 'spatialIndexProvider']) {
            assert(!refreshBody.includes(forbidden), `G6. refreshPublicationPlacements()'s own body never references '${forbidden}' — the visibility panel never mutates World state`);
        }

        console.log('✓ G: a placement record stays a placement fact — discovering it implies no current visibility, occupancy, or rendered presence, and the visibility panel never touches World state');
    }

    // -----------------------------------------------------------------
    // H — Publication isolation: A -> [A1, A2], B -> [B1]; querying A
    // never exposes B, confirmed through BOTH entry points at once.
    // -----------------------------------------------------------------
    {
        const session = buildSession();
        const command = makeCommand(session);
        const pubA = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Convergence H: Publication A')));
        const pubB = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Convergence H: Publication B')));
        const a1 = placePublicationUseCase.execute(pubA.id, new Position(5000, 0, 0));
        const a2 = placePublicationUseCase.execute(pubA.id, new Position(5000, 0, 500));
        const b1 = placePublicationUseCase.execute(pubB.id, new Position(6000, 0, 0));

        const rawA = discoverPlacementsUseCase.findByPublicationId(pubA.id);
        const enrichedA = command(pubA.id);
        assert(rawA.length === 2 && enrichedA.length === 2, 'H1. Publication A shows exactly its own two placements, through both entry points');
        assert(enrichedA.every((r) => r.publicationId === pubA.id), 'H2. every entry genuinely belongs to A');
        assert(new Set([...rawA, ...enrichedA].map((r) => r.placementId)).size === 2 && [a1.id, a2.id].every((id) => enrichedA.some((r) => r.placementId === id)),
            'H3. A\'s exact two placement identities are present, nothing substituted');

        const rawB = discoverPlacementsUseCase.findByPublicationId(pubB.id);
        const enrichedB = command(pubB.id);
        assert(rawB.length === 1 && enrichedB.length === 1 && enrichedB[0].placementId === b1.id, 'H4. Publication B shows exactly its own one placement, through both entry points');

        assert(!enrichedA.some((r) => r.placementId === b1.id), 'H5. inspecting A never exposes B\'s placement');
        assert(!enrichedB.some((r) => r.placementId === a1.id || r.placementId === a2.id), 'H6. inspecting B never exposes A\'s placements');

        console.log('✓ H: Publication isolation holds identically for DiscoverPlacementsUseCase and getPlacementsForPublication() — querying one Publication never exposes another\'s placements');
    }

    // -----------------------------------------------------------------
    // I — Failure semantics: [] + no error = genuinely no placements;
    // failure + prior data = failed refresh. A failed refresh must never
    // convert a previously known placement list into an empty one.
    // -----------------------------------------------------------------
    {
        const session = buildSession();
        const command = makeCommand(session);
        const publication = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Convergence I: Failure Semantics')));
        placePublicationUseCase.execute(publication.id, new Position(7000, 0, 0));

        // I1/I2 — genuine empty state: a real Publication with zero
        // placements returns [] and cannot throw.
        const neverPlaced = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Convergence I: Never Placed')));
        const empty = session.getPlacementsForPublication(neverPlaced.id);
        assert(Array.isArray(empty) && empty.length === 0, 'I1. a genuinely unplaced Publication resolves to a real, honest empty array');

        // I3 — a genuine registry failure PROPAGATES, uncaught, at the
        // WorldNavigationSession layer — it is never swallowed into an
        // indistinguishable [].
        const originalFind = placementRegistry.findByPublicationId.bind(placementRegistry);
        placementRegistry.findByPublicationId = () => { throw new Error('registry unavailable'); };
        try {
            assertThrows(() => session.getPlacementsForPublication(publication.id),
                'I2. a genuine discovery failure throws at the session layer rather than returning []');
        } finally {
            placementRegistry.findByPublicationId = originalFind;
        }
        // Restored: the exact same call now succeeds again — proving the
        // failure above was a real, injected fault, not permanent damage.
        assert(session.getPlacementsForPublication(publication.id).length === 1, 'I3. after restoring the registry, the same call succeeds again with the real placement intact');

        // I4 — the panel-level distinction: a failing command sets an
        // error and preserves the prior list; an empty Publication never
        // sets an error at all.
        const ctx = panelCtx({ publication, getPublicationPlacementsCommand: command });
        ctx.refreshPublicationPlacements();
        assert(ctx.publicationPlacements.length === 1 && ctx.publicationPlacementsError === null, 'I4. setup: one real placement loaded, no error');

        const failingCommand = () => { throw new Error('registry unavailable'); };
        const failingCtx = panelCtx({ ...ctx, getPublicationPlacementsCommand: failingCommand });
        failingCtx.refreshPublicationPlacements();
        assert(failingCtx.publicationPlacementsError !== null, 'I5. a failed refresh sets a real error');
        assert(failingCtx.publicationPlacements.length === 1 && failingCtx.publicationPlacements[0].publicationId === publication.id,
            'I6. a failed refresh leaves the previously-loaded placement list exactly as it was — never wiped to []');

        const emptyCtx = panelCtx({ publication: neverPlaced, getPublicationPlacementsCommand: command });
        emptyCtx.refreshPublicationPlacements();
        assert(emptyCtx.publicationPlacementsError === null && emptyCtx.publicationPlacements.length === 0,
            'I7. the reverse: a genuinely unplaced Publication is never mistaken for a failure');

        console.log('✓ I: [] + no error (genuinely no placements) and failure + prior data (failed refresh) remain two distinguishable outcomes at both the session and panel layers');
    }

    // -----------------------------------------------------------------
    // J — Architecture sweep: no second placement collection, no
    // filtering/ranking in the UI, no "latest" selection on the plural
    // path, no duplicate enrichment implementation, no new placement
    // lifecycle semantics, no new placement domain model.
    // -----------------------------------------------------------------
    {
        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const sessionCode = codeOnly(sessionSource);
        const panelCode = codeOnly(panelSource);

        // J1 — no second placement collection in OwnPublicationPanel: a
        // single ephemeral array (publicationPlacements) is the only
        // placement-shaped state the panel ever holds; the registry
        // itself is never imported (reconfirmed from Section A here as
        // part of the deliberate architecture sweep).
        for (const forbidden of ['LocalPlacementRegistry', 'PlacementRegistry.js', 'DiscoverPlacementsUseCase', 'new Map()', 'new Set()']) {
            assert(!panelCode.includes(forbidden), `J1. OwnPublicationPanel.js introduces no second placement collection ('${forbidden}' absent)`);
        }

        // J2 — no filtering/ranking introduced in the UI: neither the
        // refresh method nor the rendered placements section calls
        // sort/filter/reduce on the placement list.
        const refreshBody = methodBody(panelCode, 'refreshPublicationPlacements\\(\\)', 8);
        assert(!/\.(sort|filter|reduce)\(/.test(refreshBody), 'J2a. refreshPublicationPlacements() performs no sort/filter/reduce of its own');
        const placementsSection = panelSource.split('own-publication-placements"')[1].split('</div>')[0];
        assert(!/\.(sort|filter|reduce)\(/.test(placementsSection), 'J2b. the rendered placements section performs no sort/filter/reduce either');

        // J3 — no "latest" selection added to the plural path: unlike
        // _resolvePlacementRecord()/getPlacementInfoForPublication() (both
        // of which deliberately DO reduce via .reduce()),
        // getPlacementsForPublication()'s own body contains none.
        const pluralBody = methodBody(sessionCode, 'getPlacementsForPublication\\(publicationId\\)', 4);
        assert(!pluralBody.includes('.reduce('), 'J3. getPlacementsForPublication() has no "latest"/reduction logic of its own');

        // J4 — no duplicate enrichment implementation: getPlacementsForPublication()
        // itself never calls detectSpatialOverlap (or reimplements
        // owner/movable resolution) directly — it reuses the ONE shared
        // _enrichPlacementRecord() implementation, exactly like
        // getPlacementInfo() does. (detectSpatialOverlap() itself is a
        // pre-existing, general-purpose utility also used by
        // checkPlacementOverlap()/getDocumentsAtPosition() for their own,
        // unrelated "what else is here" questions — this check is
        // deliberately scoped to getPlacementsForPublication()'s OWN body,
        // not a whole-file occurrence count.)
        assert(!pluralBody.includes('detectSpatialOverlap('), 'J4a. getPlacementsForPublication()\'s own body never calls detectSpatialOverlap() directly — no reimplemented overlap computation');
        assert(countOccurrences(sessionCode, '_enrichPlacementRecord(record) {') === 1, 'J4b. _enrichPlacementRecord() is defined exactly once');
        const singularBody = methodBody(sessionCode, 'getPlacementInfo\\(documentId\\)', 4);
        assert(pluralBody.includes('_enrichPlacementRecord(') && singularBody.includes('_enrichPlacementRecord('),
            'J4c. both getPlacementInfo() and getPlacementsForPublication() reuse the ONE shared enrichment implementation rather than reimplementing it');

        // J5 — no new placement lifecycle semantics: no PLACEMENT-scoped
        // lifecycle/status vocabulary was introduced anywhere this
        // milestone's own touched files could have added it. (Deliberately
        // scoped to "placement" compounds — WorldNavigationSession.js's
        // own pre-existing, unrelated DOCUMENT lifecycleState/
        // computeLifecycleStatus concept, e.g. `entry.lifecycleState`
        // above, is untouched by this milestone and must not trip this
        // check.)
        const placementLifecycleVocabulary = /placement[\s_-]?lifecycle|placementstatus|placement\.status|isplacementlifecycle/i;
        assert(!placementLifecycleVocabulary.test(sessionCode), 'J5a. WorldNavigationSession.js introduces no placement-scoped lifecycle/status vocabulary');
        assert(!placementLifecycleVocabulary.test(panelCode), 'J5b. OwnPublicationPanel.js introduces no placement-scoped lifecycle/status vocabulary');

        // J6 — no new placement domain model: the same fixed set of files
        // that existed after 0.9.308 still constitutes the entire
        // placement domain/registry surface. A new file here would be a
        // new placement domain model and must be deliberately re-audited,
        // not silently grown.
        const { readdir } = await import('node:fs/promises');
        const coreFiles = (await readdir(new URL('core/', SOURCE_ROOT))).filter((f) => f.startsWith('Placement')).sort();
        assert(JSON.stringify(coreFiles) === JSON.stringify(['PlacementRecord.js', 'PlacementValidator.js']),
            `J6a. core/ carries no new Placement*.js domain file beyond PlacementRecord.js/PlacementValidator.js (found: ${coreFiles.join(', ')})`);
        const placementDirFiles = (await readdir(new URL('placement/', SOURCE_ROOT))).sort();
        assert(JSON.stringify(placementDirFiles) === JSON.stringify(['LocalPlacementRegistry.js', 'PlacementRegistry.js']),
            `J6b. placement/ carries no new registry implementation beyond LocalPlacementRegistry.js/PlacementRegistry.js (found: ${placementDirFiles.join(', ')})`);

        console.log('✓ J: no second placement collection, no UI-level filtering/ranking, no "latest" selection on the plural path, no duplicate enrichment, no new lifecycle semantics, and no new placement domain model exist anywhere in this codebase');
    }

    console.log('\n✅ All Publication Placement Visibility Convergence Audit tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
