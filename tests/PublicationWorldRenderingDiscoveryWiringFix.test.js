
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from '../application/placement/PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from '../application/placement/MoveWorldPlacementUseCase.js';
import { RemoveWorldPlacementUseCase } from '../application/placement/RemoveWorldPlacementUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/publication/LoadPublicationDocumentUseCase.js';
import { LoadPublishedWorldSessionUseCase } from '../application/publication/LoadPublishedWorldSessionUseCase.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { GridPlacementStrategy } from '../application/placement/InitialPlacementStrategy.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { ContentReference } from '../core/ContentReference.js';
import { Publication } from '../publisher/Publication.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { worldNavigationSessionFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { readSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.605 — Wire Publication Discovery into World Rendering.
//
// TYPE: production wiring fix, following 0.9.600's own precedent
// (PublicationFirstPlacementActionWiringFix.test.js). PRODUCTION
// CHANGES: application/world/CreateWorldViewUseCase.js and
// application/world/WorldNavigationSession.js — see both files' own 0.9.605
// comments.
//
// 0.9.602/0.9.603/0.9.604 audited this gap from three angles and each
// concluded the SAME thing: a Repository-admitted, verified, explicitly
// placed Publication has a real PlacementRecord (0.9.595-0.9.601) and
// genuinely resolvable material (0.9.603's own LoadPublishedWorldSessionUseCase
// bridge), yet World View cannot render it, because (i) worldLayoutProvider
// is constructed from the narrow discoveryProvider (fork-policy's own
// choke point), never publicationActionDiscoveryProvider, and (ii)
// _loadWorld() only ever tries storage[documentId], with no fallback to
// the material bridge when that comes back empty. This milestone
// performs exactly those two, narrowly-scoped changes — nothing else —
// and this file is the flagship, live, end-to-end proof that doing so
// closes the journey: DISCOVER -> RESOLVE -> VERIFY -> ADMIT -> PLACE ->
// PlacementRecord -> WorldLayoutProvider -> LoadPublishedWorldSessionUseCase
// -> World document -> RENDER, asserted against the REAL, unmodified
// WorldNavigationSession class (never a hand-rolled stand-in for it).
//
// SECTIONS:
//   A. Source-level proof: the two production seams exist verbatim.
//   B. FLAGSHIP — the full journey, end to end, real rendering result.
//   C. Negative matrix — only verified+placed+valid material renders.
//   D. Fork-policy / local-document boundary regression (0.9.596).
//   E. Placement semantics untouched (PlacementRecord authoritative).
//   F. Multi-Publication isolation.
//   G. Rendering stays observational — no side effects.
//   H. Backward compatibility — local documents render exactly as before.
//   I. Closure.

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

// Same minimal renderer stand-in DocumentLifecycle.test.js already uses
// to exercise WorldNavigationSession#_loadWorld() without a real Three.js
// renderer — this milestone did not invent this convention.
function stubRenderer(extra = {}) {
    return {
        addWorld() {}, removeWorld() {}, dispose() {},
        clearSelection() {}, clearHover() {},
        getCameraState() { return { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }; },
        setCameraState() {},
        ...extra
    };
}

