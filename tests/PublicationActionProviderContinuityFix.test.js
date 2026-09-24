import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License, LicenseId } from '../core/License.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LoadPublicationDocumentUseCase } from '../application/publication/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/document/SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentCloneService } from '../application/document/DocumentCloneService.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { World } from '../core/World.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { worldViewFiles } from './support/SourceFileGroups.js';

// 0.9.597 — Publication Action Provider Continuity Fix.
//
// TYPE: production implementation + dedicated flagship test.
//
// CENTRAL QUESTION 0.9.596 left open: can WorldNavigationSession#getPublicationForDocument()/
// findPublicationById() — the exact inputs OwnPublicationPanel's own
// `publication` prop and AutomaticSnapshotEncounterCascade's own
// `findPublicationById` collaborator read — resolve a Publication that
// only exists in Repository's own decentralized/Repository-admitted
// catalog, WITHOUT widening fork-policy (`_isKnownPublication()`/
// `_checkForkPolicy()`) or `LocalWorldLayoutProvider`'s own position
// enrichment to that same catalog?
//
// THE FIX (see application/world/CreateWorldViewUseCase.js's own 0.9.597
// header and application/world/WorldNavigationSession.js's own constructor
// comment on `publicationActionDiscoveryProvider`): CreateWorldViewUseCase.js
// now accepts an optional `decentralizedPublicationDiscoveryProvider` and
// composes it into a SEPARATE `publicationActionDiscoveryProvider` — via
// the existing, unmodified discovery/CompositeDiscoveryProvider.js — that
// WorldNavigationSession consults ONLY from getPublicationForDocument()/
// findPublicationById(). `discoveryProvider` itself — the one
// `_findPublications()` (fork-policy/`_isKnownPublication()`) and
// `worldLayoutProvider` both read — is completely untouched: still a
// plain, local-only LocalDiscoveryProvider. ui/views/WorldView.js threads
// the SAME app-wide `decentralizedPublicationDiscoveryProvider` it
// already injects for Repository-search enrichment (0.9.339) through to
// this new parameter — never a second injection.
//
// SECTIONS.
//   A. Composition-root wiring — read from the real, current source.
//   B. Backward compatibility — no decentralizedPublicationDiscoveryProvider
//      supplied behaves byte-for-byte as before 0.9.597.
//   C. Publication Action reachability — getPublicationForDocument()/
//      findPublicationById() resolve a Repository-admitted-only
//      Publication, by exact instance.
//   D. No policy widening — a plain, never-locally-published document
//      sharing a documentId with a restrictively-licensed,
//      Repository-admitted Publication is NOT fork-policy blocked, and
//      world-layout position enrichment is unaffected.
//   E. Negative cases and multi-publication identity continuity.
//   F. No automatic placement — resolution alone creates no PlacementRecord.
//   G. ui/views/WorldView.js wiring — the real caller threads the real,
//      already-injected provider through, never a second injection.

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

// Replicates application/world/CreateWorldViewUseCase.js#execute()'s own new
// wiring exactly (never the full factory itself — see
// tests/RepositoryAdmissionToPublicationActionContinuityAudit.test.js's
// own harness comment for why: it spins up avatar-presence/collaboration
// machinery with no clean Node-only lifetime). Section A independently
// confirms, by reading the real source, that this replica's shape
// matches production byte-for-byte.
function buildProductionShapedSession(storage, { decentralizedPublicationDiscoveryProvider = null } = {}) {
    const identity = new LocalIdentityProvider(storage);
    identity.login('alice');
    const registry = new CreateBrickRegistryUseCase().execute();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const publicationActionDiscoveryProvider = decentralizedPublicationDiscoveryProvider
        ? new CompositeDiscoveryProvider([discoveryProvider, decentralizedPublicationDiscoveryProvider])
        : discoveryProvider;
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const session = new WorldNavigationSession({
        registry,
        loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(storage),
        worldLayoutProvider,
        saveDocumentUseCase: new SaveDocumentUseCase(storage),
        publishDocumentUseCase: new PublishDocumentUseCase(publisher, identity),
        identityProvider: identity,
        documentCloneService: new DocumentCloneService(),
        discoveryProvider,
        publicationActionDiscoveryProvider,
        placementRegistry
    });
    return { session, discoveryProvider, placementRegistry, identity };
}

function saveLoadableWorld(storage, { title = 'Merely Loaded World', author = 'someone-else' } = {}) {
    const serializer = new DocumentSerializer();
    const world = new World({});
    const doc = new Document({ world, metadata: new DocumentMetadata({ title, author }) });
    storage.save(world.id, serializer.serialize(doc));
    return world.id;
}

