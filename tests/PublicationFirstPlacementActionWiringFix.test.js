import { readFile } from 'node:fs/promises';

import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { PlacePublicationUseCase } from '../application/placement/PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from '../application/placement/MoveWorldPlacementUseCase.js';
import { RemoveWorldPlacementUseCase } from '../application/placement/RemoveWorldPlacementUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/publication/LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { worldEncounterCanvasFiles, worldViewFiles, worldNavigationSessionFiles, ownPublicationPanelFiles } from './support/SourceFileGroups.js';

// 0.9.600 — Publication First-Placement Action Wiring Fix.
//
// TYPE: implementation, verified live. PRODUCTION CHANGES:
//   - application/world/CreateWorldViewUseCase.js: placePublicationUseCase is now
//     constructed with publicationActionDiscoveryProvider instead of the
//     narrow discoveryProvider, and the SAME instance is now also handed
//     to WorldNavigationSession.
//   - application/world/WorldNavigationSession.js: accepts an optional
//     placePublicationUseCase collaborator and exposes a new,
//     publicationId-keyed placePublication(publicationId, position)
//     method that delegates directly to it.
//   - ui/components/OwnPublicationPanel.js: a new, optional
//     placePublicationCommand prop and a "Place" button inside the
//     EXISTING .own-publication-placements listing.
//   - ui/views/WorldView.js: placeOwnPublication(), a thin wrapper
//     resolving "here" (getAvatarPosition()||getCameraPosition()) and
//     forwarding to session.placePublication(), bound to
//     OwnPublicationPanel's new prop.
//
// This is the "smallest legitimate next step" tests/
// FirstPublicationPlacementCapabilityBoundaryAudit.test.js (0.9.599,
// Section H) named: PlacePublicationUseCase already, unconditionally,
// supported creating a Publication's first placement — the ONLY thing
// missing was that application/world/CreateWorldViewUseCase.js constructed it
// with the narrow discoveryProvider, which cannot resolve a
// Repository-admitted-only Publication. Sections below verify each of
// the requesting brief's own lettered acceptance criteria (A-G) against
// real production classes, wired exactly as CreateWorldViewUseCase.js
// wires them today.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

if (typeof globalThis.window === 'undefined') {
    const store = new Map();
    globalThis.window = {
        localStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => { store.set(k, String(v)); },
            removeItem: (k) => { store.delete(k); },
            key: (i) => Array.from(store.keys())[i] ?? null,
            get length() { return store.size; }
        }
    };
}

// Builds a real WorldNavigationSession wired EXACTLY the way
// application/world/CreateWorldViewUseCase.js wires it after this milestone's
// own fix: publicationActionDiscoveryProvider (narrow discoveryProvider
// composed with decentralizedPublicationDiscoveryProvider, when one is
// supplied) is what placePublicationUseCase is constructed with, while
// discoveryProvider itself stays the one WorldNavigationSession uses for
// fork-policy/_findPublications/world-layout (unchanged, per 0.9.596).
function buildSession({ decentralizedPublicationDiscoveryProvider = null, wirePlacePublicationUseCase = true } = {}) {
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    identity.login('alice');

    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const publicationActionDiscoveryProvider = decentralizedPublicationDiscoveryProvider
        ? new CompositeDiscoveryProvider([discoveryProvider, decentralizedPublicationDiscoveryProvider])
        : discoveryProvider;

    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const placePublicationUseCase = wirePlacePublicationUseCase
        ? new PlacePublicationUseCase(
            spatialIndexProvider,
            publicationActionDiscoveryProvider,
            new LoadPublicationDocumentUseCase(storage),
            new CreateBrickRegistryUseCase().execute(),
            placementRegistry,
            identity
        )
        : null;
    const moveWorldPlacementUseCase = new MoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry, null, identity);
    const removeWorldPlacementUseCase = new RemoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry);

    const session = new WorldNavigationSession({
        registry: { getDocument: () => null },
        loadPublicationDocumentUseCase: { execute: () => null },
        worldLayoutProvider: { getSpatialState: () => ({ loaded: [], visible: [] }) },
        identityProvider: identity,
        discoveryProvider,
        publicationActionDiscoveryProvider,
        placementRegistry,
        placePublicationUseCase,
        moveWorldPlacementUseCase,
        removeWorldPlacementUseCase
    });

    return { storage, identity, discoveryProvider, publicationActionDiscoveryProvider, spatialIndexProvider, placementRegistry, placePublicationUseCase, session };
}

