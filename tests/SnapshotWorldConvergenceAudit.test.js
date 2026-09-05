import { readFile } from 'node:fs/promises';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import WorldEncounterMarker from '../ui/components/WorldEncounterMarker.js';
import { registerMaterializedSnapshotWorldSource, materializedSnapshotWorldOrigin } from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { resolveSnapshotWorldPlacement } from '../application/SnapshotWorldPlacement.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeWorldFromDiscoveryRegistry } from '../application/WorldDiscoveryRegistryProjection.js';
import { describeLocalWorldDiscoverySource } from '../application/WorldEncounterIntegration.js';
import { describePeerWorldDiscoverySource } from '../peer/PeerWorldDataIngress.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.162 — Snapshot World Convergence Audit.
//
// 0.9.150 through 0.9.161 answered a VERTICAL question, one seam at a
// time: can a single Snapshot, discovered over Nostr, travel all the way
// to a rendered World marker? 0.9.161's own recommendation named the
// question this milestone actually is — a HORIZONTAL one:
//
//   "Can multiple independently sourced representations of the same World
//    material converge correctly without creating duplicate or
//    conflicting World entries?"
//
// This file is that audit, carried out exactly the way 0.9.153/0.9.155/
// 0.9.156/0.9.157 already carried theirs out: real, unmodified production
// code, exercised end to end, with NO deduplication, reconciliation, or
// trust logic added to make an answer come out any particular way. Where
// the answer turns out to be "already correct," this file documents that.
// Where the answer turns out to be a genuine gap, this file PROVES the gap
// exists and stops — closing it is explicitly not this milestone's job
// (see Section G and this file's own "Deliberately excluded," below).
//
//   THE AUDIT PERFORMED BEFORE WRITING ANY TEST. Three files already state,
// in their own headers, exactly what happens when the same material
// reaches the registry through more than one path:
//
//   - `core/WorldDiscoverySourceAssembly.js` (0.9.7): "assembly is not
//     reconciliation... concatenates... never deduplicates."
//   - `application/WorldDiscoverySourceRegistry.js` (0.9.9): keyed by
//     `origin` alone, "replacement, not accumulation" — but ONLY within
//     one origin's own slot; two DIFFERENT origins are simply two entries.
//   - `core/WorldEncounter.js` (0.9.0): joins a placement to a publication
//     by `publicationId` via `Array#find()` — the FIRST publication record
//     in the assembled array whose `id` matches, regardless of which
//     source actually contributed the placement being resolved.
//
// Combining those three, uncontroversial, already-documented facts predicts
// a specific, checkable behavior for "the same Publication through three
// sources": THREE separate encounters (one per placement, never collapsed),
// each one's title/publisherIdentity/isSigned borrowed from whichever
// source's publication record happens to sort first — never from the
// specific source that contributed that encounter's own placement. Section
// A below runs the real code and confirms this is exactly what happens.
//
//   THE ONE GENUINE GAP THIS AUDIT ACTUALLY FOUND. `application/
// MaterializedSnapshotWorldDiscoveryBridge.js`'s own
// `materializedSnapshotWorldOrigin(contentHash)` (0.9.160) derives a
// registered Snapshot's registry slot from `contentHash` ALONE —
// deliberately, per that file's own header, so re-registering the
// IDENTICAL Snapshot is idempotent. But `WorldDiscoverySourceRegistry`
// itself has no idea a `"snapshot:<hash>"` origin is supposed to name one
// Publication forever — it is a plain string key, and "replacement, not
// accumulation" applies to it exactly as it applies to `"peer:<id>"`.  So
// two DIFFERENT Publications whose Snapshot bytes merely happen to hash
// identically — a real, unremarkable case in a content-addressed system;
// nothing stops two people from separately publishing the same file — do
// not coexist in the World: the second registration's `setSource()` call
// REPLACES the first's slot outright, and the first Publication silently
// stops being encounterable, with no error, no warning, and no record left
// behind that it was ever there. This is not deduplication (the two
// Publications are never compared, matched, or judged "the same thing") —
// it is an accidental identity COLLISION, one layer below where 0.9.160's
// own "content identity is not Publication identity" rule was ever
// supposed to apply. Section B proves it, with the real, unmodified
// `registerMaterializedSnapshotWorldSource()`. This audit does not fix it —
// see "Deliberately excluded," below, and docs/Roadmap.md's own 0.9.163
// recommendation.
//
//   Section A: same Publication, three sources (local/peer/snapshot) —
//              documents the ACTUAL existing semantics: no deduplication,
//              three encounters survive, and the shared-metadata quirk
//              predicted above (title/identity borrowed from whichever
//              source's publication record sorts first).
//   Section B: THE GAP — same contentHash, two DIFFERENT Publications,
//              both registered through the real Snapshot registration
//              bridge. Proves the second registration silently evicts the
//              first from the World, purely because the registry origin
//              this bridge derives is a function of contentHash alone.
//   Section C: same Publication, two DIFFERENT discovery origins (a peer
//              origin and a `snapshot:<contentHash>` origin) — unlike
//              Section B, distinct origin STRINGS never collide; both
//              contributions coexist as two encounters, and the origin
//              itself never leaks into either rendered row.
//   Section D: same contentHash, same Publication, two DIFFERENT
//              locators — the locator never becomes a second identity;
//              re-registering is a harmless, idempotent replacement, and
//              the resulting encounter carries no locator field at all.
//   Section E: spatial convergence — a registered Snapshot's own position
//              is ALWAYS the exact position this replica's own
//              pre-existing `WorldPlacement` already holds for that
//              Publication, copied through every seam without ever being
//              recomputed, invented, or reconciled against any other
//              source's own claim.
//   Section F: rendering convergence — local, peer, and Snapshot-sourced
//              encounters all reach the identical, unmodified
//              `WorldEncounterCanvas`/`WorldEncounterMarker` machinery;
//              no source-specific rendering path exists, and a rendered
//              marker never carries or exposes its own source origin.
//   Section G: no premature deduplication — a structural sweep confirming
//              this milestone adds no dedup/reconciliation code anywhere,
//              and that Section A's "three encounters survive" finding is
//              the CURRENT, intentional behavior of every file involved,
//              never something this file's own tests work around.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function placeReal(placementRegistry, publicationId, position, owner = 'alice') {
    const record = new PlacementRecord({ publicationId, position, owner });
    placementRegistry.add(record);
    return record;
}