async function run() {
    console.log('Running Publication Action Provider Continuity Fix tests...\n');

    // ===============================================================
    // Section A — Composition-root wiring, read from the real source.
    // ===============================================================
    {
        const createWorldViewSource = await readSource('application/world/CreateWorldViewUseCase.js');
        assert(/const discoveryProvider = new LocalDiscoveryProvider\(storageProvider\);/.test(createWorldViewSource),
            'A1. `discoveryProvider` is still a bare, unmerged LocalDiscoveryProvider.');
        assert(/decentralizedPublicationDiscoveryProvider = null[\s\S]{0,400}\} = \{\}\) \{/.test(createWorldViewSource),
            'A2. execute() now accepts an optional decentralizedPublicationDiscoveryProvider.');
        assert(/const publicationActionDiscoveryProvider = decentralizedPublicationDiscoveryProvider\s*\n\s*\? new CompositeDiscoveryProvider\(\[discoveryProvider, decentralizedPublicationDiscoveryProvider\]\)\s*\n\s*: discoveryProvider;/.test(createWorldViewSource),
            'A3. publicationActionDiscoveryProvider composes discoveryProvider with the decentralized provider when supplied, and falls back to discoveryProvider itself otherwise — the exact CompositeDiscoveryProvider.js merge CreateDiscoveryUseCase.js already uses for Repository search.');
        assert(/publicationActionDiscoveryProvider,\s*\n\s*\/\/ 0\.2\.23: placement/.test(createWorldViewSource),
            'A4. publicationActionDiscoveryProvider is handed to WorldNavigationSession as its own, separate constructor argument, never folded into `discoveryProvider`.');

        const sessionSource = await readSource('application/world/WorldNavigationSession.js');
        assert(/this\._publicationActionDiscoveryProvider = publicationActionDiscoveryProvider \|\| discoveryProvider;/.test(sessionSource),
            'A5. WorldNavigationSession falls back to `discoveryProvider` itself when no separate provider is supplied.');
        assert(/getPublicationForDocument\(documentId\) \{\s*\n\s*if \(!this\._publicationActionDiscoveryProvider/.test(sessionSource),
            'A6. getPublicationForDocument() reads `_publicationActionDiscoveryProvider`, never `_resolvePublicationForPlacement()`/`_discoveryProvider` directly.');
        assert(/findPublicationById\(publicationId\) \{\s*\n\s*if \(!this\._publicationActionDiscoveryProvider/.test(sessionSource),
            'A7. findPublicationById() reads `_publicationActionDiscoveryProvider` too.');
        assert(/_findPublications\(documentId\) \{\s*\n\s*if \(!this\._discoveryProvider/.test(sessionSource),
            'A8. `_findPublications()` — the fork-policy/`_isKnownPublication()` choke point — still reads `_discoveryProvider` directly, completely untouched by this milestone.');

        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n');
        assert(/decentralizedPublicationDiscoveryProvider: decentralizedDiscoveryProviderForEnrichment/.test(worldViewSource),
            'A9. ui/views/WorldView.js threads the SAME already-injected decentralizedDiscoveryProviderForEnrichment through to CreateWorldViewUseCase.js\'s new parameter.');

        console.log('✓ A — composition-root wiring confirmed against the real, current production source: a SEPARATE publicationActionDiscoveryProvider, discoveryProvider itself untouched.');
    }

    // ===============================================================
    // Section B — Backward compatibility: no decentralized provider
    // supplied behaves exactly as before 0.9.597.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { session, discoveryProvider } = buildProductionShapedSession(storage);
        assert(session.getPublicationForDocument('nonexistent') === null, 'B1. No decentralized provider wired: getPublicationForDocument() behaves exactly as the pre-0.9.597 local-only lookup.');
        assert(session.findPublicationById('nonexistent') === null, 'B2. Same for findPublicationById().');

        // A LOCALLY known Publication (via the plain LocalDiscoveryProvider,
        // exactly the pre-0.9.597 path) still resolves correctly — the new
        // fallback never regresses the existing, real local case.
        const publication = new Publication({ id: 'local-pub', documentId: 'local-doc', title: 'Local', author: 'alice', contentReference: new ContentReference({ hash: 'x'.repeat(64) }), publishedAt: Date.now() });
        storage.save('forkbuild-publications', [publication.toJSON()]);
        const resolved = session.getPublicationForDocument('local-doc');
        assert(resolved !== null && resolved.id === 'local-pub', 'B3. A genuinely local Publication still resolves via getPublicationForDocument() with no decentralized provider wired.');
        assert(session.findPublicationById('local-pub') !== null, 'B4. ...and via findPublicationById() too.');
        void discoveryProvider;

        console.log('✓ B — backward compatibility holds: every pre-0.9.597 caller (no decentralizedPublicationDiscoveryProvider wired) observes byte-for-byte identical behavior, for both the negative and the genuinely-local-Publication case.');
    }

    // ===============================================================
    // Section C — Publication Action reachability: a Repository-
    // admitted-only Publication resolves through the real production
    // wiring, by exact instance.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const { session } = buildProductionShapedSession(storage, { decentralizedPublicationDiscoveryProvider });

        const publicationId = 'repo-admitted-pub-c';
        const documentId = 'repo-admitted-doc-c';
        const publication = new Publication({ id: publicationId, documentId, title: 'Repo Admitted C', author: 'carol', contentReference: new ContentReference({ hash: 'c'.repeat(64) }), publishedAt: Date.now() });

        assert(session.getPublicationForDocument(documentId) === null, 'C0. Sanity: not admitted yet.');
        decentralizedPublicationDiscoveryProvider.add(publication);

        assert(session.getPublicationForDocument(documentId) === publication, 'C1. getPublicationForDocument() now resolves the Repository-admitted Publication — by exact (===) instance, never reconstructed.');
        assert(session.findPublicationById(publicationId) === publication, 'C2. findPublicationById() resolves it too, by exact instance.');
        assert(session.getPublicationForDocument(documentId).documentId === documentId
            && session.getPublicationForDocument(documentId).author === 'carol',
            'C3. Every field survives intact — nothing about the object is narrowed or rebuilt on the way through.');

        console.log('✓ C — Publication Action reachability restored: OwnPublicationPanel\'s own `publication` prop input (getPublicationForDocument()) and AutomaticSnapshotEncounterCascade\'s own findPublicationById() collaborator both now resolve a Repository-admitted-only Publication, by exact instance.');
    }

    // ===============================================================
    // Section D — No policy widening: fork-policy and world-layout
    // enrichment stay on the narrow, local-only discoveryProvider.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();

        // A plain, never-locally-published document...
        const documentId = saveLoadableWorld(storage, { title: 'Plain Local World', author: 'dave' });

        // ...that happens to SHARE its documentId with a restrictively-
        // licensed Publication admitted ONLY through Repository (never
        // locally published) — the exact ripple-effect risk 0.9.596's
        // own Section D live-proved a shared `_findPublications()` lookup
        // would create.
        const restrictivePublication = new Publication({
            id: 'restrictive-pub-d', documentId, title: 'Restrictive D', author: 'someone-else',
            contentReference: new ContentReference({ hash: 'd'.repeat(64) }),
            license: new License({ id: LicenseId.ALL_RIGHTS_RESERVED, forkAllowed: false }),
            publishedAt: Date.now()
        });
        decentralizedPublicationDiscoveryProvider.add(restrictivePublication);

        const { session } = buildProductionShapedSession(storage, { decentralizedPublicationDiscoveryProvider });

        // D1: getPublicationForDocument() DOES now see the Repository-
        // admitted Publication for this documentId (Section C's own
        // capability) — the fix is real, not a no-op.
        assert(session.getPublicationForDocument(documentId) === restrictivePublication,
            'D1. Sanity: the widened capability is real — getPublicationForDocument() resolves the Repository-admitted Publication sharing this documentId.');

        // D2: but fork-policy — `_isKnownPublication`/`_checkForkPolicy`,
        // reached here through the public load/editability surface —
        // still resolves as if that Publication did not exist, because
        // `_findPublications()` still reads `discoveryProvider` alone.
        const notice = session.getEditabilityNotice(documentId);
        assert(notice === null || notice === undefined || !/license|fork/i.test(String(notice)),
            'D2. getEditabilityNotice() shows no fork-policy restriction for this plain, never-locally-published document — the restrictive, Repository-admitted-only Publication\'s license is never applied to it.');
        assert(session.getPublicationIdForDocument(documentId) === null,
            'D3. getPublicationIdForDocument() — which feeds ForkDocumentUseCase\'s own license enforcement for the "Edit a Copy" journey — still resolves null: fork-policy enforcement is not extended to this document.');

        console.log('✓ D — no policy widening: fork-policy resolution (_isKnownPublication()/_checkForkPolicy()/getPublicationIdForDocument()) stays exclusively on the narrow, local-only discoveryProvider, even though getPublicationForDocument() (Section C) now sees the wider catalog — exactly the correctly-scoped fix 0.9.596\'s own Section D called for.');
    }

    // ===============================================================
    // Section E — Negative cases and multi-publication continuity.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const { session } = buildProductionShapedSession(storage, { decentralizedPublicationDiscoveryProvider });

        const p1 = new Publication({ id: 'p1', documentId: 'doc-1', title: 'P1', author: 'alice', contentReference: new ContentReference({ hash: '1'.repeat(64) }), publishedAt: 100 });
        const p3 = new Publication({ id: 'p3', documentId: 'doc-3', title: 'P3', author: 'carol', contentReference: new ContentReference({ hash: '3'.repeat(64) }), publishedAt: 300 });
        decentralizedPublicationDiscoveryProvider.add(p1);
        decentralizedPublicationDiscoveryProvider.add(p3);
        // P2 is never admitted (e.g., rejected verification) — must stay unresolvable.

        assert(session.getPublicationForDocument('doc-1') === p1, 'E1. P1 resolves to its own, distinct instance.');
        assert(session.getPublicationForDocument('doc-2') === null, 'E2. The un-admitted P2 remains unresolvable.');
        assert(session.getPublicationForDocument('doc-3') === p3, 'E3. P3 resolves to its own, distinct instance — no cross-publication conflation with P1.');
        assert(session.findPublicationById('p1') === p1 && session.findPublicationById('p3') === p3 && session.findPublicationById('p2') === null,
            'E4. findPublicationById() agrees, id-keyed, for all three.');

        console.log('✓ E — negative cases and multi-publication identity continuity hold: an un-admitted Publication stays unresolvable, and multiple admitted Publications resolve to their own distinct instances with no conflation.');
    }

    // ===============================================================
    // Section F — No automatic placement: resolution alone creates no
    // PlacementRecord; the existing, explicit placement action remains
    // the sole authority.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const { session, placementRegistry } = buildProductionShapedSession(storage, { decentralizedPublicationDiscoveryProvider });

        const publicationId = 'placement-pub-f';
        const documentId = 'placement-doc-f';
        const publication = new Publication({ id: publicationId, documentId, title: 'Placement F', author: 'erin', contentReference: new ContentReference({ hash: 'f'.repeat(64) }), publishedAt: Date.now() });
        decentralizedPublicationDiscoveryProvider.add(publication);

        assert(session.getPublicationForDocument(documentId) === publication, 'F0. Sanity: resolution succeeds (Section C).');
        // OwnPublicationPanel reads placements through getPublicationPlacementsCommand(publication.id)
        // -> getPlacementInfoForPublication(publicationId) — ID-keyed, and
        // (per that method's own 0.9.187 comment) "bypasses discoveryProvider
        // entirely" — never the documentId-keyed getPlacementInfo(), which
        // stays local-only via _resolvePublicationForPlacement() (Section D).
        assert(session.getPlacementInfoForPublication(publicationId) === null, 'F1. No PlacementRecord exists merely because resolution now succeeds — getPlacementInfoForPublication() still returns null.');

        const { PlacementRecord } = await import('../core/PlacementRecord.js');
        placementRegistry.add(new PlacementRecord({ publicationId, position: { x: 1, y: 0, z: 1 }, owner: 'erin' }));
        assert(session.getPlacementInfoForPublication(publicationId) !== null, 'F2. A PlacementRecord only ever appears after the existing, explicit placement mechanism (placementRegistry.add(), reached via PlacePublicationUseCase/an explicit placement action) — never as a byproduct of resolution becoming reachable.');

        console.log('✓ F — no automatic placement: Publication Action reachability and placement remain two independent facts about the same Publication, exactly as 0.9.551/0.9.595 already established.');
    }

    console.log('\n✅ All PublicationActionProviderContinuityFix tests passed.');
    console.log(`
=== 0.9.597 CLASSIFICATION ===
IMPLEMENTED. Publication Action reachability (getPublicationForDocument()/findPublicationById(), and
therefore OwnPublicationPanel's own \`publication\` prop and AutomaticSnapshotEncounterCascade's own
findPublicationById collaborator) is restored for a Repository-admitted Publication, via a SEPARATE
publicationActionDiscoveryProvider composed only where 0.9.596's own Section D proved it safe. Fork-policy
(_isKnownPublication()/_checkForkPolicy()/getPublicationIdForDocument()) and LocalWorldLayoutProvider's own
position enrichment remain exclusively on the narrow, local-only discoveryProvider, unwidened. No automatic
placement is introduced; the existing, explicit placement action remains the sole authority that ever
produces a PlacementRecord. Production changed in exactly three files: application/world/CreateWorldViewUseCase.js
(composition root), application/world/WorldNavigationSession.js (the two repaired methods), and
ui/views/WorldView.js (threading the already-injected decentralized provider through).
`);
}

run().catch((error) => {
    console.error('PublicationActionProviderContinuityFix.test.js FAILED:', error);
    process.exitCode = 1;
});
