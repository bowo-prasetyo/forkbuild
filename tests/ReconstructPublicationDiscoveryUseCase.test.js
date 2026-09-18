import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionCoordinator } from '../application/PublicationResolutionCoordinator.js';
import { ReconstructPublicationDiscoveryUseCase } from '../application/ReconstructPublicationDiscoveryUseCase.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/CreatePublicationDisplayKindRegistryUseCase.js';
import { PUBLICATION_CONTENT_KIND } from '../application/PublicationContentValidator.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.9.608 — Reconstruct Publication Discovery at Application Composition.
//
// 0.9.607 (Publication Discovery Persistence Boundary Audit) was test-only:
// it proved, against real production classes assembled inside that test
// file, that a fresh discovery/DecentralizedPublicationDiscoveryProvider.js
// CAN be rebuilt from application/LocalPublicationCatalog.js alone, with
// no new store and no network call. This milestone promotes that proof
// into a real, reusable class — application/ReconstructPublicationDiscoveryUseCase.js
// — and wires it into ui/main.js's own composition root, immediately after
// the one DecentralizedPublicationDiscoveryProvider instance this replica
// ever constructs. This file tests the PRODUCTION class and its wiring,
// not a test-local stand-in.
//
//   Section A — Session-boundary flagship: a Publication discovered,
//               verified, admitted, and placed in "session 1" is
//               discoverable again in "session 2" after reconstruction,
//               with its PlacementRecord untouched and no new placement
//               created.
//   Section B — Verification-aware reconstruction: the same negative
//               material this codebase already established (missing,
//               corrupted, incomplete, tampered) is excluded, and one bad
//               entry never suppresses an unrelated valid one.
//   Section C — Multi-Publication identity: documentId-sharing and
//               contentHash-sharing entries reconstruct independently,
//               never collapsed.
//   Section D — No automatic network rediscovery, even when the
//               coordinator was built with a live peer transport.
//   Section E — Placement independence: reconstruction alone never
//               creates, modifies, or infers a placement.
//   Section F — Constructor contract: every collaborator is required,
//               matching existing composition conventions (no arbitrary
//               optionality introduced).
//   Section G — ui/main.js composition wiring: reconstruction runs at
//               the identified seam, reusing the app's existing catalog/
//               coordinator/kindPlugins, before the app mounts.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function tamperHex(hex) {
    const flipped = hex[0] === '0' ? '1' : '0';
    return flipped + hex.slice(1);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label, storage) {
    const provider = new LocalIdentityProvider(storage);
    provider.login(label);
    return provider;
}