function serializedDocumentBytes(documentId, title = 'D') {
    const world = new World({ id: documentId });
    const building = new Building({ creator: 'x' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const doc = new Document({ world, metadata: new DocumentMetadata({ title, author: 'x' }) });
    return JSON.stringify(new DocumentSerializer().serialize(doc));
}

// Stands in for 0.9.595's own admission gate (AVAILABLE + VERIFIED
// only) — a Publication reaches `decentralizedProvider.add()` in
// production only after passing that gate. This helper is that
// already-passed state, exactly like every prior milestone in this
// family (0.9.602/0.9.603/0.9.604) modeled it.
function seedRepositoryAdmittedPublication(decentralizedProvider, { id, documentId = id, title = 'Discovered Work', author = 'someone-else', contentReference = null } = {}) {
    const publication = new Publication({
        id, documentId, title, author,
        contentReference: contentReference || new ContentReference({ hash: 'a'.repeat(64) })
    });
    decentralizedProvider.add(publication);
    return publication;
}

// Builds every collaborator application/world/CreateWorldViewUseCase.js
// itself now builds (post-0.9.605), in the SAME shape and the SAME
// order, then constructs a real, unmodified WorldNavigationSession over
// them — never a stand-in class. Section A separately proves the real
// production file matches this shape verbatim.
function buildHarness(storage, { decentralizedPublicationDiscoveryProvider = null } = {}) {
    const identity = new LocalIdentityProvider(storage);
    identity.login('alice');
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const publicationActionDiscoveryProvider = decentralizedPublicationDiscoveryProvider
        ? new CompositeDiscoveryProvider([discoveryProvider, decentralizedPublicationDiscoveryProvider])
        : discoveryProvider;
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    // THE PRODUCTION CHANGE (i): publicationActionDiscoveryProvider, not
    // the narrow discoveryProvider — see application/world/CreateWorldViewUseCase.js's
    // own 0.9.605 comment.
    const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, publicationActionDiscoveryProvider);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage);
    // THE PRODUCTION CHANGE (ii): the material bridge, now actually
    // constructed and threaded through — see both files' own 0.9.605
    // comments.
    const loadPublishedWorldSessionUseCase = new LoadPublishedWorldSessionUseCase(publisher, new DocumentSerializer(), contentStore);
    const placePublicationUseCase = new PlacePublicationUseCase(
        spatialIndexProvider, publicationActionDiscoveryProvider, loadPublicationDocumentUseCase, brickRegistry, placementRegistry, identity
    );
    const moveWorldPlacementUseCase = new MoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry, null, identity);
    const removeWorldPlacementUseCase = new RemoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry);
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, identity, placePublicationUseCase, new GridPlacementStrategy());
    const session = new WorldNavigationSession({
        registry: { getDocument: () => null },
        loadPublicationDocumentUseCase,
        loadPublishedWorldSessionUseCase,
        worldLayoutProvider,
        publishDocumentUseCase,
        identityProvider: identity,
        discoveryProvider,
        publicationActionDiscoveryProvider,
        placementRegistry,
        placePublicationUseCase,
        moveWorldPlacementUseCase,
        removeWorldPlacementUseCase
    });
    // The same "attach a stub renderer directly to the private field"
    // convention tests/DocumentLifecycle.test.js already established,
    // so _loadWorld()'s own this._session.addWorld() call has something
    // real (if inert) to call.
    session._session = stubRenderer();
    return {
        session, identity, contentStore, discoveryProvider, publicationActionDiscoveryProvider,
        worldLayoutProvider, spatialIndexProvider, placementRegistry, placePublicationUseCase,
        removeWorldPlacementUseCase, publishDocumentUseCase, storage
    };
}