// Mirrors OwnPublicationPanel.js's own placementInfoFor()/WorldNavigationSession#
// getPlacementInfo() shape — the exact duck type resolveSnapshotWorldPlacement()
// (0.9.159) requires, reused here unmodified, exactly as
// tests/SnapshotWorldRendering.test.js's own helper already does.
function placementInfoFor(placementRegistry, publicationId) {
    const records = placementRegistry.findByPublicationId(publicationId);
    if (records.length === 0) return null;
    const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
    return {
        placementId: record.placementId,
        publicationId: record.publicationId,
        position: { x: record.position.x, y: record.position.y, z: record.position.z },
        rotation: record.rotation,
        revision: record.revision,
        owner: record.owner,
        movable: true,
        overlapCount: 0
    };
}

function materializedResult(contentHash) {
    return { outcome: StoreSnapshotContentOutcome.STORED, contentHash, locator: `local:${contentHash}`, reason: null };
}

function placedResult(contentHash, publicationId, position, placementId = 'placement-x') {
    return { outcome: SnapshotWorldPlacementOutcome.PLACED, contentHash, publicationId, placementId, position, reason: null };
}

// Reproduces ui/views/WorldView.js's own real wiring by hand — identical to
// tests/SnapshotWorldRendering.test.js's own buildCanvasInstance().
function buildCanvasInstance({ registry = null, view } = {}) {
    const ctx = {
        registry,
        view: view !== undefined ? view : WorldEncounterCanvas.props.view.default()
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

function projectedPublicationsOf(ctx) {
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
    return WorldEncounterCanvas.computed.projectedPublications.call(ctx);
}

function markerGlyphAndSelection(projectedMarker) {
    const ctx = { kind: 'PUBLICATION', objectId: projectedMarker.objectId, label: projectedMarker.label, x: projectedMarker.x, y: projectedMarker.y, $emit(event, payload) { ctx.emitted = { event, payload }; } };
    const glyph = WorldEncounterMarker.computed.glyph.call(ctx);
    WorldEncounterMarker.methods.emitSelect.call(ctx);
    return { glyph, emitted: ctx.emitted };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — same Publication, three sources: documents the ACTUAL,
    // existing convergence semantics, with no deduplication imposed.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: 'pub-shared', title: 'Title From Local' }],
            placements: [{ publicationId: 'pub-shared', position: { x: 1, y: 0, z: 1 } }]
        }));
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-shared', title: 'Title From Peer' }],
            placements: [{ publicationId: 'pub-shared', position: { x: 2, y: 0, z: 2 } }]
        }, { remoteIdentity: { identityId: 'did:key:zConvergePeer' } }));
        registerMaterializedSnapshotWorldSource(
            registry,
            placedResult('hash-a', 'pub-shared', { x: 3, y: 0, z: 3 }),
            new Publication({ id: 'pub-shared', title: 'Title From Snapshot' })
        );

        const view = describeWorldFromDiscoveryRegistry(registry);
        assert(view.publications.length === 3, `1. no deduplication occurs — the SAME publicationId contributed by three independent sources produces THREE encounters, not one; got ${view.publications.length}`);
        assert(view.publications.every((p) => p.objectId === 'pub-shared'), '2. every one of the three encounters names the same Publication id');

        const positions = view.publications.map((p) => `${p.x},${p.y},${p.z}`).sort();
        assert(JSON.stringify(positions) === JSON.stringify(['1,0,1', '2,0,2', '3,0,3']), `3. each encounter keeps its OWN contributing placement's own position, none overwriting another — got ${JSON.stringify(positions)}`);

        // The documented quirk this milestone's own header predicted from
        // 0.9.0's own deriveWorldEncounters(): every encounter's title is
        // borrowed from whichever publication record happens to sort
        // FIRST in the assembled array (the local one, registered first),
        // never from the specific source that contributed that encounter's
        // own placement. This is 0.9.0/0.9.7's existing, documented
        // behavior — not something this milestone introduces or condones.
        assert(view.publications.every((p) => p.title === 'Title From Local'), '4. EXISTING semantics, unchanged by this milestone — every encounter borrows its title from the FIRST-assembled publication record sharing that id, regardless of which source actually contributed that encounter\'s own placement');

        console.log('✓ Section A: same Publication through three sources — no deduplication; three encounters survive, each with its own placement position, all sharing the first-assembled source\'s own metadata (existing, documented deriveWorldEncounters() behavior)');
    }

    // ---------------------------------------------------------------
    // Section B — THE GAP: same contentHash, two DIFFERENT Publications,
    // both registered through the real Snapshot registration bridge.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const publicationA = new Publication({ id: 'pub-collide-a', title: 'Publication A' });
        const publicationB = new Publication({ id: 'pub-collide-b', title: 'Publication B' });

        const resultA = registerMaterializedSnapshotWorldSource(
            registry, placedResult('hash-shared-content', 'pub-collide-a', { x: 5, y: 0, z: 5 }), publicationA
        );
        assert(resultA.outcome === 'registered', '1. Publication A registers successfully');

        const viewAfterA = describeWorldFromDiscoveryRegistry(registry);
        assert(viewAfterA.publications.length === 1 && viewAfterA.publications[0].objectId === 'pub-collide-a', '2. sanity — Publication A alone is encounterable immediately after its own registration');

        const resultB = registerMaterializedSnapshotWorldSource(
            registry, placedResult('hash-shared-content', 'pub-collide-b', { x: 9, y: 0, z: 9 }), publicationB
        );
        assert(resultB.outcome === 'registered', '3. Publication B — a DIFFERENT Publication whose Snapshot bytes merely hash identically to A\'s — also reports success');

        assert(resultA.origin === resultB.origin, `4. THE GAP — both registrations resolve to the EXACT SAME registry origin, because materializedSnapshotWorldOrigin() derives it from contentHash alone: '${resultA.origin}' === '${resultB.origin}'`);
        assert(resultA.origin === materializedSnapshotWorldOrigin('hash-shared-content'), '5. sanity — that shared origin is exactly this milestone\'s own documented derivation');

        const viewAfterB = describeWorldFromDiscoveryRegistry(registry);
        assert(viewAfterB.publications.length === 1, `6. THE GAP, made concrete — the registry now holds only ONE encounter, not two; got ${viewAfterB.publications.length}`);
        assert(viewAfterB.publications[0].objectId === 'pub-collide-b', '7. Publication B\'s registration silently REPLACED Publication A\'s — the registry\'s own "replacement, not accumulation" rule (0.9.9), applied to a slot key that was never meant to name two different Publications');
        assert(!viewAfterB.publications.some((p) => p.objectId === 'pub-collide-a'), '8. Publication A is no longer encounterable ANYWHERE in the World — not merged, not marked stale, not superseded: simply gone, with no record it was ever registered');

        assert(registry.listSources().length === 1, '9. exactly one source occupies the shared contentHash\'s slot — this is an identity COLLISION at the registration-origin layer, never a deliberate two-Publication accumulation');

        console.log('✓ Section B: THE GAP — two distinct Publications sharing one contentHash collide on the SAME derived registry origin; the second registration silently evicts the first from the World, with no dedup/reconciliation logic anywhere deciding this on purpose');
    }

    // ---------------------------------------------------------------
    // Section C — same Publication, two DIFFERENT discovery origins (a
    // peer origin and a snapshot:<contentHash> origin). Unlike Section B,
    // distinct origin STRINGS never collide.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-multi-origin', title: 'Seen Via Peer' }],
            placements: [{ publicationId: 'pub-multi-origin', position: { x: 11, y: 0, z: 11 } }]
        }, { remoteIdentity: { identityId: 'did:key:zOriginPeer' } }));
        const registration = registerMaterializedSnapshotWorldSource(
            registry,
            placedResult('hash-multi-origin', 'pub-multi-origin', { x: 22, y: 0, z: 22 }),
            new Publication({ id: 'pub-multi-origin', title: 'Seen Via Snapshot' })
        );

        assert(registration.origin === 'snapshot:hash-multi-origin', '1. the snapshot registration\'s own origin is content-addressed');
        const origins = registry.listSources().map((s) => s.origin).sort();
        assert(JSON.stringify(origins) === JSON.stringify(['peer:did:key:zOriginPeer', 'snapshot:hash-multi-origin']), `2. both origins occupy their OWN distinct slots, neither replacing the other — got ${JSON.stringify(origins)}`);

        const view = describeWorldFromDiscoveryRegistry(registry);
        assert(view.publications.length === 2, '3. the SAME Publication id, discovered through two structurally different origins, produces two coexisting encounters — origin identity and Publication identity are orthogonal, never conflated');

        // The origin itself is a fact about the SOURCE CONTAINER
        // (core/WorldDiscoverySourceAssembly.js's own "provenance stays at
        // the source container — it never leaks into a record") — it never
        // appears on the rendered encounter row itself.
        assert(view.publications.every((p) => !('origin' in p)), '4. neither rendered encounter row carries an "origin" field of any kind — how a Publication was discovered never becomes part of what it IS');

        console.log('✓ Section C: same Publication discovered through a peer origin and a snapshot origin — the two ORIGIN STRINGS never collide, both coexist, and neither rendered encounter exposes its own discovery origin');
    }

    // ---------------------------------------------------------------
    // Section D — same contentHash, same Publication, two DIFFERENT
    // locators. The locator stays retrieval metadata; it never becomes a
    // second World object identity.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const publicationId = 'pub-locator-convergence';
        const contentHash = 'hash-locator-convergence';

        const referenceOne = new ContentReference({ hash: contentHash, uri: 'ipfs://locator-one' });
        const referenceTwo = new ContentReference({ hash: contentHash, uri: 'ar://locator-two' });
        assert(referenceOne.uri !== referenceTwo.uri, '1. sanity — the two locators genuinely differ');

        const publicationViaLocatorOne = new Publication({ id: publicationId, title: 'Locator Convergence', contentReference: referenceOne });
        const publicationViaLocatorTwo = new Publication({ id: publicationId, title: 'Locator Convergence', contentReference: referenceTwo });

        const firstRegistration = registerMaterializedSnapshotWorldSource(
            registry, placedResult(contentHash, publicationId, { x: 7, y: 0, z: 7 }), publicationViaLocatorOne
        );
        const secondRegistration = registerMaterializedSnapshotWorldSource(
            registry, placedResult(contentHash, publicationId, { x: 7, y: 0, z: 7 }), publicationViaLocatorTwo
        );

        assert(firstRegistration.origin === secondRegistration.origin, '2. the registry origin is a function of contentHash + this milestone\'s own registration key alone — the locator plays no part in it');

        const view = describeWorldFromDiscoveryRegistry(registry);
        assert(view.publications.length === 1, `3. re-registering the SAME Publication under the SAME contentHash with only its locator changed is a harmless, idempotent replacement — exactly ONE encounter results, never two; got ${view.publications.length}`);
        assert(view.publications[0].objectId === publicationId, '4. the surviving encounter still names the correct Publication');

        const [encounter] = view.publications;
        assert(!('locator' in encounter) && !('uri' in encounter) && !('contentReference' in encounter), '5. the rendered encounter carries no locator field of any kind — core/WorldEncounter.js#describeEncounterablePublication() never reads a Publication\'s own contentReference at all');

        console.log('✓ Section D: same contentHash and Publication, two different locators — the locator never enters the registry key or the rendered encounter; re-registration is a harmless, idempotent replacement');
    }

    // ---------------------------------------------------------------
    // Section E — spatial convergence: a registered Snapshot's own
    // position is ALWAYS this replica's existing, authoritative
    // WorldPlacement position for that Publication — never recomputed,
    // invented, or reconciled against any other source's own claim.
    // ---------------------------------------------------------------
    {
        const publicationId = 'pub-spatial-authority';
        const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        const authoritativeRecord = placeReal(placementRegistry, publicationId, new Position(30, 4, -18));
        const placementInfo = placementInfoFor(placementRegistry, publicationId);

        // resolveSnapshotWorldPlacement() (0.9.159) is the ONE function
        // that decides a Snapshot's own World position — it borrows
        // placementInfo.position verbatim; this file adds no second
        // spatial computation of its own.
        const worldPlacementResult = resolveSnapshotWorldPlacement(materializedResult('hash-spatial-authority'), placementInfo);
        assert(worldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, '1. sanity — the materialized Snapshot places against the pre-existing WorldPlacement');
        assert(worldPlacementResult.position.x === authoritativeRecord.position.x
            && worldPlacementResult.position.y === authoritativeRecord.position.y
            && worldPlacementResult.position.z === authoritativeRecord.position.z,
            '2. the resolved placement position is EXACTLY the pre-existing PlacementRecord\'s own position — never recomputed from anything Snapshot-specific (discovery order, locator, contentHash)');

        const registry = new WorldDiscoverySourceRegistry();
        const publication = new Publication({ id: publicationId, title: 'Spatial Authority' });
        registerMaterializedSnapshotWorldSource(registry, worldPlacementResult, publication);

        const [registeredSource] = registry.listSources();
        assert(registeredSource.placements[0].position === worldPlacementResult.position, '3. the registered placement\'s own position is the EXACT SAME object reference resolveSnapshotWorldPlacement() produced — no new position object is ever constructed by the registration/bridge layer');

        const view = describeWorldFromDiscoveryRegistry(registry);
        const [encounter] = view.publications;
        assert(encounter.x === 30 && encounter.y === 4 && encounter.z === -18, `4. the rendered encounter's own position is exactly the authoritative WorldPlacement's position, unchanged end to end — got (${encounter.x},${encounter.y},${encounter.z})`);

        // No source gets to override another source's own claimed
        // position for the SAME Publication — see Section A/C above: two
        // origins placing the same publicationId at different positions
        // produce two SEPARATE encounters, never a single "resolved"
        // position one origin imposed on the other's behalf. Re-confirmed
        // here as this milestone's own explicit spatial claim.
        const registryWithConflict = new WorldDiscoverySourceRegistry();
        registryWithConflict.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: publicationId, title: 'Local Claim' }],
            placements: [{ publicationId, position: { x: 0, y: 0, z: 0 } }]
        }));
        registerMaterializedSnapshotWorldSource(registryWithConflict, worldPlacementResult, publication);
        const conflictView = describeWorldFromDiscoveryRegistry(registryWithConflict);
        assert(conflictView.publications.length === 2, '5. a Snapshot origin and a local origin independently claiming positions for the SAME Publication never get reconciled into one — both survive as their own encounters, exactly as Sections A and C already established');
        const conflictPositions = conflictView.publications.map((p) => `${p.x},${p.y},${p.z}`).sort();
        assert(JSON.stringify(conflictPositions) === JSON.stringify(['0,0,0', '30,4,-18']), '6. neither source\'s own claimed position was altered by the other\'s presence — "I discovered this, therefore I decide where it is" never happens at this layer, for either source');

        console.log('✓ Section E: a registered Snapshot\'s own position is always the pre-existing, authoritative WorldPlacement position, copied through unchanged — no source, including the Snapshot pipeline itself, ever invents or overrides a position on another source\'s behalf');
    }

    // ---------------------------------------------------------------
    // Section F — rendering convergence: local, peer, and Snapshot-sourced
    // encounters all reach the identical, unmodified rendering machinery.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: 'pub-render-local', title: 'Render Local' }],
            placements: [{ publicationId: 'pub-render-local', position: { x: 4, y: 0, z: 4 } }]
        }));
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-render-peer', title: 'Render Peer' }],
            placements: [{ publicationId: 'pub-render-peer', position: { x: -4, y: 0, z: -4 } }]
        }, { remoteIdentity: { identityId: 'did:key:zRenderPeer' } }));
        registerMaterializedSnapshotWorldSource(
            registry, placedResult('hash-render-snapshot', 'pub-render-snapshot', { x: 6, y: 0, z: -6 }),
            new Publication({ id: 'pub-render-snapshot', title: 'Render Snapshot' })
        );

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        const projected = projectedPublicationsOf(canvas);
        assert(projected.length === 3, '1. all three origins — local, peer, and Snapshot — render as markers through the same mounted canvas');

        for (const marker of projected) {
            const { glyph, emitted } = markerGlyphAndSelection(marker);
            assert(glyph === '📄', `2. every marker, regardless of its own source, renders with the identical PUBLICATION glyph — no source-specific glyph exists (failed for ${marker.objectId})`);
            assert(emitted.event === 'select' && emitted.payload.objectId === marker.objectId, `3. every marker's selection reports its own Publication id through the identical, unmodified selection mechanism (failed for ${marker.objectId})`);
            assert(!('origin' in marker), `4. no projected marker exposes its own discovery origin (failed for ${marker.objectId})`);
        }

        unmountCanvas(canvas);

        // Structural confirmation: the exact computed properties that turn
        // a WorldDiscoverySourceRegistry's projection into a rendered
        // marker (`publicationRows`/`projectedPublications`) never read a
        // discovery source's own `origin` field — a Snapshot-sourced
        // encounter reaches this machinery exactly origin-blind, never
        // through a second, source-specific rendering path. This file's
        // own header already states the rule in words ("never reads a
        // source's own `origin` field... this component inherits that
        // blindness"); this reads the actual computed function bodies to
        // confirm it in code, scoped narrowly so it is never confused with
        // this SAME file's own, entirely unrelated `{ kind, objectId,
        // origin }` MATERIAL-SELECTION vocabulary (0.9.20+) used elsewhere
        // in this file for an already-selected encounter's own candidate
        // material sources — a different concept this milestone leaves
        // untouched.
        const canvasSource = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
        const publicationRowsBody = canvasSource.match(/publicationRows\(\) \{[\s\S]*?\n {8}\},/)[0];
        const projectedPublicationsBody = canvasSource.match(/projectedPublications\(\) \{[\s\S]*?\n {8}\},/)[0];
        assert(!/\.origin\b/.test(publicationRowsBody), '5. WorldEncounterCanvas.js\'s own publicationRows computed never reads a discovery source\'s `.origin` field');
        assert(!/\.origin\b/.test(projectedPublicationsBody), '6. WorldEncounterCanvas.js\'s own projectedPublications computed never reads a discovery source\'s `.origin` field — every projected marker is built from objectId/title/x/z alone');
        const markerSource = await readFile(new URL('../ui/components/WorldEncounterMarker.js', import.meta.url), 'utf8');
        assert(!/origin/i.test(markerSource), '7. WorldEncounterMarker.js contains no "origin" vocabulary of any kind — it draws a marker from kind/objectId/label/x/y alone, wherever the underlying Publication was discovered');

        console.log('✓ Section F: local, peer, and Snapshot-sourced encounters all reach the identical WorldEncounterCanvas/WorldEncounterMarker machinery — no source-specific rendering path exists, and no rendered marker exposes its own discovery origin');
    }

    // ---------------------------------------------------------------
    // Section G — no premature deduplication: a structural sweep
    // confirming this milestone adds no dedup/reconciliation code
    // anywhere, and that Section A's "three encounters survive" finding
    // is CURRENT, intentional behavior — never something this file's own
    // tests work around.
    // ---------------------------------------------------------------
    {
        const filesToSweep = [
            '../core/WorldDiscoverySourceAssembly.js',
            '../application/WorldDiscoverySourceRegistry.js',
            '../core/WorldEncounter.js',
            '../application/WorldDiscoveryRegistryProjection.js',
            '../application/WorldEncounterIntegration.js',
            '../application/MaterializedSnapshotWorldDiscoveryBridge.js'
        ];
        for (const relativePath of filesToSweep) {
            const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
            const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
            assert(!/dedup|reconcil/i.test(codeOnly), `1. ${relativePath} contains no deduplication/reconciliation vocabulary in its own executable code — this milestone adds none, and confirms none pre-existed either (failed for ${relativePath})`);
        }

        // Re-confirms, directly, that "no deduplication" is not merely a
        // documentation claim: TWO sources contributing byte-for-byte
        // IDENTICAL publication+placement records for the same
        // publicationId still produce TWO encounters, never collapsed —
        // the strongest possible case FOR collapsing them, and it still
        // does not happen.
        const registry = new WorldDiscoverySourceRegistry();
        const identicalPublicationRecord = { id: 'pub-identical', title: 'Byte For Byte Identical' };
        const identicalPlacementRecord = { publicationId: 'pub-identical', position: { x: 8, y: 0, z: 8 } };
        registry.setSource(describeLocalWorldDiscoverySource({ publications: [identicalPublicationRecord], placements: [identicalPlacementRecord] }));
        registry.setSource(describePeerWorldDiscoverySource(
            { publications: [identicalPublicationRecord], placements: [identicalPlacementRecord] },
            { remoteIdentity: { identityId: 'did:key:zIdenticalPeer' } }
        ));
        const view = describeWorldFromDiscoveryRegistry(registry);
        assert(view.publications.length === 2, `2. even byte-for-byte identical publication+placement records, contributed by two different origins, are never collapsed into one — got ${view.publications.length}`);

        console.log('✓ Section G: no deduplication/reconciliation vocabulary exists anywhere in the convergence path, and even byte-for-byte identical records from two origins are never collapsed — confirming Section A\'s finding is this codebase\'s current, deliberate behavior, not an artifact this test suite works around');
    }

    console.log('\n✅ All Snapshot World Convergence Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