function makePublication({ id, documentId, title, author = 'alice', contentHash }, identityProvider) {
    const documentContentReference = new ContentReference({
        hash: contentHash || `docHash-${documentId}`, algorithm: 'fnv1a-32', mediaType: 'application/json', size: 128
    });
    let publication = new Publication({
        id, documentId, title, author,
        providerId: 'local',
        contentHash: documentContentReference.hash,
        schemaVersion: 3,
        contentReference: documentContentReference,
        publisherIdentity: identityProvider.getSigningIdentity().toJSON(),
        signature: null
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

async function publishAndCatalog(resolver, catalog, fixture, identityProvider) {
    const publication = makePublication(fixture, identityProvider);
    const envelope = await resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider });
    catalog.add(envelope);
    return { publication, envelope };
}

// A peerContentExchange that throws the moment either method is invoked —
// used to PROVE reconstruction never contacts a peer, rather than merely
// asserting it on the returned view.
const NEVER_CALL_PEER_CONTENT_EXCHANGE = {
    request() { throw new Error('ReconstructPublicationDiscoveryUseCase must never request content from a peer'); },
    onContentReceived() { throw new Error('ReconstructPublicationDiscoveryUseCase must never subscribe to peer content'); }
};

async function run() {
    console.log('Running Reconstruct Publication Discovery Use Case tests...\n');

    const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();

    // ===============================================================
    // Section A — Session-boundary flagship.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const alice = makeIdentity('Alice-608-A', storage);

        // SESSION 1: discover -> verify -> admit -> place.
        const catalog1 = new LocalPublicationCatalog(storage);
        const resolver1 = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
        const coordinator1 = new PublicationResolutionCoordinator(resolver1, null);
        const provider1 = new DecentralizedPublicationDiscoveryProvider();

        const { publication } = await publishAndCatalog(resolver1, catalog1, { id: 'a-pub', documentId: 'a-doc', title: 'Session Boundary Subject' }, alice);
        await new ReconstructPublicationDiscoveryUseCase(catalog1, coordinator1, kindPlugins, provider1).execute();
        assert(provider1.findById('a-pub') !== null, '1. setup sanity: session 1 discovers its own just-admitted Publication.');

        const spatialIndexProvider1 = new LocalSpatialIndexProvider(storage);
        const placementRegistry1 = new LocalPlacementRegistry(storage, spatialIndexProvider1);
        new PlacePublicationUseCase(spatialIndexProvider1, provider1, { execute() { throw new Error('no document'); } }, null, placementRegistry1, alice)
            .execute(publication.id, { x: 10, y: 0, z: 10 });
        assert(placementRegistry1.findByPublicationId(publication.id).length === 1, '2. setup sanity: session 1 genuinely places the Publication.');

        // Destroy every session-1 object. SESSION 2 constructs fresh
        // instances against the SAME durable storage — exactly what a
        // real ui/main.js reload produces — and confirms the gap exists
        // before reconstruction runs.
        const catalog2 = new LocalPublicationCatalog(storage);
        const resolver2 = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
        const coordinator2 = new PublicationResolutionCoordinator(resolver2, null);
        const provider2 = new DecentralizedPublicationDiscoveryProvider();
        assert(provider2.findById('a-pub') === null, '3. before reconstruction, the fresh provider has never heard of this Publication.');

        const { reconstructed } = await new ReconstructPublicationDiscoveryUseCase(catalog2, coordinator2, kindPlugins, provider2).execute();
        assert(reconstructed === 1, '4. execute() reports exactly one Publication reconstructed.');
        assert(provider2.findById('a-pub') !== null, '5. *** THE FIX *** after reconstruction, the Publication is discoverable again in the fresh provider.');

        const placementRegistry2 = new LocalPlacementRegistry(storage, new LocalSpatialIndexProvider(storage));
        const recordsAfter = placementRegistry2.findByPublicationId('a-pub');
        assert(recordsAfter.length === 1, '6. the original PlacementRecord still exists — exactly one, never zero, never duplicated.');
        assert(recordsAfter[0].position.x === 10, '7. ...at its own original position, untouched by reconstruction.');

        console.log('✓ Section A: DISCOVER -> VERIFY -> ADMIT -> PLACE in session 1; a fresh session 2, before reconstruction, reproduces the gap; after reconstruction, the Publication is discoverable again and its original PlacementRecord is exactly as it was — never recreated, never duplicated.');
    }

    // ===============================================================
    // Section B — Verification-aware reconstruction.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const frank = makeIdentity('Frank-608-B', storage);
        const catalog = new LocalPublicationCatalog(storage);
        const contentStore = new LocalContentStore(storage);
        const resolver = new PublicationResolver(contentStore, new LocalAuthorizationVerifier());

        await publishAndCatalog(resolver, catalog, { id: 'b-good', documentId: 'b-doc-good', title: 'Valid' }, frank);

        const { envelope: missingEnvelope } = await publishAndCatalog(resolver, catalog, { id: 'b-missing', documentId: 'b-doc-missing', title: 'Missing Bytes' }, frank);
        storage.remove(`content:${missingEnvelope.contentReference.hash}`);

        const { envelope: corruptedEnvelope } = await publishAndCatalog(resolver, catalog, { id: 'b-corrupted', documentId: 'b-doc-corrupted', title: 'Corrupted Bytes' }, frank);
        const corruptedKey = `content:${corruptedEnvelope.contentReference.hash}`;
        const originalBytes = storage.load(corruptedKey);
        storage.save(corruptedKey, `${originalBytes.slice(0, -1)}X"`);

        const incompletePublication = makePublication({ id: 'b-incomplete', documentId: 'b-doc-incomplete', title: 'Incomplete' }, frank);
        const incompleteJson = incompletePublication.toJSON();
        delete incompleteJson.documentId;
        const incompleteRef = contentStore.put(JSON.stringify(incompleteJson));
        let incompleteEnvelope = new DecentralizedPublication({
            contentKind: PUBLICATION_CONTENT_KIND, contentReference: incompleteRef, publisherIdentity: frank.getSigningIdentity().toJSON()
        });
        incompleteEnvelope = incompleteEnvelope.withSignature(frank.signCanonical(incompleteEnvelope.getSigningDescriptor()));
        catalog.add(incompleteEnvelope);

        const { envelope: tamperedSource } = await publishAndCatalog(resolver, catalog, { id: 'b-tampered', documentId: 'b-doc-tampered', title: 'Tampered Envelope' }, frank);
        const allEntries = storage.load('publication-catalog:entries');
        const tamperedIndex = allEntries.findIndex((e) => e.publication.id === tamperedSource.id);
        allEntries[tamperedIndex].publication.signature.signature = tamperHex(allEntries[tamperedIndex].publication.signature.signature);
        storage.save('publication-catalog:entries', allEntries);

        const coordinator = new PublicationResolutionCoordinator(resolver, null);
        const provider = new DecentralizedPublicationDiscoveryProvider();
        const { reconstructed } = await new ReconstructPublicationDiscoveryUseCase(catalog, coordinator, kindPlugins, provider).execute();

        assert(reconstructed === 1, `1. exactly one of five cataloged entries reconstructs (reported ${reconstructed}).`);
        assert(provider.findById('b-good') !== null, '2. the valid Publication IS reconstructed.');
        assert(provider.findById('b-missing') === null, '3. missing material is NOT reconstructed.');
        assert(provider.findById('b-corrupted') === null, '4. corrupted material (content-hash mismatch) is NOT reconstructed.');
        assert(provider.findById('b-incomplete') === null, '5. an incomplete record (missing a required field) is NOT reconstructed.');
        assert(provider.findById('b-tampered') === null, '6. a tampered envelope signature is NOT reconstructed.');
        assert(provider.list().length === 1, '7. the valid entry is the only one admitted — one bad entry never suppresses another, independently valid one.');

        console.log('✓ Section B: reconstruction runs the full, unmodified PublicationResolver verification discipline for every catalog entry — missing, corrupted, incomplete, and tampered entries are each independently refused, and never suppress the one genuinely valid entry among them.');
    }

    // ===============================================================
    // Section C — Multi-Publication identity.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const heidi = makeIdentity('Heidi-608-C', storage);
        const catalog = new LocalPublicationCatalog(storage);
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());

        await publishAndCatalog(resolver, catalog, { id: 'c-p5', documentId: 'c-shared-doc', title: 'Shares documentId (A)' }, heidi);
        await publishAndCatalog(resolver, catalog, { id: 'c-p6', documentId: 'c-shared-doc', title: 'Shares documentId (B)' }, heidi);
        await publishAndCatalog(resolver, catalog, { id: 'c-p7', documentId: 'c-p7-doc', title: 'Shares contentHash (A)', contentHash: 'shared-content-hash' }, heidi);
        await publishAndCatalog(resolver, catalog, { id: 'c-p8', documentId: 'c-p8-doc', title: 'Shares contentHash (B)', contentHash: 'shared-content-hash' }, heidi);

        const coordinator = new PublicationResolutionCoordinator(resolver, null);
        const provider = new DecentralizedPublicationDiscoveryProvider();
        await new ReconstructPublicationDiscoveryUseCase(catalog, coordinator, kindPlugins, provider).execute();

        assert(provider.list().length === 4, '1. all four independently signed Publications reconstruct.');
        assert(provider.findById('c-p5').id !== provider.findById('c-p6').id
            && provider.findById('c-p5').documentId === provider.findById('c-p6').documentId,
            '2. documentId-sharing Publications reconstruct as two distinct, independently findable entries.');
        assert(provider.findById('c-p7').id !== provider.findById('c-p8').id
            && provider.findById('c-p7').contentHash === provider.findById('c-p8').contentHash,
            '3. contentHash-sharing Publications likewise reconstruct as two distinct entries.');

        console.log('✓ Section C: documentId-sharing and contentHash-sharing Publications each reconstruct as independent, distinct entries — never collapsed by the wrong identity dimension.');
    }

    // ===============================================================
    // Section D — No automatic network rediscovery.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const kate = makeIdentity('Kate-608-D', storage);
        const catalog = new LocalPublicationCatalog(storage);
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());

        // A publication whose bytes were never locally mirrored — the
        // one shape that WOULD trigger a peer request if this class ever
        // passed `peer`/`peers` to resolvePublicationView().
        const neverMirrored = new ContentReference({ hash: 'never-locally-mirrored-hash', algorithm: 'fnv1a-32', mediaType: 'application/json', size: 1 });
        let networkOnlyEnvelope = new DecentralizedPublication({
            contentKind: PUBLICATION_CONTENT_KIND, contentReference: neverMirrored, publisherIdentity: kate.getSigningIdentity().toJSON()
        });
        networkOnlyEnvelope = networkOnlyEnvelope.withSignature(kate.signCanonical(networkOnlyEnvelope.getSigningDescriptor()));
        catalog.add(networkOnlyEnvelope);

        // The coordinator is built with a LIVE peerContentExchange that
        // throws if ever touched — proving, not merely asserting, that
        // reconstruction never asks a peer for anything.
        const coordinator = new PublicationResolutionCoordinator(resolver, NEVER_CALL_PEER_CONTENT_EXCHANGE);
        const provider = new DecentralizedPublicationDiscoveryProvider();
        const { reconstructed } = await new ReconstructPublicationDiscoveryUseCase(catalog, coordinator, kindPlugins, provider).execute();

        assert(reconstructed === 0, '1. the network-only entry does not reconstruct.');
        assert(provider.list().length === 0, '2. the provider stays empty rather than hanging or throwing.');

        console.log('✓ Section D: reconstruction never contacts a peer, even when the coordinator it was handed was itself built with a live peerContentExchange — a publication with no locally-mirrored bytes simply does not reconstruct, rather than triggering any network fetch.');
    }

    // ===============================================================
    // Section E — Placement independence.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const ivan = makeIdentity('Ivan-608-E', storage);
        const catalog = new LocalPublicationCatalog(storage);
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());

        await publishAndCatalog(resolver, catalog, { id: 'e-placed', documentId: 'e-placed-doc', title: 'Placed' }, ivan);
        await publishAndCatalog(resolver, catalog, { id: 'e-unplaced', documentId: 'e-unplaced-doc', title: 'Unplaced' }, ivan);

        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
        const bootstrapProvider = new DecentralizedPublicationDiscoveryProvider();
        const bootstrapCoordinator = new PublicationResolutionCoordinator(resolver, null);
        await new ReconstructPublicationDiscoveryUseCase(catalog, bootstrapCoordinator, kindPlugins, bootstrapProvider).execute();
        new PlacePublicationUseCase(spatialIndexProvider, bootstrapProvider, { execute() { throw new Error('x'); } }, null, placementRegistry, ivan)
            .execute('e-placed', { x: 4, y: 0, z: 4 });

        const recordCountBefore = storage.list().filter((k) => k.startsWith('placement-record:')).length;

        const coordinator = new PublicationResolutionCoordinator(resolver, null);
        const provider = new DecentralizedPublicationDiscoveryProvider();
        await new ReconstructPublicationDiscoveryUseCase(catalog, coordinator, kindPlugins, provider).execute();

        const recordCountAfter = storage.list().filter((k) => k.startsWith('placement-record:')).length;
        assert(recordCountAfter === recordCountBefore, '1. reconstruction creates zero new placement-record keys.');

        const placementRegistryAfter = new LocalPlacementRegistry(storage, new LocalSpatialIndexProvider(storage));
        assert(placementRegistryAfter.findByPublicationId('e-placed').length === 1, '2. the placed Publication remains placed, exactly once.');
        assert(placementRegistryAfter.findByPublicationId('e-unplaced').length === 0, '3. the unplaced Publication remains unplaced.');
        assert(provider.findById('e-placed') !== null && provider.findById('e-unplaced') !== null,
            '4. both are discoverable regardless of placement — discovery and placement stay independent facts.');

        console.log('✓ Section E: reconstruction never creates, modifies, or infers a placement — placed stays placed exactly once, unplaced stays unplaced, and both remain independently discoverable.');
    }

    // ===============================================================
    // Section F — Constructor contract.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const catalog = new LocalPublicationCatalog(storage);
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
        const coordinator = new PublicationResolutionCoordinator(resolver, null);
        const provider = new DecentralizedPublicationDiscoveryProvider();

        assert(throws(() => new ReconstructPublicationDiscoveryUseCase(null, coordinator, kindPlugins, provider)),
            '1. a catalog is required.');
        assert(throws(() => new ReconstructPublicationDiscoveryUseCase(catalog, null, kindPlugins, provider)),
            '2. a coordinator is required.');
        assert(throws(() => new ReconstructPublicationDiscoveryUseCase(catalog, coordinator, kindPlugins, null)),
            '3. a discoveryProvider is required.');
        assert(!throws(() => new ReconstructPublicationDiscoveryUseCase(catalog, coordinator, undefined, provider)),
            '4. kindPlugins is the one caller-convenience default (an empty registry), matching resolvePublicationView()\'s own default — never a reason to skip the other three required collaborators.');

        console.log('✓ Section F: every collaborator ui/main.js already unconditionally composes (catalog, coordinator, discoveryProvider) is required, not optional — no arbitrary optionality was introduced where the app never needed any.');
    }

    // ===============================================================
    // Section G — ui/main.js composition wiring.
    // ===============================================================
    {
        const mainSource = await readSource('ui/main.js');

        assert(mainSource.includes("import { ReconstructPublicationDiscoveryUseCase } from '../application/ReconstructPublicationDiscoveryUseCase.js';"),
            '1. ui/main.js imports the production use case.');

        const constructionIndex = mainSource.indexOf('const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();');
        assert(constructionIndex !== -1, '2. the one provider instance this replica ever constructs is still built exactly as 0.9.607 identified.');

        const wiringIndex = mainSource.indexOf('new ReconstructPublicationDiscoveryUseCase(');
        assert(wiringIndex > constructionIndex, '3. reconstruction is wired AFTER the provider it populates is constructed.');

        const wiringWindow = mainSource.slice(constructionIndex, wiringIndex + 400);
        assert(/await new ReconstructPublicationDiscoveryUseCase\(\s*publicationCatalog, publicationResolutionCoordinator, publicationDisplayKindPlugins, decentralizedPublicationDiscoveryProvider\s*\)\.execute\(\);/.test(wiringWindow),
            '4. reconstruction is awaited, and reuses the SAME publicationCatalog/publicationResolutionCoordinator/publicationDisplayKindPlugins this replica already composed above it — never a second catalog, resolver, or coordinator.');

        const provideIndex = mainSource.indexOf("app.provide('decentralizedPublicationDiscoveryProvider', decentralizedPublicationDiscoveryProvider);");
        const mountIndex = mainSource.indexOf("app.mount('#app');");
        assert(wiringIndex < provideIndex && provideIndex < mountIndex,
            '5. reconstruction runs before app.provide() hands the provider out, and well before the app mounts — the World never renders from an unreconstructed provider.');

        console.log('✓ Section G: ui/main.js wires reconstruction at exactly the seam 0.9.607 identified — right after the sole DecentralizedPublicationDiscoveryProvider instance is constructed, reusing the app\'s existing catalog/coordinator/kindPlugins, awaited before app.provide() and app.mount().');
    }

    console.log('\nAll Reconstruct Publication Discovery Use Case tests passed.');
}

function throws(fn) {
    try { fn(); return false; } catch { return true; }
}

run().catch((error) => {
    console.error('✗ ReconstructPublicationDiscoveryUseCase tests failed:', error.message);
    console.error(error);
    process.exitCode = 1;
});