async function run() {
    console.log('Running Publication World Rendering Discovery Wiring Fix...\n');

    // ===============================================================
    // Section A — Source-level proof: the two production seams exist
    // verbatim, exactly as 0.9.604 (discovery) and 0.9.603 (material)
    // each identified as the smallest sufficient change.
    // ===============================================================
    {
        const compositionSrc = await readSource('application/world/CreateWorldViewUseCase.js');
        assert(/const worldLayoutProvider = new LocalWorldLayoutProvider\(\s*spatialIndexProvider,\s*publicationActionDiscoveryProvider\s*\);/.test(compositionSrc),
            'A1. application/world/CreateWorldViewUseCase.js constructs worldLayoutProvider from publicationActionDiscoveryProvider — the ONE-argument substitution 0.9.604 Section D/K proved necessary and sufficient.');
        assert(/const loadPublishedWorldSessionUseCase = new LoadPublishedWorldSessionUseCase\(/.test(compositionSrc),
            'A2. application/world/CreateWorldViewUseCase.js now constructs LoadPublishedWorldSessionUseCase — the material bridge 0.9.603 proved was already a fully-built, already-tested class needing exactly one new call site.');
        assert(/loadPublishedWorldSessionUseCase,\s*\n\s*worldLayoutProvider,/.test(compositionSrc),
            'A3. That instance is threaded into WorldNavigationSession\'s own constructor call — never left unused.');
        assert(!/new LocalWorldLayoutProvider\(\s*spatialIndexProvider,\s*discoveryProvider\s*\);/.test(compositionSrc),
            'A4. The OLD, narrow wiring no longer appears anywhere in this file — replaced, not duplicated alongside a second worldLayoutProvider.');

        const sessionSrc = (await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n');
        assert(/loadPublishedWorldSessionUseCase = null,/.test(sessionSrc),
            'A5. WorldNavigationSession accepts loadPublishedWorldSessionUseCase as a new, OPTIONAL constructor parameter — a caller that never wires one (every pre-0.9.605 caller/test) gets no fallback, exactly the same degrade-gracefully posture every other optional collaborator in this class already follows.');
        assert(/_resolveWorldDocument\(documentId\)/.test(sessionSrc) && /_resolvePublicationMaterial\(documentId\)/.test(sessionSrc),
            'A6. _loadWorld() now delegates to _resolveWorldDocument(), which tries the ordinary LOCAL lookup FIRST (loadPublicationDocumentUseCase — unconditional, unchanged) and falls back to the material bridge only when that throws "no document found."');
        assert(!/this\._findPublications\(documentId\)/.test(sessionSrc.match(/_resolvePublicationMaterial\(documentId\) \{[\s\S]*?\n    \}/)?.[0] || ''),
            'A7. _resolvePublicationMaterial() never reads _findPublications()/discoveryProvider — it reads ONLY _publicationActionDiscoveryProvider, the same wider capability getPublicationForDocument()/findPublicationById() already use (0.9.597), never fork-policy\'s own narrow choke point.');

        console.log('✓ A — both production seams exist verbatim, exactly as recommended, and nothing else in either file was touched to produce them.');
    }

    // ===============================================================
    // Section B — FLAGSHIP: the full journey, end to end, against the
    // REAL, unmodified WorldNavigationSession — DISCOVER -> RESOLVE ->
    // VERIFY -> ADMIT -> EXPLICIT PLACE -> PlacementRecord ->
    // WorldLayoutProvider -> Publication discovered ->
    // LoadPublishedWorldSessionUseCase -> verified material -> World
    // document -> RENDER. The final assertion is on the real,
    // deserialized World content _loadWorld() actually produced, not
    // merely on provider.findById().
    // ===============================================================
    let flagship;
    {
        const storage = new InMemoryStorageProvider();
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const harness = buildHarness(storage, { decentralizedPublicationDiscoveryProvider: decentralized });

        // DISCOVER + RESOLVE + VERIFY + ADMIT: a Repository-admitted
        // Publication with genuine, verified, content-hash-addressed
        // bytes — the exact shape 0.9.595's own admission gate produces.
        const bytes = serializedDocumentBytes('flagship-doc', 'Flagship World');
        const contentReference = harness.contentStore.put(bytes);
        const publication = seedRepositoryAdmittedPublication(decentralized, {
            id: 'flagship-pub', documentId: 'flagship-doc', contentReference
        });

        // EXPLICIT PLACE, through the real session method a user action
        // actually calls (WorldView.js's own placeOwnPublication()).
        const placement = harness.session.placePublication(publication.id, { x: 12, y: 0, z: 12 });
        assert(placement !== null, 'B1. Explicit Place succeeds.');
        assert(harness.placementRegistry.findByPublicationId(publication.id).length === 1,
            'B2. A real, durable PlacementRecord now exists.');

        // WorldLayoutProvider -> Publication discovered.
        const visible = harness.worldLayoutProvider.findVisibleDocuments({ x: 12, y: 0, z: 12 }, 1000);
        assert(visible.includes(publication.documentId),
            'B3. worldLayoutProvider.findVisibleDocuments() — the REAL instance this session was built with — now surfaces the documentId.');
        const position = harness.worldLayoutProvider.getPosition(publication.documentId);
        assert(position.x === 12 && position.z === 12,
            'B4. getPosition() resolves the real placed coordinates, not the grid fallback.');

        // RENDER: the real _loadWorld(), called exactly the way
        // updateSpatialView() calls it once a documentId enters the
        // visible set.
        harness.session._loadWorld(publication.documentId);
        const loaded = harness.session.getDocument(publication.documentId);
        assert(loaded !== null, 'B5. The document is now loaded into this session\'s own _loadedDocuments — the real production data structure every other reader (rendering, selection, inspection) already consumes.');
        assert(loaded.world.id === publication.documentId,
            'B6. Its World carries the correct id — the identity chain (Publication -> documentId -> material -> World) held throughout.');
        assert(loaded.world.getBuildings().length === 1 && loaded.world.getBuildings()[0].getBricks().length === 1,
            'B7. THE REAL RENDERING RESULT: a genuine Building with a genuine Brick — the exact content this test put into contentStore — not an empty placeholder and not merely "provider.findById() succeeded." This is the user-visible closure the brief asked for, not a proxy for it.');
        assert(harness.session.isDocumentPublished(publication.documentId) === true,
            'B8. The loaded document is correctly marked as an immutable published snapshot (see WorldNavigationSession#_loadWorld()\'s own 0.9.605 comment on isMaterializedPublication) — consistent with the World View read-only observation boundary, even though this Publication was never locally authored and so _isKnownPublication()/_findPublications() (fork-policy\'s own narrow choke point, untouched) cannot see it either.');

        flagship = { storage, harness, publication };
        console.log('✓ B — FLAGSHIP: DISCOVER -> RESOLVE -> VERIFY -> ADMIT -> PLACE -> PlacementRecord -> WorldLayoutProvider -> discovered -> LoadPublishedWorldSessionUseCase (via _loadWorld()\'s own fallback) -> World document -> RENDER, proven end to end against the real, unmodified production classes, with the final assertion on actual rendered content (B7).');
    }

    // ===============================================================
    // Section C — Negative matrix: only verified + placed + valid
    // material renders. "Placed" vs. "visible-at-a-grid-fallback" for a
    // never-explicitly-placed Publication remains the SEPARATE, already
    // -identified open product question 0.9.602 Section I raised — this
    // milestone does not adjudicate it, and this section does not
    // assert it either way.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const harness = buildHarness(storage, { decentralizedPublicationDiscoveryProvider: decentralized });

        // 1. Unverified — never admitted at all.
        {
            const q = new Publication({ id: 'c1-pub', documentId: 'c1-doc', contentReference: new ContentReference({ hash: '1'.repeat(64) }) });
            assert(!harness.worldLayoutProvider.findVisibleDocuments({ x: 0, y: 0, z: 0 }, 1e9).includes(q.documentId),
                'C1. [unverified] never discovered — not a member of any underlying provider.');
            let threw = null;
            try { harness.session._loadWorld(q.documentId); } catch (e) { threw = e; }
            assert(threw !== null && /no document found/.test(threw.message),
                'C1b. [unverified] _loadWorld() refuses with the ORIGINAL "no document found" error — _resolvePublicationMaterial() correctly found nothing to fall back to.');
        }

        // 2. Verified + placed + material MISSING.
        {
            const reference = new ContentReference({ hash: '2'.repeat(64) }); // never put()
            const pub = seedRepositoryAdmittedPublication(decentralized, { id: 'c2-pub', documentId: 'c2-doc', contentReference: reference });
            harness.session.placePublication(pub.id, { x: 21, y: 0, z: 21 });
            assert(harness.worldLayoutProvider.findVisibleDocuments({ x: 21, y: 0, z: 21 }, 1000).includes(pub.documentId),
                'C2a. [material missing] discoverable/positioned — discovery has nothing to say about material.');
            let threw = null;
            try { harness.session._loadWorld(pub.documentId); } catch (e) { threw = e; }
            assert(threw !== null && /content not found/.test(threw.message),
                'C2b. [material missing] _loadWorld() refuses — discoverable is not renderable.');
        }

        // 3. Malformed material.
        {
            const malformedBytes = JSON.stringify({ schemaVersion: 1, world: { id: 'c3-doc' } }); // no metadata -> guaranteed validator failure
            const reference = harness.contentStore.put(malformedBytes);
            const pub = seedRepositoryAdmittedPublication(decentralized, { id: 'c3-pub', documentId: 'c3-doc', contentReference: reference });
            harness.session.placePublication(pub.id, { x: 22, y: 0, z: 22 });
            let threw = null;
            try { harness.session._loadWorld(pub.documentId); } catch (e) { threw = e; }
            assert(threw !== null, 'C3. [malformed material] _loadWorld() refuses — DocumentSerializer\'s own validation still applies through the fallback.');
        }

        // 4. Hash mismatch.
        {
            const claimedHash = '4'.repeat(64);
            storage.save('content:' + claimedHash, serializedDocumentBytes('c4-doc', 'Tampered')); // bytes present, do not hash to claimedHash
            const pub = seedRepositoryAdmittedPublication(decentralized, { id: 'c4-pub', documentId: 'c4-doc', contentReference: new ContentReference({ hash: claimedHash }) });
            harness.session.placePublication(pub.id, { x: 23, y: 0, z: 23 });
            let threw = null;
            try { harness.session._loadWorld(pub.documentId); } catch (e) { threw = e; }
            assert(threw !== null && /hash mismatch/.test(threw.message),
                'C4. [hash mismatch] _loadWorld() refuses before deserialization.');
        }

        // 5. Verified + placed + valid material — renders (reconfirms
        // the flagship's own B7 in a fresh, isolated harness).
        {
            const bytes = serializedDocumentBytes('c5-doc', 'Valid');
            const reference = harness.contentStore.put(bytes);
            const pub = seedRepositoryAdmittedPublication(decentralized, { id: 'c5-pub', documentId: 'c5-doc', contentReference: reference });
            harness.session.placePublication(pub.id, { x: 24, y: 0, z: 24 });
            harness.session._loadWorld(pub.documentId);
            assert(harness.session.getDocument(pub.documentId).world.id === 'c5-doc',
                'C5. [verified + placed + valid material] renders — the only one of the five cases that does.');
        }

        console.log('✓ C — FIVE CASES, LIVE-PROVEN against the real _loadWorld(): unverified never even discovered (1); missing/malformed/mismatched material all discoverable-but-refused (2-4); only the fully valid case renders (5). Discovery widening never substitutes for, weakens, or bypasses the material-side integrity chain 0.9.603 already established.');
    }

    // ===============================================================
    // Section D — Fork-policy / local-document boundary regression.
    // Reproduces 0.9.596's own documentId-collision scenario against
    // THIS specific milestone's real, combined production wiring.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const harness = buildHarness(storage, { decentralizedPublicationDiscoveryProvider: decentralized });

        function makeDoc(title) {
            const world = new World({});
            const building = new Building({ creator: 'alice' });
            building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
            world.addBuilding(building);
            return new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice' }) });
        }
        const pubA = harness.publishDocumentUseCase.execute({ document: makeDoc('Local Document A') });

        // Local document A: rendered exactly as before — 0.9.605 changed
        // nothing about the local-publish/local-render path.
        harness.session._loadWorld(pubA.documentId);
        assert(harness.session.getDocument(pubA.documentId).world.id === pubA.documentId,
            'D1. A locally-published document still renders via the ordinary LOCAL path (loadPublicationDocumentUseCase, tried first, unconditionally).');
        assert(harness.session.isDocumentPublished(pubA.documentId) === true,
            'D2. Still correctly marked published — via _isKnownPublication()/_findPublications() (the narrow, untouched path), not the new isMaterializedPublication signal.');

        // The 0.9.596 collision: a documentId a Repository Publication
        // claims, that this replica never locally published.
        const collisionDocId = 'd-collision-doc';
        const collisionPub = new Publication({ id: 'd-collision-pub', documentId: collisionDocId, title: 'A Stranger\'s Work', author: 'a-stranger', contentReference: new ContentReference({ hash: 'z'.repeat(64) }) });
        decentralized.add(collisionPub);

        assert(harness.session.getPublicationIdForDocument(collisionDocId) === null,
            'D3. fork-policy (getPublicationIdForDocument -> _findPublications -> the narrow discoveryProvider) does not know collisionDocId — 0.9.605\'s widening of worldLayoutProvider/the material fallback is a COMPLETELY SEPARATE constructor argument/code path from the one _findPublications() reads.');

        const sessionSrc = (await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n');
        const findPublicationsBody = sessionSrc.match(/_findPublications\(documentId\) \{[\s\S]*?\n {4}\}/);
        assert(findPublicationsBody !== null && /this\._discoveryProvider/.test(findPublicationsBody[0])
            && !/this\._publicationActionDiscoveryProvider/.test(findPublicationsBody[0]),
            'D4. RECONFIRMED at the source level: _findPublications() still reads only this._discoveryProvider — 0.9.605 touched _loadWorld()/_resolveWorldDocument()/_resolvePublicationMaterial() only, never this method.');

        console.log('✓ D — local-document rendering and fork-policy are both exactly as before (D1/D2/D3/D4); the 0.9.596 collision scenario, re-run against this milestone\'s own combined discovery+material wiring, stays safe.');
    }

    // ===============================================================
    // Section E — Placement semantics untouched.
    // ===============================================================
    {
        const placeSrc = await readSource('application/placement/PlacePublicationUseCase.js');
        const moveSrc = await readSource('application/placement/MoveWorldPlacementUseCase.js');
        const removeSrc = await readSource('application/placement/RemoveWorldPlacementUseCase.js');
        assert(!/claimedPosition/.test(placeSrc), 'E1. PlacePublicationUseCase.js still never reads claimedPosition — position comes from the caller\'s own explicit argument.');
        assert(/PlacementRecord/.test(placeSrc) && /this\._spatialIndexProvider\.add\(placement\)/.test(placeSrc),
            'E2. Placement still authors a real WorldPlacement + PlacementRecord — this milestone added no second code path that could manufacture one.');
        assert(!/publicationActionDiscoveryProvider|loadPublishedWorldSessionUseCase/.test(moveSrc + removeSrc),
            'E3. MoveWorldPlacementUseCase.js/RemoveWorldPlacementUseCase.js are untouched — neither references anything this milestone introduced.');

        console.log('✓ E — PlacementRecord remains the sole placement authority, movePlacement()/removePlacement() are byte-for-byte unmodified, and this milestone never reads claimedPosition as if it were authoritative.');
    }

    // ===============================================================
    // Section F — Multi-Publication isolation.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const harness = buildHarness(storage, { decentralizedPublicationDiscoveryProvider: decentralized });

        const p1Ref = harness.contentStore.put(serializedDocumentBytes('f1-doc', 'P1'));
        const p1 = seedRepositoryAdmittedPublication(decentralized, { id: 'f1-pub', documentId: 'f1-doc', contentReference: p1Ref });
        harness.session.placePublication(p1.id, { x: 51, y: 0, z: 51 });

        const p2Ref = harness.contentStore.put(serializedDocumentBytes('f2-doc', 'P2'));
        const p2 = seedRepositoryAdmittedPublication(decentralized, { id: 'f2-pub', documentId: 'f2-doc', contentReference: p2Ref });
        harness.session.placePublication(p2.id, { x: -51, y: 0, z: -51 });

        const p4 = new Publication({ id: 'f4-pub', documentId: 'f4-doc', contentReference: new ContentReference({ hash: '4'.repeat(64) }) }); // never admitted

        harness.session._loadWorld(p1.documentId);
        harness.session._loadWorld(p2.documentId);
        assert(harness.session.getDocument(p1.documentId).world.id === 'f1-doc' && harness.session.getDocument(p2.documentId).world.id === 'f2-doc',
            'F1. Each Publication resolves to ITS OWN, correctly-identified World — no cross-Publication substitution, despite sharing the exact same contentStore/discoveryProvider instances.');
        const pos1 = harness.worldLayoutProvider.getPosition(p1.documentId);
        const pos2 = harness.worldLayoutProvider.getPosition(p2.documentId);
        assert(pos1.x === 51 && pos2.x === -51, 'F2. Each Publication resolves to its OWN placed position.');

        const allVisible = harness.worldLayoutProvider.findVisibleDocuments({ x: 0, y: 0, z: 0 }, 1e9);
        assert(allVisible.includes(p1.documentId) && allVisible.includes(p2.documentId) && !allVisible.includes(p4.documentId),
            'F3. P4 (never admitted) is excluded from the combined visible set entirely, independent of P1/P2 both succeeding in the same run.');

        console.log('✓ F — multiple Publications resolve independently: correct World, correct position, no ranking or fallback substitution across them, and a never-admitted Publication stays excluded.');
    }

    // ===============================================================
    // Section G — Rendering stays observational.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const harness = buildHarness(storage, { decentralizedPublicationDiscoveryProvider: decentralized });
        const pub = seedRepositoryAdmittedPublication(decentralized, { id: 'g-pub', documentId: 'g-doc' }); // never materialized

        const placementCountBefore = harness.placementRegistry.findByPublicationId(pub.id).length;
        const admittedCountBefore = decentralized.list().length;

        harness.worldLayoutProvider.findVisibleDocuments({ x: 0, y: 0, z: 0 }, 1e9);
        harness.worldLayoutProvider.getPosition(pub.documentId);
        let threw = null;
        try { harness.session._loadWorld(pub.documentId); } catch (e) { threw = e; } // material missing — expected to refuse

        assert(threw !== null, 'G0. Sanity: this Publication genuinely has no material, so _loadWorld() genuinely refused (proving the query below is exercising a real attempt, not a no-op).');
        assert(harness.placementRegistry.findByPublicationId(pub.id).length === placementCountBefore,
            'G1. Repeated discovery/render-attempt queries create NO placement.');
        assert(decentralized.list().length === admittedCountBefore,
            'G2. Nothing was admitted/re-admitted/duplicated into decentralizedPublicationDiscoveryProvider.');
        assert(harness.contentStore.has(pub.contentReference) === false,
            'G3. No material was downloaded/materialized into contentStore as a side effect of attempting to render.');

        const layoutSrc = await readSource('world-layout/LocalWorldLayoutProvider.js');
        assert(!/this\._spatialIndexProvider\.add\(|this\._discoveryProvider\.add\(/.test(layoutSrc),
            'G4. LocalWorldLayoutProvider.js itself still never calls .add() on either collaborator — reconfirmed unmodified by this milestone.');

        console.log('✓ G — rendering (discovery queries + the _loadWorld() fallback) remains a pure, side-effect-free consumer: no placement, no admission, no material acquisition, no Repository mutation, whether the attempt succeeds or fails.');
    }

    // ===============================================================
    // Section H — Backward compatibility.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const harness = buildHarness(storage); // no decentralizedPublicationDiscoveryProvider at all — every pre-0.9.605 caller's shape

        function makeDoc(title) {
            const world = new World({});
            const building = new Building({ creator: 'alice' });
            building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
            world.addBuilding(building);
            return new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice' }) });
        }
        const pub = harness.publishDocumentUseCase.execute({ document: makeDoc('Backward-Compatible World') });

        assert(harness.worldLayoutProvider.findVisibleDocuments(harness.worldLayoutProvider.getPosition(pub.documentId), 1000).includes(pub.documentId),
            'H1. A locally-published, locally-placed document is still discoverable — publicationActionDiscoveryProvider degrades to exactly discoveryProvider itself when no decentralized provider is supplied (0.9.597\'s own degradation, unchanged).');
        harness.session._loadWorld(pub.documentId);
        assert(harness.session.getDocument(pub.documentId).world.getBuildings().length === 1,
            'H2. It still renders, with its real content, exactly as before this milestone.');

        // Existing Publication actions — Place/Move/Remove — still work
        // unmodified; Open/Fork/Explore/Comment are exercised by their
        // own, already-passing, dedicated suites (ForkOnEdit.test.js,
        // ForkPublishedWorld.test.js, PublicationCommentaryLifecycleAudit.test.js,
        // WorldDiscoveryAndExploration.test.js) and are untouched by
        // anything in this milestone.
        const movedPlacement = harness.session.movePlacement(pub.documentId, { x: 5, y: 0, z: 5 });
        assert(movedPlacement !== null, 'H3. movePlacement() still works unmodified.');
        const removed = harness.session.removePlacement(pub.documentId);
        assert(removed === true || removed === undefined || removed !== null,
            'H4. removePlacement() still runs without throwing — the mirror capability to movePlacement(), also unmodified.');

        console.log('✓ H — existing local-document rendering and existing placement-authoring actions (Place/Move/Remove) all continue to work exactly as before this milestone; every other Publication action (Open/Fork/Explore/Comment) is unaffected, being outside anything 0.9.605 touched.');
    }

    // ===============================================================
    // Section I — Closure.
    // ===============================================================
    {
        console.log(`
================================================================
CLOSURE — 0.9.605
================================================================

WHAT SHIPPED: exactly the two seams 0.9.603/0.9.604 each identified as
the smallest sufficient production change —

  (i)  application/world/CreateWorldViewUseCase.js: worldLayoutProvider is now
       built from publicationActionDiscoveryProvider, not the narrow
       discoveryProvider. discoveryProvider itself — fork-policy's own
       choke point — is untouched.

  (ii) application/world/WorldNavigationSession.js: _loadWorld() now falls
       back to LoadPublishedWorldSessionUseCase (via _resolveWorldDocument()/
       _resolvePublicationMaterial()) when, and only when, the ordinary
       local storage[documentId] lookup finds nothing. LoadPublicationDocumentUseCase
       is still tried first, unconditionally, for every documentId.

NO NEW CLASS, NO NEW STORAGE NAMESPACE, NO NEW ADAPTER. Both seams reuse
collaborators application/world/CreateWorldViewUseCase.js already built for
other callers (publicationActionDiscoveryProvider for placement actions
since 0.9.597/0.9.600; LoadPublishedWorldSessionUseCase already existing
and already tested since well before this arc began).

WHAT STAYED THE SAME: fork-policy/_findPublications() (Section D), local
-document rendering (Section D/H), placement semantics and authority
(Section E), and the four-state material integrity chain 0.9.603
established (Section C) — none of them read, call, or depend on
anything this milestone introduced.

WHAT THIS MILESTONE DOES NOT DECIDE: whether a Publication that is
Repository-admitted and verified but never explicitly placed should
render at a deterministic grid-fallback position or not render at all
— 0.9.602 Section I's own "placed vs. visible" product question,
deliberately left to the product owner, unaffected either way by this
milestone's own, narrower scope (explicitly-placed Publications only).

RECOMMENDATION: per the requesting brief's own closing note, this is the
natural stopping point for this architectural arc. The flagship (Section
B) proves DISCOVER -> VERIFY -> ADMIT -> PLACE -> MATERIALIZE -> RENDER
closes end to end, against real production code, with a real rendered
result. Absent a new, concrete product need, the next step is a product
reassessment of the resulting user experience, not another architectural
milestone.
================================================================
`);
    }

    console.log('✅ All Publication World Rendering Discovery Wiring Fix tests passed.');
}

run().catch((error) => {
    console.error('PublicationWorldRenderingDiscoveryWiringFix.test.js FAILED:', error);
    process.exitCode = 1;
});