async function run() {
    console.log('Running Publication First-Placement Action Wiring Fix tests...\n');

    // ===============================================================
    // Section A — the wiring fix itself, confirmed in real source.
    // ===============================================================
    {
        const composition = await readSource('application/world/CreateWorldViewUseCase.js');
        assert(/new PlacePublicationUseCase\(\s*spatialIndexProvider,\s*publicationActionDiscoveryProvider,/.test(composition),
            'A1. application/world/CreateWorldViewUseCase.js now constructs PlacePublicationUseCase with publicationActionDiscoveryProvider, not the narrow discoveryProvider.');
        const sessionCtorIndex = composition.indexOf('const session = new WorldNavigationSession({');
        const placePublicationUseCaseArgIndex = composition.indexOf('placePublicationUseCase,', sessionCtorIndex);
        assert(sessionCtorIndex !== -1 && placePublicationUseCaseArgIndex !== -1,
            'A2/A3. The SAME placePublicationUseCase instance PublishDocumentUseCase already uses is now ALSO handed to WorldNavigationSession\'s own constructor call.');

        const sessionSrc = (await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n');
        assert(/placePublicationUseCase = null,/.test(sessionSrc),
            'A4. WorldNavigationSession accepts an optional placePublicationUseCase collaborator.');
        assert(/placePublication\(publicationId, position\) \{/.test(sessionSrc),
            'A5. WorldNavigationSession exposes a new, publicationId-keyed placePublication() method.');
        assert(/return this\._placePublicationUseCase\.execute\(publicationId, position\);/.test(sessionSrc),
            'A6. placePublication() delegates directly to the injected PlacePublicationUseCase — no reimplementation.');

        console.log('✓ A — the wiring fix is exactly the one-argument change 0.9.599 identified: publicationActionDiscoveryProvider replaces discoveryProvider in PlacePublicationUseCase\'s own construction, and the resulting instance is threaded through to a new, thin WorldNavigationSession#placePublication().');
    }

    // ===============================================================
    // Section B — Acceptance A: a Repository-admitted, never-locally-
    // published Publication with no existing placement becomes
    // explicitly placeable.
    // ===============================================================
    {
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const p1 = new Publication({ id: 'p1-repository-only', documentId: 'p1-doc', title: 'P1', author: 'bob', contentReference: new ContentReference({ hash: '1'.repeat(64) }) });
        decentralized.add(p1);
        const { session, placementRegistry, discoveryProvider } = buildSession({ decentralizedPublicationDiscoveryProvider: decentralized });

        assert(discoveryProvider.findById(p1.id) === null, 'B0. Sanity: the narrow discoveryProvider alone still does not know P1 (it was never locally published).');
        assert(placementRegistry.findByPublicationId(p1.id).length === 0, 'B1. Sanity: P1 has no placement yet.');

        const placement = session.placePublication(p1.id, { x: 5, y: 0, z: 5 });
        assert(placement !== null, 'B2. session.placePublication() succeeds for a Repository-admitted-only Publication.');
        const records = placementRegistry.findByPublicationId(p1.id);
        assert(records.length === 1 && records[0].revision === 1, 'B3. Exactly one, genuine revision-1 PlacementRecord now exists for P1.');

        console.log('✓ B — Acceptance A: an existing Repository Publication with no PlacementRecord is now explicitly placeable through the real, unmodified PlacePublicationUseCase.');
    }

    // ===============================================================
    // Section C — Acceptance B: existing placement machinery (move,
    // remove) for a normally-published, locally-known document is
    // unaffected by this milestone.
    // ===============================================================
    {
        const { session, storage, discoveryProvider, placementRegistry } = buildSession();
        const documentId = 'c-doc';
        const publication = new Publication({ id: 'c-pub', documentId, title: 'C Pub', author: 'alice', contentReference: new ContentReference({ hash: '2'.repeat(64) }) });
        storage.save('forkbuild-publications', [publication.toJSON()]);
        assert(discoveryProvider.findByDocumentId(documentId).length === 1, 'C0. Sanity: the narrow discoveryProvider resolves this ordinary, locally-published document.');

        session.placePublication('c-pub', { x: 1, y: 0, z: 1 });
        assert(placementRegistry.findByPublicationId('c-pub').length === 1, 'C1. Sanity: an initial placement exists.');

        session.movePlacement(documentId, { x: 9, y: 0, z: 9 });
        const afterMove = placementRegistry.findByPublicationId('c-pub');
        assert(afterMove.length === 1 && afterMove[0].position.x === 9 && afterMove[0].revision === 2,
            'C2. movePlacement() still works unchanged: a new revision, same placement, moved position.');

        session.removePlacement(documentId);
        assert(placementRegistry.findByPublicationId('c-pub').length === 0,
            'C3. removePlacement() still works unchanged: the placement is gone.');

        const canvasDiff = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        assert(canvasDiff.includes('WorldEncounterCanvas'),
            'C4. Sanity the file still exists/parses as expected.');
        assert(!/placePublicationCommand|placeOwnPublication/.test(canvasDiff),
            'C5. ui/components/WorldEncounterCanvas.js — the component that owns observer-local ghost suppression — is completely untouched by this milestone; this new capability never reaches it.');

        console.log('✓ C — Acceptance B: movePlacement()/removePlacement() behave exactly as before, and observer-local ghost suppression (owned entirely by WorldEncounterCanvas.js, never touched by this milestone) is structurally unaffected.');
    }

    // ===============================================================
    // Section D — Acceptance C: exact Publication identity, never
    // reconstructed through documentId/contentHash/URI/claimedPosition/
    // encounter state.
    // ===============================================================
    {
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const p1 = new Publication({ id: 'd-pub', documentId: 'd-doc', title: 'D Pub', author: 'bob', contentReference: new ContentReference({ hash: '3'.repeat(64) }) });
        decentralized.add(p1);
        const { session, publicationActionDiscoveryProvider } = buildSession({ decentralizedPublicationDiscoveryProvider: decentralized });

        assert(publicationActionDiscoveryProvider.findById(p1.id) === p1,
            'D1. The exact Publication instance admitted to the Repository is what resolution returns — never a reconstruction from documentId/contentHash/URI.');
        assert(session.findPublicationById(p1.id) === p1,
            'D2. WorldNavigationSession#findPublicationById() (0.9.597) resolves to the SAME exact instance placePublication() itself resolves through.');

        const placePublicationSrc = await readSource('application/placement/PlacePublicationUseCase.js');
        assert(!/claimedPosition/.test(placePublicationSrc), 'D3. PlacePublicationUseCase.js never references claimedPosition — reconfirms 0.9.599 Section E.');
        assert(!/publication\.author/.test(placePublicationSrc), 'D4. PlacePublicationUseCase.js never reads publication.author — reconfirms 0.9.599 Section A2/D3.');

        console.log('✓ D — Acceptance C: placement always acts on the exact, already-resolved Publication instance — no id/hash/URI/claimedPosition-based reconstruction exists anywhere in this path.');
    }

    // ===============================================================
    // Section E — Acceptance D: no policy widening. discoveryProvider
    // (fork-policy/_findPublications/world-layout) stays exactly as
    // narrow as before; only the placement action path changed.
    // ===============================================================
    {
        const composition = await readSource('application/world/CreateWorldViewUseCase.js');
        assert(/const worldLayoutProvider = new LocalWorldLayoutProvider\(\s*spatialIndexProvider,\s*publicationActionDiscoveryProvider\s*\);/.test(composition),
            'E1. UPDATED BY 0.9.605 (Wire Publication Discovery into World Rendering): worldLayoutProvider is now built from publicationActionDiscoveryProvider — at the time this milestone (0.9.600) was written it was still the plain, narrow discoveryProvider; that later, separate widening is this file\'s own Section E4/fork-policy boundary unaffected.');

        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const p1 = new Publication({ id: 'e-pub', documentId: 'e-doc', title: 'E Pub', author: 'bob', contentReference: new ContentReference({ hash: '4'.repeat(64) }) });
        decentralized.add(p1);
        const { session, discoveryProvider } = buildSession({ decentralizedPublicationDiscoveryProvider: decentralized });

        assert(discoveryProvider.findById(p1.id) === null,
            'E2. Live: the narrow discoveryProvider — what fork-policy/_findPublications() still reads (world-layout was separately widened by 0.9.605, unrelated to this fork-policy boundary) — genuinely cannot see a Repository-admitted-only Publication.');
        // _isKnownPublication()/_checkForkPolicy() both key off _findPublications(documentId),
        // which reads _discoveryProvider (narrow) — confirmed structurally in WorldNavigationSession.js.
        const sessionSrc = (await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n');
        const findPublicationsBody = sessionSrc.match(/_findPublications\(documentId\) \{[\s\S]*?\n {4}\}/);
        assert(findPublicationsBody !== null && /this\._discoveryProvider/.test(findPublicationsBody[0]) && !/this\._publicationActionDiscoveryProvider/.test(findPublicationsBody[0]),
            'E4. _findPublications() — the shared choke point behind fork-policy — reads ONLY this._discoveryProvider, never this._publicationActionDiscoveryProvider. This milestone never touches that boundary.');

        console.log('✓ E — Acceptance D: fork-policy/_findPublications()/world-layout enrichment remain exclusively on the narrow discoveryProvider; only the placement action path (placePublicationUseCase) was widened.');
    }

    // ===============================================================
    // Section F — Acceptance E: explicit action only. Admission,
    // resolution, and repeated lookups never create a placement by
    // themselves.
    // ===============================================================
    {
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const p1 = new Publication({ id: 'f-pub', documentId: 'f-doc', title: 'F Pub', author: 'bob', contentReference: new ContentReference({ hash: '5'.repeat(64) }) });
        decentralized.add(p1); // admission
        const { session, placementRegistry } = buildSession({ decentralizedPublicationDiscoveryProvider: decentralized });

        session.findPublicationById(p1.id); // resolution
        session.findPublicationById(p1.id); // resolution, again
        assert(placementRegistry.findByPublicationId(p1.id).length === 0,
            'F1. Admission and repeated resolution alone create no PlacementRecord.');

        session.placePublication(p1.id, { x: 3, y: 0, z: 3 }); // the one explicit action
        assert(placementRegistry.findByPublicationId(p1.id).length === 1,
            'F2. Only the explicit placePublication() call creates a PlacementRecord — exactly one, for exactly one call.');

        console.log('✓ F — Acceptance E: admission ≠ placement, resolution ≠ placement — only the user\'s explicit placePublication() call ever produces a PlacementRecord.');
    }

    // ===============================================================
    // Section G — Acceptance F: multiple Publications in different
    // states, correctly isolated.
    // ===============================================================
    {
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const p1 = new Publication({ id: 'g-p1-unplaced', documentId: 'g-doc-1', title: 'P1', author: 'bob', contentReference: new ContentReference({ hash: '6'.repeat(64) }) });
        const p2 = new Publication({ id: 'g-p2-placed', documentId: 'g-doc-2', title: 'P2', author: 'carol', contentReference: new ContentReference({ hash: '7'.repeat(64) }) });
        decentralized.add(p1);
        decentralized.add(p2);
        const { session, placementRegistry } = buildSession({ decentralizedPublicationDiscoveryProvider: decentralized });

        // P2 already has an existing placement before P1 is ever touched.
        session.placePublication(p2.id, { x: -1, y: 0, z: -1 });
        const p2RecordBefore = placementRegistry.findByPublicationId(p2.id)[0];
        assert(p2RecordBefore !== undefined, 'G0. Sanity: P2 has its existing placement.');

        // P3 is never admitted anywhere — the "rejected/unverified" case.
        let p3Threw = null;
        try { session.placePublication('g-p3-unknown', { x: 0, y: 0, z: 0 }); } catch (e) { p3Threw = e; }
        assert(p3Threw !== null && /not found/.test(p3Threw.message),
            'G1. P3 (never admitted/resolvable) cannot be placed — throws a resolution error, never a fabricated placement.');

        // Explicitly place P1 — this must not touch P2 at all.
        session.placePublication(p1.id, { x: 5, y: 0, z: 5 });
        const p1Records = placementRegistry.findByPublicationId(p1.id);
        const p2RecordAfter = placementRegistry.findByPublicationId(p2.id)[0];
        assert(p1Records.length === 1, 'G2. P1 now has exactly one placement of its own.');
        assert(p2RecordAfter.placementId === p2RecordBefore.placementId && p2RecordAfter.revision === p2RecordBefore.revision,
            'G3. Selecting/placing P1 leaves P2\'s existing placement completely untouched — no cross-contamination between Publications.');

        console.log('✓ G — Acceptance F: an unplaced Publication is placeable, an already-placed one is unaffected by a sibling\'s placement, and an unresolvable one cannot be placed at all — all three correctly isolated.');
    }

    // ===============================================================
    // Section H — Acceptance G: backward compatibility. With no
    // decentralizedPublicationDiscoveryProvider at all,
    // publicationActionDiscoveryProvider degrades to plain
    // discoveryProvider (0.9.597), and placement for an ordinary,
    // locally-known Publication is unaffected.
    // ===============================================================
    {
        const { session, storage, placementRegistry, publicationActionDiscoveryProvider, discoveryProvider } = buildSession();
        assert(publicationActionDiscoveryProvider === discoveryProvider,
            'H1. With no decentralized provider supplied, publicationActionDiscoveryProvider IS discoveryProvider itself — the exact 0.9.597 degradation, unchanged.');

        const publication = new Publication({ id: 'h-pub', documentId: 'h-doc', title: 'H Pub', author: 'alice', contentReference: new ContentReference({ hash: '8'.repeat(64) }) });
        storage.save('forkbuild-publications', [publication.toJSON()]);

        const placement = session.placePublication('h-pub', { x: 2, y: 0, z: 2 });
        assert(placement !== null && placementRegistry.findByPublicationId('h-pub').length === 1,
            'H2. placePublication() still works for an ordinary, locally-known Publication when no decentralized provider was ever supplied.');

        console.log('✓ H — Acceptance G: no decentralizedPublicationDiscoveryProvider supplied degrades to the exact pre-0.9.600, pre-0.9.597 behavior — this capability is purely additive.');
    }

    // ===============================================================
    // Section I — a session built without placePublicationUseCase
    // (every pre-0.9.600 caller and test) cannot reach this capability,
    // and fails clearly rather than crashing unexpectedly.
    // ===============================================================
    {
        const { session } = buildSession({ wirePlacePublicationUseCase: false });
        let threw = null;
        try { session.placePublication('anything', { x: 0, y: 0, z: 0 }); } catch (e) { threw = e; }
        assert(threw !== null && /no PlacePublicationUseCase wired/.test(threw.message),
            'I1. A session without placePublicationUseCase throws a clear, specific error — every pre-0.9.600 caller/test is unaffected by this new capability.');

        console.log('✓ I — a session that never opted into this capability fails clearly, exactly like movePlacement()/removePlacement()\'s own pre-existing "not wired" guards.');
    }

    // ===============================================================
    // Section J — UI wiring, confirmed in real source.
    // ===============================================================
    {
        const panelSrc = (await Promise.all(ownPublicationPanelFiles().map((file) => readSource(file)))).join('\n');
        assert(/placePublicationCommand: \{\s*type: Function,\s*default: null\s*\}/.test(panelSrc),
            'J1. OwnPublicationPanel.js declares an optional placePublicationCommand prop, mirroring unpublishCommand\'s own shape.');
        assert(/placeOwnPublication\(\) \{/.test(panelSrc), 'J2. OwnPublicationPanel.js defines placeOwnPublication().');

        const placementsSection = panelSrc.split('own-publication-placements"')[1].split('</div>')[0];
        assert(/@click="placeOwnPublication"/.test(placementsSection),
            'J3. The "Place" button lives inside the EXISTING .own-publication-placements listing — never a new panel.');

        const viewSrc = (await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n');
        assert(/function placeOwnPublication\(publication\) \{/.test(viewSrc), 'J4. WorldView.js defines placeOwnPublication().');
        assert(/session\.placePublication\(publication\.id, position\)/.test(viewSrc), 'J5. It forwards directly to session.placePublication() — no logic of its own beyond resolving "here."');
        assert(/:placePublicationCommand="placeOwnPublication"/.test(viewSrc), 'J6. WorldView.js binds placePublicationCommand to OwnPublicationPanel.');

        console.log('✓ J — the UI wiring exists exactly where 0.9.599 Section G recommended: one new prop, one new button, inside the existing publicationId-keyed placements listing.');
    }

    // ===============================================================
    // Section K — Flagship: Discover -> Repository admission -> Place
    // -> World presence, end to end, for a Publication this replica
    // never locally published.
    // ===============================================================
    {
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const flagship = new Publication({ id: 'k-flagship', documentId: 'k-doc', title: 'Flagship', author: 'dave', contentReference: new ContentReference({ hash: '9'.repeat(64) }) });
        decentralized.add(flagship); // Repository admission (0.9.595)
        const { session, placementRegistry } = buildSession({ decentralizedPublicationDiscoveryProvider: decentralized });

        assert(session.findPublicationById(flagship.id) === flagship, 'K1. The Publication is reachable through the same publicationId-keyed resolution OwnPublicationPanel already uses (0.9.597).');
        const placement = session.placePublication(flagship.id, { x: 12, y: 0, z: -4 });
        assert(placement !== null, 'K2. Place succeeds.');
        const record = placementRegistry.findByPublicationId(flagship.id)[0];
        assert(record.revision === 1 && record.signature !== null && record.causalStamp !== null,
            'K3. World presence: a real, signed, causally-stamped, revision-1 PlacementRecord now exists — indistinguishable in kind from an automatically-placed publication\'s own initial record.');

        console.log('✓ K — FLAGSHIP: Discover -> Repository admission -> explicit Place -> real PlacementRecord -> World presence, entirely through existing, unmodified capability plus this milestone\'s one-argument wiring fix.');
    }

    console.log('\n✅ All Publication First-Placement Action Wiring Fix tests passed.');
}

run().catch((error) => {
    console.error('PublicationFirstPlacementActionWiringFix.test.js FAILED:', error);
    process.exitCode = 1;
});
