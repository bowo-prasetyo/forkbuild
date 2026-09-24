import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionCoordinator } from '../application/PublicationResolutionCoordinator.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { resolvePublicationView } from '../application/PublicationResolutionView.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/CreatePublicationDisplayKindRegistryUseCase.js';
import { PUBLICATION_CONTENT_KIND } from '../application/PublicationContentValidator.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { publicationsPageFiles } from './support/SourceFileGroups.js';

// 0.9.607 — Publication Discovery Persistence Boundary Audit.
//
// TYPE: test-only architectural audit. PRODUCTION CHANGES: none (enforced
// by Section L's own git-diff guard). Adds exactly this one file.
//
// 0.9.606's own Section F found and live-proved ARCHITECTURAL_GAP_CONFIRMED:
// a real session boundary (a process restart) survives for a placed
// Publication's PlacementRecord (LocalPlacementRegistry is storage-backed)
// but not for the Publication itself, because
// discovery/DecentralizedPublicationDiscoveryProvider.js is a single,
// never-persisted, in-memory accumulator, and WorldPlacement carries no
// documentId of its own — so nothing durable maps a placement's
// publicationId back to a resolvable Publication once that accumulator is
// gone. That audit deliberately reproduced the failure with a Publication
// "seeded" directly into the ephemeral provider (seedRepositoryAdmitted
// Publication()) — a stand-in for "however it got there," explicitly out
// of scope for that milestone. This audit asks the sharper, narrower
// question 0.9.606 explicitly deferred: for a Publication that reaches
// that provider through the REAL production admission pipeline
// (ui/views/DecentralizedPublicationsView.js's own admitToRepositoryDiscovery()),
// does anything durable already exist from which a fresh provider could
// reconstruct it — or is a brand-new persistence layer required before
// reconstruction can even be attempted?
//
// CENTRAL QUESTION, verbatim from the requesting brief: what existing
// durable source can reconstruct Repository-admitted Publications into a
// fresh DecentralizedPublicationDiscoveryProvider, while preserving
// Publication identity, verification boundaries, and the separation
// between discovery and placement?
//
//   Section A — Reproduce 0.9.606's own session-boundary failure, but one
//               level deeper: through the REAL admission pipeline (a
//               genuine decentralized envelope, cataloged and resolved),
//               never a hand-seeded Publication.
//   Section B — Inventory Publication persistence: trace
//               admitToRepositoryDiscovery() upstream to what is actually
//               durable versus what is merely in-memory.
//   Section C — Inventory every durable store this replica's own storage
//               actually holds after admission + placement — confirming
//               no second Publication store already exists, and none is
//               needed.
//   Section D — Admission (LocalPublicationCatalog) is durable; the
//               discovery INDEX (DecentralizedPublicationDiscoveryProvider)
//               is what needs rebuilding — and rebuilding it requires no
//               new class, only re-running the exact resolution pipeline
//               the app already runs for every catalog entry.
//   Section E — Reconstruction capability: identity survives a fresh
//               provider with no access to the original instance.
//   Section F — Integrity after reconstruction: five negative cases,
//               proving reconstruction never bypasses verification.
//   Section G — Publication identity vs. placement identity stay
//               independently durable facts, joined only by publicationId
//               equality performed by the CALLER, never derived from one
//               another.
//   Section H — Multi-Publication reconstruction: eight Publications
//               (placed / unplaced / corrupted / documentId-sharing /
//               contentHash-sharing), none collapsed, none resurrected.
//   Section I — Lifecycle semantics: placement removal never removes
//               Publication discoverability; catalog withdrawal never
//               touches a sibling's placement.
//   Section J — Provider reconstruction boundary: where the seam belongs,
//               decided from existing ownership semantics, not class names.
//   Section K — No automatic network rediscovery: reconstruction is
//               local-only by construction.
//   Section L — Classification and production guard.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Flips one hex character, keeping the string structurally valid hex —
// the same technique tests/RepositoryAdmissionVerificationBoundaryClosureAudit.test.js
// already established, reused verbatim rather than reinvented.
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

// Builds a signed publisher/Publication.js instance — the WRAPPED
// content a decentralized envelope carries — mirroring
// tests/RepositoryAdmissionVerificationBoundaryClosureAudit.test.js's own
// makeSiblingPublication() so this audit exercises the identical,
// already-proven-correct construction, not a bespoke fixture shape.
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

// Publishes a Publication through the REAL application/PublicationResolver.js
// pipeline (envelope signed + content bytes stored) and catalogs the
// resulting envelope into the REAL application/LocalPublicationCatalog.js —
// exactly the two durable writes that happen, in this order, before
// ui/views/DecentralizedPublicationsView.js's own resolveEntry() /
// admitToRepositoryDiscovery() ever runs. Returns the original Publication
// (session-1 identity reference) and the envelope actually cataloged.
async function publishAndCatalog(resolver, catalog, fixture, identityProvider) {
    const publication = makePublication(fixture, identityProvider);
    const envelope = await resolver.publish({
        content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider
    });
    catalog.add(envelope);
    return { publication, envelope };
}

// THE SEAM THIS AUDIT IDENTIFIES: a fresh discovery index rebuilt purely
// from durable storage, using ONLY existing, unmodified production
// classes — application/LocalPublicationCatalog.js (durable envelopes),
// content/LocalContentStore.js (durable bytes), application/
// PublicationResolver.js + application/PublicationResolutionCoordinator.js
// (the same ten-step verification pipeline every existing admission call
// site already runs), and application/PublicationResolutionView.js's own
// resolvePublicationView() — the exact function
// ui/views/DecentralizedPublicationsView.js#resolveEntry() already calls.
// `peerContentExchange` is deliberately never constructed here (see
// Section K): reconstruction never asks a peer for anything, exactly the
// restraint application/PublicationResolutionCoordinator.js's own header
// already documents as this class's central restraint applied to peer
// retrieval generally.
async function reconstructDiscoveryProvider(storage, kindPlugins) {
    const catalog = new LocalPublicationCatalog(storage);
    const contentStore = new LocalContentStore(storage);
    const verifier = new LocalAuthorizationVerifier();
    const resolver = new PublicationResolver(contentStore, verifier);
    const coordinator = new PublicationResolutionCoordinator(resolver, null);
    const provider = new DecentralizedPublicationDiscoveryProvider();

    const views = [];
    for (const entry of catalog.list()) {
        const view = await resolvePublicationView(entry, { coordinator, kindPlugins });
        views.push(view);
        if (view.resolved && view.content instanceof Publication) {
            provider.add(view.content);
        }
    }
    return { provider, catalog, contentStore, views };
}

async function run() {
    console.log('Running Publication Discovery Persistence Boundary Audit...\n');

    const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();

    // ===============================================================
    // Section A — Reproduce 0.9.606's own session-boundary failure, one
    // level deeper: through the REAL admission pipeline.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const alice = makeIdentity('Alice-607-A', storage);

        // SESSION 1: catalog + resolve + admit (the real pipeline, never
        // a hand-seeded Publication), then explicitly place it.
        const catalog1 = new LocalPublicationCatalog(storage);
        const resolver1 = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
        const coordinator1 = new PublicationResolutionCoordinator(resolver1, null);
        const provider1 = new DecentralizedPublicationDiscoveryProvider();

        const { publication } = await publishAndCatalog(resolver1, catalog1, { id: 'a-pub', documentId: 'a-doc', title: 'Session Boundary Subject' }, alice);
        const view1 = await resolvePublicationView(
            catalog1.list().find((e) => e.contentReference.hash), { coordinator: coordinator1, kindPlugins }
        );
        assert(view1.resolved === true, `1. setup sanity: the real admission pipeline resolves this Publication (${view1.reason}).`);
        provider1.add(view1.content);

        const spatialIndexProvider1 = new LocalSpatialIndexProvider(storage);
        const placementRegistry1 = new LocalPlacementRegistry(storage, spatialIndexProvider1);
        const placeUseCase1 = new PlacePublicationUseCase(
            spatialIndexProvider1, provider1, { execute() { throw new Error('no document'); } }, null, placementRegistry1, alice
        );
        placeUseCase1.execute(publication.id, { x: 10, y: 0, z: 10 });
        assert(placementRegistry1.findByPublicationId(publication.id).length === 1,
            '2. setup sanity: Session 1 genuinely places the Publication — a real PlacementRecord exists.');

        // SESSION 2 — the SAME durable storage, a FRESH, empty discovery
        // provider — exactly what a real ui/main.js reload produces
        // (0.9.606's own Section F9, reconfirmed unchanged by this
        // audit, not re-derived here).
        const provider2 = new DecentralizedPublicationDiscoveryProvider();
        const placementRegistry2 = new LocalPlacementRegistry(storage, new LocalSpatialIndexProvider(storage));

        assert(placementRegistry2.findByPublicationId(publication.id).length === 1,
            '3. PlacementRecord survives the session boundary — LocalPlacementRegistry is storage-backed, reconfirming 0.9.606\'s own Section F2.');
        assert(provider2.findById(publication.id) === null,
            '4. *** THE REPRODUCED GAP *** the fresh provider has never heard of this Publication — findById() returns null even though a durable PlacementRecord for its exact publicationId exists. This is 0.9.606\'s own Section F finding, reproduced through the REAL admission pipeline rather than a hand-seeded stand-in.');

        // THE CENTRAL QUESTION this audit exists to answer: is there
        // durable material FROM WHICH provider2 could still be rebuilt?
        const catalog2 = new LocalPublicationCatalog(storage);
        assert(catalog2.get(view1.publication.id) !== null,
            '5. YES — application/LocalPublicationCatalog.js, read fresh against the SAME storage, still holds the envelope this Publication was admitted through. The gap is a missing INDEX, not a missing FACT.');

        console.log('✓ Section A: 0.9.606\'s own session-boundary failure reproduces identically through the real admission pipeline (never merely a hand-seeded Publication) — and the durable catalog entry the Publication came from is confirmed to survive the same boundary that erases the discovery index.');
    }

    // ===============================================================
    // Section B — Inventory Publication persistence.
    // ===============================================================
    {
        // B1. Structural proof: discoveryProvider.add() itself persists
        // nothing — it is a plain in-memory array push, unchanged.
        const providerSource = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
        assert(/this\._publications = \[\];/.test(providerSource) && /this\._publications\.push\(publication\);/.test(providerSource),
            '1. DecentralizedPublicationDiscoveryProvider.add() is confirmed, from source, to be a bare in-memory array push — no storageProvider is even injected into this class.');

        // B2. Trace upstream: what admitToRepositoryDiscovery() is
        // actually HANDED already came from somewhere durable.
        const siblingSource = (await Promise.all(publicationsPageFiles().map((file) => readSource(file)))).join('\n');
        assert(/entry\.view = await resolvePublicationView\(entry\.publication, \{ coordinator, kindPlugins \}\);/.test(siblingSource),
            '2. ui/views/DecentralizedPublicationsView.js\'s own resolveEntry() resolves FROM entry.publication — a catalog entry, never a value it invented itself.');
        assert(/const current = catalog\.list\(\);/.test(siblingSource),
            '3. ...and entry.publication itself comes from catalog.list() — application/LocalPublicationCatalog.js, a durable, storageProvider-backed class.');

        // B3. Live proof, not merely structural: destroy every in-memory
        // object from a first "session" and confirm the catalog entry
        // (never the discoveryProvider) is what actually survives.
        const storage = new InMemoryStorageProvider();
        const bob = makeIdentity('Bob-607-B', storage);
        const catalog1 = new LocalPublicationCatalog(storage);
        const resolver1 = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
        const { envelope } = await publishAndCatalog(resolver1, catalog1, { id: 'b-pub', documentId: 'b-doc', title: 'Traced Admission' }, bob);
        // Everything above is now unreachable — a fresh Section constructs
        // its own instances against the same storage, standing in for a
        // new process.
        const catalog2 = new LocalPublicationCatalog(storage);
        const revived = catalog2.get(envelope.id);
        assert(revived !== null && revived.contentReference.hash === envelope.contentReference.hash,
            '4. a freshly constructed LocalPublicationCatalog, with no reference to any object from "session 1," still returns the identical envelope by id — durable, not merely resident in the object that first created it.');

        console.log('✓ Section B: admitToRepositoryDiscovery() persists nothing itself, but what it is handed already traces to application/LocalPublicationCatalog.js — durable, storageProvider-backed, and independently re-readable with no access to any "session 1" object.');
    }

    // ===============================================================
    // Section C — Inventory every durable store.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const carol = makeIdentity('Carol-607-C', storage);
        const catalog = new LocalPublicationCatalog(storage);
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
        const provider = new DecentralizedPublicationDiscoveryProvider();

        const { publication } = await publishAndCatalog(resolver, catalog, { id: 'c-pub', documentId: 'c-doc', title: 'Inventory Subject' }, carol);
        const coordinator = new PublicationResolutionCoordinator(resolver, null);
        const view = await resolvePublicationView(catalog.get('__missing__') || catalog.list()[0], { coordinator, kindPlugins });
        provider.add(view.content);

        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
        new PlacePublicationUseCase(spatialIndexProvider, provider, { execute() { throw new Error('x'); } }, null, placementRegistry, carol)
            .execute(publication.id, { x: 1, y: 0, z: 1 });

        const keys = storage.list();
        const catalogKeys = keys.filter((k) => k === 'publication-catalog:entries');
        const contentKeys = keys.filter((k) => k.startsWith('content:'));
        const placementRecordKeys = keys.filter((k) => k.startsWith('placement-record:'));
        const placementHistoryKeys = keys.filter((k) => k.startsWith('placement-history:'));

        assert(catalogKeys.length === 1, '1. exactly one durable catalog-index key exists: publication-catalog:entries.');
        assert(contentKeys.length >= 1, '2. at least one durable content-addressed bytes key exists: content:<hash>.');
        assert(placementRecordKeys.length === 1 && placementHistoryKeys.length === 1,
            '3. exactly one durable PlacementRecord (and its history) exists for the one placement made.');

        // No OTHER Publication-shaped family of key exists — in
        // particular, no second/parallel Publication store this audit's
        // own reconstruction could have silently relied on without
        // realizing it (satisfying "no second Publication store is
        // proposed merely to close the gap" from the OTHER direction:
        // none already secretly exists either). Identity/spatial-index/
        // session keys are unrelated infrastructure this scenario's own
        // setup incidentally produces (LocalIdentityProvider, the raw
        // SpatialIndexProvider WorldPlacement mirror) — accounted for,
        // never mistaken for a fourth Publication-shaped store.
        const publicationRelatedPrefixes = ['publication-catalog:entries', 'content:', 'placement-record:', 'placement-history:', 'placement-conflict:'];
        const otherInfrastructurePrefixes = ['local-identity-key:', 'local-identities', 'local-session', 'placement:', 'spatial-index'];
        const unaccounted = keys.filter((k) =>
            !publicationRelatedPrefixes.some((p) => k === p || k.startsWith(p))
            && !otherInfrastructurePrefixes.some((p) => k === p || k.startsWith(p)));
        assert(unaccounted.length === 0,
            `4. every durable key this scenario produced is either one of exactly three Publication-related families (catalog, content, placement) or unrelated identity/spatial-index infrastructure — no unexplained FOURTH Publication-shaped store exists (found: ${JSON.stringify(unaccounted)}).`);

        console.log('✓ Section C: after a real admit + place, durable storage holds exactly three independent families of key — a catalog index, content-addressed bytes, and placement records — and nothing else. No hidden second Publication store already exists.');
    }

    // ===============================================================
    // Section D — Admission is durable; the discovery INDEX is what
    // needs rebuilding.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const dave = makeIdentity('Dave-607-D', storage);
        const catalog = new LocalPublicationCatalog(storage);
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
        await publishAndCatalog(resolver, catalog, { id: 'd-pub', documentId: 'd-doc', title: 'Rebuild Subject' }, dave);

        // D1. A fresh provider, over storage that already holds the
        // catalog+content, is still empty — cataloging alone does not
        // populate discovery. This is the exact distinction Section D of
        // the requesting brief asks this audit to keep explicit.
        const freshProvider = new DecentralizedPublicationDiscoveryProvider();
        assert(freshProvider.list().length === 0,
            '1. ADMISSION (durable catalog entry) and DISCOVERY INDEXING (the provider\'s own list()) are confirmed to be two distinct facts — a populated catalog does not, by itself, populate a fresh provider.');

        // D2. Rebuilding requires no new class — only re-running the SAME
        // resolution pipeline every existing caller already runs per
        // catalog entry, applied to every entry at once.
        const { provider } = await reconstructDiscoveryProvider(storage, kindPlugins);
        assert(provider.list().length === 1 && provider.findById('d-pub') !== null,
            '2. reconstructDiscoveryProvider() — built from nothing but application/LocalPublicationCatalog.js, content/LocalContentStore.js, application/PublicationResolver.js, application/PublicationResolutionCoordinator.js, and application/PublicationResolutionView.js#resolvePublicationView() — repopulates the index from durable storage alone.');

        console.log('✓ Section D: durable admission and the ephemeral discovery index are two separable facts. Rebuilding the index needs no new persistence and no new class — only re-running, for every catalog entry, the exact resolution call ui/views/DecentralizedPublicationsView.js#resolveEntry() already makes for one entry at a time.');
    }

    // ===============================================================
    // Section E — Reconstruction capability: identity survives with no
    // access to the original provider instance.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const erin = makeIdentity('Erin-607-E', storage);
        const catalog = new LocalPublicationCatalog(storage);
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
        const { publication: original } = await publishAndCatalog(
            resolver, catalog, { id: 'e-pub', documentId: 'e-doc', title: 'Identity Survives', author: 'erin', contentHash: 'hash-e-specific' }, erin
        );

        // "Session 1" instances go out of scope here — reconstruction
        // below has access to nothing but `storage`.
        const { provider } = await reconstructDiscoveryProvider(storage, kindPlugins);
        const reconstructed = provider.findById('e-pub');

        assert(reconstructed !== null, '1. the Publication reconstructs into a fresh provider with no access to the original instance.');
        assert(reconstructed !== original,
            '2. the reconstructed object is NOT the same instance (a genuine re-resolution through the full pipeline, never a cached reference smuggled through storage).');
        assert(reconstructed.id === original.id
            && reconstructed.documentId === original.documentId
            && reconstructed.contentHash === original.contentHash
            && reconstructed.author === original.author
            && reconstructed.publisherIdentity.id === original.publisherIdentity.id,
            '3. publicationId (id), documentId, contentHash, author, and publisher identity all survive the round trip intact.');
        assert(reconstructed.signature !== null && reconstructed.signature.signature === original.signature.signature,
            '4. the Publication\'s own signature — its provenance — survives unchanged.');

        console.log('✓ Section E: Publication identity (id/documentId/contentHash/author/publisherIdentity/signature) fully survives reconstruction into a brand-new provider instance, without ever touching the original.');
    }

    // ===============================================================
    // Section F — Integrity after reconstruction: reconstruction never
    // bypasses verification.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const frank = makeIdentity('Frank-607-F', storage);
        const catalog = new LocalPublicationCatalog(storage);
        const contentStore = new LocalContentStore(storage);
        const resolver = new PublicationResolver(contentStore, new LocalAuthorizationVerifier());

        // F1. Control: a genuine, untampered publication reconstructs.
        await publishAndCatalog(resolver, catalog, { id: 'f-pub-good', documentId: 'f-doc-good', title: 'Valid' }, frank);

        // F2. Missing material: the catalog entry survives, but its
        // referenced bytes were never (or no longer) present in this
        // replica's own ContentStore — CONTENT_UNAVAILABLE.
        const { envelope: missingEnvelope } = await publishAndCatalog(resolver, catalog, { id: 'f-pub-missing', documentId: 'f-doc-missing', title: 'Missing Bytes' }, frank);
        storage.remove(`content:${missingEnvelope.contentReference.hash}`);

        // F3. Content-hash mismatch (the "malformed material" /
        // "corrupted metadata" case): bytes are present but were altered
        // after storage — the identical technique
        // tests/RepositoryAdmissionVerificationBoundaryClosureAudit.test.js's
        // own Section C3 already established.
        const { envelope: corruptedEnvelope } = await publishAndCatalog(resolver, catalog, { id: 'f-pub-corrupted', documentId: 'f-doc-corrupted', title: 'Corrupted Bytes' }, frank);
        const corruptedKey = `content:${corruptedEnvelope.contentReference.hash}`;
        const originalBytes = storage.load(corruptedKey);
        storage.save(corruptedKey, `${originalBytes.slice(0, -1)}X"`);

        // F4. Malformed/incomplete Publication record: bytes are present,
        // hash matches (untampered), but the wrapped JSON itself is
        // missing a REQUIRED field (documentId) — INVALID_CONTENT at the
        // validate-content step, never reaching signature verification.
        const incompletePublication = makePublication({ id: 'f-pub-incomplete', documentId: 'f-doc-incomplete', title: 'Incomplete' }, frank);
        const incompleteJson = incompletePublication.toJSON();
        delete incompleteJson.documentId;
        const incompleteBytes = JSON.stringify(incompleteJson);
        const incompleteRef = contentStore.put(incompleteBytes);
        let incompleteEnvelope = new DecentralizedPublication({
            contentKind: PUBLICATION_CONTENT_KIND, contentReference: incompleteRef, publisherIdentity: frank.getSigningIdentity().toJSON()
        });
        incompleteEnvelope = incompleteEnvelope.withSignature(frank.signCanonical(incompleteEnvelope.getSigningDescriptor()));
        catalog.add(incompleteEnvelope);

        // F5. Corrupted metadata at the ENVELOPE level: the wrapped
        // content is perfectly valid, but the stored catalog entry's own
        // envelope signature was tampered with (simulating corrupted
        // catalog storage, or a malicious/corrupted entry — see this
        // file's own header on why the catalog write path is not what
        // this section exercises: this proves the READ/reconstruction
        // side never trusts persisted metadata blindly, regardless of
        // how a bad entry could arrive).
        const { envelope: tamperedEnvelopeSource } = await publishAndCatalog(resolver, catalog, { id: 'f-pub-tampered-envelope', documentId: 'f-doc-tampered-envelope', title: 'Tampered Envelope' }, frank);
        const allEntries = storage.load('publication-catalog:entries');
        const tamperedEntryIndex = allEntries.findIndex((e) => e.publication.id === tamperedEnvelopeSource.id);
        allEntries[tamperedEntryIndex].publication.signature.signature = tamperHex(allEntries[tamperedEntryIndex].publication.signature.signature);
        storage.save('publication-catalog:entries', allEntries);

        // Reconstruct once, over all five cataloged entries at once.
        const { provider, views } = await reconstructDiscoveryProvider(storage, kindPlugins);

        assert(provider.findById('f-pub-good') !== null, '1. the valid, untampered Publication IS reconstructed.');
        assert(provider.findById('f-pub-missing') === null, '2. missing material is NOT reconstructed.');
        assert(provider.findById('f-pub-corrupted') === null, '3. corrupted/malformed material (content-hash mismatch) is NOT reconstructed.');
        assert(provider.findById('f-pub-incomplete') === null, '4. an incomplete Publication record (missing a required field) is NOT reconstructed.');
        assert(provider.findById('f-pub-tampered-envelope') === null, '5. a Publication behind a tampered/corrupted envelope signature is NOT reconstructed.');
        assert(provider.list().length === 1, '6. across all five catalog entries, exactly the one genuinely valid Publication was admitted into the reconstructed provider.');

        const missingView = views.find((v) => v.publication && v.publication.contentReference && v.publication.contentReference.hash === missingEnvelope.contentReference.hash);
        assert(missingView && missingView.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE, '7. the missing-material case reports CONTENT_UNAVAILABLE, not a silent pass.');
        const tamperedView = views.find((v) => v.publication && v.publication.id === tamperedEnvelopeSource.id);
        assert(tamperedView && tamperedView.outcome === PublicationResolutionOutcome.INVALID_PUBLICATION_SIGNATURE, '8. the tampered-envelope case reports INVALID_PUBLICATION_SIGNATURE, not a silent pass.');

        console.log('✓ Section F: reconstruction runs the FULL, unmodified application/PublicationResolver.js ten-step discipline for every catalog entry — missing material, corrupted/malformed bytes, an incomplete record, and a tampered envelope signature are each independently refused, with a specific reason, never silently trusted because the entry happened to be persisted.');
    }

    // ===============================================================
    // Section G — Publication identity vs. placement identity stay
    // independent, joined only by publicationId equality performed by
    // the caller.
    // ===============================================================
    {
        // G1. Structural proof: the reconstruction routine this audit
        // identifies never imports or references placement/ at all —
        // it cannot "guess" a Publication from a placement, because it
        // never reads one.
        const thisFileSource = await readSource('tests/PublicationDiscoveryPersistenceBoundaryAudit.test.js');
        const reconstructBody = thisFileSource.slice(
            thisFileSource.indexOf('async function reconstructDiscoveryProvider'),
            thisFileSource.indexOf('async function run()')
        );
        assert(!/PlacementRecord|placementRegistry|PlacementRegistry/.test(reconstructBody),
            '1. reconstructDiscoveryProvider() references no placement class of any kind — the join is never performed inside reconstruction itself.');

        // G2. Both real admission gates likewise never reference
        // placement (reconfirms tests/RepositoryAdmissionVerificationBoundaryClosureAudit.test.js's
        // own Section H3, cited rather than re-derived).
        const siblingSource = (await Promise.all(publicationsPageFiles().map((file) => readSource(file)))).join('\n');
        const siblingGateStart = siblingSource.indexOf('function admitToRepositoryDiscovery(view) {');
        const siblingGateBody = siblingSource.slice(siblingGateStart, siblingSource.indexOf('\n        }', siblingGateStart));
        assert(!/PlacementRecord|placementRegistry|PlacePublicationUseCase/.test(siblingGateBody),
            '2. ui/views/DecentralizedPublicationsView.js\'s own admitToRepositoryDiscovery() likewise never references placement.');

        // G3. Live proof the join is genuinely external: reconstruct the
        // Publication side and the placement side from completely
        // separate calls, then join them purely by publicationId
        // equality — never by iterating placements to invent Publications.
        const storage = new InMemoryStorageProvider();
        const grace = makeIdentity('Grace-607-G', storage);
        const catalog = new LocalPublicationCatalog(storage);
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
        const { publication } = await publishAndCatalog(resolver, catalog, { id: 'g-pub', documentId: 'g-doc', title: 'Joined By Id' }, grace);

        const { provider } = await reconstructDiscoveryProvider(storage, kindPlugins);
        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
        new PlacePublicationUseCase(spatialIndexProvider, provider, { execute() { throw new Error('x'); } }, null, placementRegistry, grace)
            .execute(publication.id, { x: 7, y: 0, z: 7 });

        // A THIRD, independent reconstruction of BOTH sides — proving the
        // join is re-derivable from durable state alone, and is nothing
        // more than an id comparison.
        const { provider: provider3 } = await reconstructDiscoveryProvider(storage, kindPlugins);
        const placementRegistry3 = new LocalPlacementRegistry(storage, new LocalSpatialIndexProvider(storage));
        const record = placementRegistry3.findByPublicationId('g-pub')[0];
        const joined = provider3.findById(record.publicationId);
        assert(record !== undefined && joined !== null && joined.id === record.publicationId,
            '3. the join is exactly `placementRecord.publicationId === reconstructedPublication.id` — performed by this test, never by either production class reading the other\'s store.');

        console.log('✓ Section G: Publication discovery and World placement remain two independently durable, independently reconstructable facts, joined only by publicationId equality performed by the caller — reconstruction never derives a Publication from a placement, and never reads placement state at all.');
    }

    // ===============================================================
    // Section H — Multi-Publication reconstruction.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const heidi = makeIdentity('Heidi-607-H', storage);
        const catalog = new LocalPublicationCatalog(storage);
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());

        const { publication: p1 } = await publishAndCatalog(resolver, catalog, { id: 'h-p1', documentId: 'h-p1-doc', title: 'Placed One' }, heidi);
        const { publication: p2 } = await publishAndCatalog(resolver, catalog, { id: 'h-p2', documentId: 'h-p2-doc', title: 'Placed Two' }, heidi);
        const { publication: p3 } = await publishAndCatalog(resolver, catalog, { id: 'h-p3', documentId: 'h-p3-doc', title: 'Admitted, Unplaced' }, heidi);
        const { envelope: p4Envelope } = await publishAndCatalog(resolver, catalog, { id: 'h-p4', documentId: 'h-p4-doc', title: 'Rejected' }, heidi);
        // P4: corrupt its bytes after cataloging — the realistic
        // "arrived via peer exchange (envelope verified), but content
        // integrity fails" case application/PublicationPeerExchange.js's
        // own "validate -> construct -> verify -> catalog" discipline
        // does NOT already rule out, since it verifies only the
        // ENVELOPE's signature, never the wrapped content's own hash.
        const p4Key = `content:${p4Envelope.contentReference.hash}`;
        storage.save(p4Key, `${storage.load(p4Key).slice(0, -1)}X"`);

        // P5/P6 — independently signed, DIFFERENT ids, SAME documentId
        // (a fork or re-publish scenario) — neither should collapse into
        // the other.
        const { publication: p5 } = await publishAndCatalog(resolver, catalog, { id: 'h-p5', documentId: 'h-shared-doc', title: 'Shares documentId (A)' }, heidi);
        const { publication: p6 } = await publishAndCatalog(resolver, catalog, { id: 'h-p6', documentId: 'h-shared-doc', title: 'Shares documentId (B)' }, heidi);

        // P7/P8 — independently signed, DIFFERENT ids, SAME contentHash
        // field (two publications describing identical underlying
        // document bytes) — neither should collapse into the other.
        const { publication: p7 } = await publishAndCatalog(resolver, catalog, { id: 'h-p7', documentId: 'h-p7-doc', title: 'Shares contentHash (A)', contentHash: 'shared-content-hash' }, heidi);
        const { publication: p8 } = await publishAndCatalog(resolver, catalog, { id: 'h-p8', documentId: 'h-p8-doc', title: 'Shares contentHash (B)', contentHash: 'shared-content-hash' }, heidi);

        // Place P1/P2 only; P3/P5/P6/P7/P8 stay admitted-but-unplaced.
        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
        const bootstrapProvider = new DecentralizedPublicationDiscoveryProvider();
        [p1, p2].forEach((p) => bootstrapProvider.add(p));
        const placeUseCase = new PlacePublicationUseCase(spatialIndexProvider, bootstrapProvider, { execute() { throw new Error('x'); } }, null, placementRegistry, heidi);
        placeUseCase.execute(p1.id, { x: 1, y: 0, z: 1 });
        placeUseCase.execute(p2.id, { x: 2, y: 0, z: 2 });

        // Destroy every session-1 object; reconstruct fresh, in one call,
        // exercising every entry at once — order-independence matters
        // here (LocalPublicationCatalog.list() orders by receivedAt,
        // most-recent-first, per that class's own header).
        const { provider } = await reconstructDiscoveryProvider(storage, kindPlugins);

        assert(provider.list().length === 7,
            `1. exactly 7 of the 8 cataloged Publications reconstruct (found ${provider.list().length}) — P4 (corrupted) is the sole exclusion.`);
        for (const id of ['h-p1', 'h-p2', 'h-p3', 'h-p5', 'h-p6', 'h-p7', 'h-p8']) {
            assert(provider.findById(id) !== null, `2. Publication ${id} reconstructs.`);
        }
        assert(provider.findById('h-p4') === null, '3. P4 (corrupted after cataloging) does NOT reconstruct — never resurrected.');

        // Placement independence: reconstruction alone never tells you
        // which of the 7 are placed — that is a separate, joined fact.
        const placementRegistry2 = new LocalPlacementRegistry(storage, new LocalSpatialIndexProvider(storage));
        assert(placementRegistry2.findByPublicationId('h-p1').length === 1 && placementRegistry2.findByPublicationId('h-p2').length === 1,
            '4. P1/P2 remain placed after reconstruction (their PlacementRecords, independently durable, are untouched by any of this).');
        for (const id of ['h-p3', 'h-p5', 'h-p6', 'h-p7', 'h-p8']) {
            assert(placementRegistry2.findByPublicationId(id).length === 0, `5. ${id} correctly reconstructs as admitted-but-UNPLACED.`);
        }

        // No collapsing by documentId.
        assert(provider.findById('h-p5').id !== provider.findById('h-p6').id
            && provider.findById('h-p5').documentId === provider.findById('h-p6').documentId,
            '6. P5 and P6 share a documentId but reconstruct as two DISTINCT, independently findable Publications — never collapsed into one.');

        // No collapsing by contentHash.
        assert(provider.findById('h-p7').id !== provider.findById('h-p8').id
            && provider.findById('h-p7').contentHash === provider.findById('h-p8').contentHash,
            '7. P7 and P8 share a contentHash but likewise reconstruct as two DISTINCT Publications.');

        // Order-independence: rebuild a second time and confirm the same
        // 7 ids reconstruct, regardless of internal catalog ordering.
        const { provider: providerAgain } = await reconstructDiscoveryProvider(storage, kindPlugins);
        assert(providerAgain.list().length === 7 && providerAgain.list().every((p) => provider.findById(p.id) !== null),
            '8. reconstruction is deterministic and order-independent — a second, independent rebuild produces the identical 7-Publication set.');

        console.log('✓ Section H: eight cataloged Publications reconstruct to exactly the seven genuinely valid ones — placed, unplaced, documentId-sharing, and contentHash-sharing entries are all correctly isolated, never collapsed, and the one corrupted entry is never resurrected. Placement is confirmed to remain a wholly separate, independently joined fact.');
    }

    // ===============================================================
    // Section I — Lifecycle semantics.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const ivan = makeIdentity('Ivan-607-I', storage);
        const catalog = new LocalPublicationCatalog(storage);
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());

        const { publication: placed } = await publishAndCatalog(resolver, catalog, { id: 'i-placed', documentId: 'i-placed-doc', title: 'Placed Then Unplaced' }, ivan);
        const { envelope: withdrawnEnvelope } = await publishAndCatalog(resolver, catalog, { id: 'i-withdrawn', documentId: 'i-withdrawn-doc', title: 'Withdrawn From Catalog' }, ivan);

        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
        const bootstrapProvider = new DecentralizedPublicationDiscoveryProvider();
        bootstrapProvider.add(placed);
        new PlacePublicationUseCase(spatialIndexProvider, bootstrapProvider, { execute() { throw new Error('x'); } }, null, placementRegistry, ivan)
            .execute(placed.id, { x: 3, y: 0, z: 3 });

        // I1. Admitted + placed, across a session restart: still
        // discoverable AND still placed.
        {
            const { provider } = await reconstructDiscoveryProvider(storage, kindPlugins);
            const registryAfterRestart = new LocalPlacementRegistry(storage, new LocalSpatialIndexProvider(storage));
            assert(provider.findById('i-placed') !== null && registryAfterRestart.findByPublicationId('i-placed').length === 1,
                '1. after a session restart, the placed Publication is both still discoverable and still placed.');
        }

        // I2. Placement removed, then a session restart: the Publication
        // REMAINS discoverable — removing a placement never removes the
        // Publication from persistent discovery.
        {
            const registryBefore = new LocalPlacementRegistry(storage, new LocalSpatialIndexProvider(storage));
            const placementId = registryBefore.findByPublicationId('i-placed')[0].placementId;
            registryBefore.remove(placementId);

            const { provider } = await reconstructDiscoveryProvider(storage, kindPlugins);
            const registryAfter = new LocalPlacementRegistry(storage, new LocalSpatialIndexProvider(storage));
            assert(provider.findById('i-placed') !== null,
                '2. after the placement is removed AND a session restart follows, the Publication is STILL discoverable — removing a placement never removes the underlying Publication from discovery.');
            assert(registryAfter.findByPublicationId('i-placed').length === 0,
                '3. ...and it is correctly reported as UNPLACED — the placement itself really is gone, precisely and only that fact.');
        }

        // I3. Catalog withdrawal of one Publication never touches a
        // SIBLING's placement — an encounter/catalog entry disappearing
        // never deletes a different, previously admitted Publication.
        {
            const { publication: sibling } = await publishAndCatalog(resolver, catalog, { id: 'i-sibling', documentId: 'i-sibling-doc', title: 'Untouched Sibling' }, ivan);
            const spatialIndexProvider2 = new LocalSpatialIndexProvider(storage);
            const placementRegistry2 = new LocalPlacementRegistry(storage, spatialIndexProvider2);
            const bootstrap2 = new DecentralizedPublicationDiscoveryProvider();
            bootstrap2.add(sibling);
            new PlacePublicationUseCase(spatialIndexProvider2, bootstrap2, { execute() { throw new Error('x'); } }, null, placementRegistry2, ivan)
                .execute(sibling.id, { x: 9, y: 0, z: 9 });

            catalog.remove(withdrawnEnvelope.id);

            const { provider } = await reconstructDiscoveryProvider(storage, kindPlugins);
            assert(provider.findById('i-withdrawn') === null,
                '4. the withdrawn Publication no longer reconstructs — withdrawal is respected, never resurrected.');
            assert(provider.findById('i-sibling') !== null,
                '5. its unrelated sibling — cataloged independently, never withdrawn — still reconstructs normally.');
            const placementRegistryAfter = new LocalPlacementRegistry(storage, new LocalSpatialIndexProvider(storage));
            assert(placementRegistryAfter.findByPublicationId('i-sibling').length === 1
                && placementRegistryAfter.findByPublicationId('i-sibling')[0].position.x === 9,
                '6. the sibling\'s own PlacementRecord is completely untouched, at its own exact position — one Publication\'s catalog withdrawal never cascades into another Publication\'s placement.');
        }

        console.log('✓ Section I: Publication discoverability and placement lifecycle are confirmed independent in both directions — removing a placement never removes Publication discovery, and withdrawing one Publication\'s catalog entry never touches a sibling\'s placement.');
    }

    // ===============================================================
    // Section J — Provider reconstruction boundary: where the seam
    // belongs, decided from existing ownership semantics.
    // ===============================================================
    {
        const mainSource = await readSource('ui/main.js');

        // J1. Exactly one ephemeral instance exists today, provided
        // app-wide — reconfirmed unchanged from 0.9.606's own Section F9.
        assert(/const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider\(\);/.test(mainSource),
            '1. ui/main.js still constructs exactly one, never-persisted, module-scope DecentralizedPublicationDiscoveryProvider — the SAME instance identified as the gap\'s own location.');
        assert(mainSource.includes("app.provide('decentralizedPublicationDiscoveryProvider', decentralizedPublicationDiscoveryProvider);"),
            '2. ...provided app-wide, exactly once, under exactly one name.');

        // J2. 0.9.608 — Reconstruct Publication Discovery at Application
        // Composition — wired exactly the seam this Section named, at
        // exactly this construction site: reconfirm the reconstruction
        // call now exists here, reusing `publicationCatalog` (never a
        // second LocalPublicationCatalog instance), rather than
        // re-deriving whether it does from scratch.
        const constructionIndex = mainSource.indexOf('const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();');
        const nearbyWindow = mainSource.slice(constructionIndex, constructionIndex + 2000);
        assert(/new ReconstructPublicationDiscoveryUseCase\(\s*publicationCatalog, publicationResolutionCoordinator, publicationDisplayKindPlugins, decentralizedPublicationDiscoveryProvider\s*\)\.execute\(\);/.test(nearbyWindow),
            '3. a reconstruction call now exists immediately at this construction site — application/ReconstructPublicationDiscoveryUseCase.js, wired by 0.9.608, populating this SAME provider instance from the SAME publicationCatalog/publicationResolutionCoordinator/publicationDisplayKindPlugins this file already composed. The seam this Section identified is no longer merely identified — it is wired.');

        // J3. The ownership-semantics argument for WHERE reconstruction
        // belongs: 0.9.337's own "one instance, threaded everywhere"
        // discipline (cited, not re-derived) means the natural seam
        // POPULATES that same existing instance at the composition root,
        // before app.provide() hands it out — never a second class
        // wrapping it, and never inside DecentralizedPublicationDiscoveryProvider
        // itself (which 0.9.335's own header already commits to knowing
        // nothing about resolution, catalogs, or storage — see this
        // audit's own header, discovery/DecentralizedPublicationDiscoveryProvider.js
        // "performs no decentralized discovery of its own").
        const providerSource = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
        assert(/performs\s*\n\/\/ no decentralized discovery of its own/.test(providerSource),
            '4. discovery/DecentralizedPublicationDiscoveryProvider.js\'s own header still commits it to knowing nothing about resolution or storage — confirming reconstruction must live at the composition root (or a use case it calls), never inside this class.');

        console.log('✓ Section J: the reconstruction seam belongs at ui/main.js\'s own composition root, populating the SAME single provider instance already constructed there, before app.provide() — reusing reconstructDiscoveryProvider()\'s own shape (Section D) verbatim. No new class, no change to DecentralizedPublicationDiscoveryProvider itself, no wrapper. 0.9.608 wired exactly this — see tests/ReconstructPublicationDiscoveryUseCase.test.js for the production-class regression suite.');
    }

    // ===============================================================
    // Section K — No automatic network rediscovery.
    // ===============================================================
    {
        // K1. Structural: the reconstruction routine never constructs a
        // peerContentExchange, and never passes peer/peers to resolve().
        const thisFileSource = await readSource('tests/PublicationDiscoveryPersistenceBoundaryAudit.test.js');
        const reconstructBody = thisFileSource.slice(
            thisFileSource.indexOf('async function reconstructDiscoveryProvider'),
            thisFileSource.indexOf('async function run()')
        );
        assert(/new PublicationResolutionCoordinator\(resolver, null\)/.test(reconstructBody),
            '1. reconstruction constructs its PublicationResolutionCoordinator with peerContentExchange explicitly null.');
        assert(!/peer:|peers:/.test(reconstructBody),
            '2. resolvePublicationView() is called with no `peer`/`peers` option anywhere in reconstruction — per application/PublicationResolutionCoordinator.js\'s own header, omitting both means peer retrieval never runs at all, for any candidate.');

        // K2. Live proof: a catalog entry whose bytes live ONLY on a
        // backend this replica's own local ContentStore never received
        // (simulating an IPFS/Arweave-only publication with no local
        // mirror) reconstructs to CONTENT_UNAVAILABLE — never triggers
        // any network call, never blocks, never throws.
        const storage = new InMemoryStorageProvider();
        const kate = makeIdentity('Kate-607-K', storage);
        const catalog = new LocalPublicationCatalog(storage);
        let neverCalled = new ContentReference({ hash: 'never-locally-mirrored-hash', algorithm: 'fnv1a-32', mediaType: 'application/json', size: 1 });
        let networkOnlyEnvelope = new DecentralizedPublication({
            contentKind: PUBLICATION_CONTENT_KIND, contentReference: neverCalled, publisherIdentity: kate.getSigningIdentity().toJSON()
        });
        networkOnlyEnvelope = networkOnlyEnvelope.withSignature(kate.signCanonical(networkOnlyEnvelope.getSigningDescriptor()));
        catalog.add(networkOnlyEnvelope);

        const { provider, views } = await reconstructDiscoveryProvider(storage, kindPlugins);
        assert(provider.list().length === 0, '3. the network-only entry does not reconstruct...');
        assert(views[0].outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE,
            '4. ...and reports CONTENT_UNAVAILABLE specifically — never an attempted, hung, or silently-skipped network fetch. Reconstruction is LOCAL DURABLE RECONSTRUCTION only, structurally incapable of NETWORK REDISCOVERY, exactly the distinction this milestone\'s own brief draws.');

        console.log('✓ Section K: reconstruction is local-only by construction — no peerContentExchange, no peer/peers argument anywhere in the routine, and a publication with no locally-mirrored bytes correctly reports CONTENT_UNAVAILABLE rather than attempting to fetch anything over the network.');
    }

    // ===============================================================
    // Section L — Classification and production guard.
    // ===============================================================
    {
        const CLASSIFICATIONS = Object.freeze([
            'ALREADY_PERSISTED_RECONSTRUCTION_GAP', 'PUBLICATION_PERSISTENCE_GAP',
            'PLACEMENT_PUBLICATION_JOIN_GAP', 'VERIFICATION_BOUNDARY_GAP', 'NETWORK_REDISCOVERY_BOUNDARY'
        ]);

        // L1. The one path that produced 0.9.606's own regression — a
        // decentralized-envelope Publication admitted via
        // ui/views/DecentralizedPublicationsView.js's own
        // admitToRepositoryDiscovery() — is ALREADY_PERSISTED_RECONSTRUCTION_GAP,
        // per Sections A-K above: every field of durable evidence needed
        // to rebuild it already exists (LocalPublicationCatalog +
        // LocalContentStore), reconstruction preserves identity (E),
        // never bypasses verification (F), never conflates discovery
        // with placement (G), correctly isolates multiple Publications
        // (H), respects lifecycle independence (I), and never reaches
        // the network (K).
        const primaryClassification = 'ALREADY_PERSISTED_RECONSTRUCTION_GAP';
        assert(CLASSIFICATIONS.includes(primaryClassification), '1. classification uses the narrow, named vocabulary.');

        // L2. Two adjacent paths this audit's own inventory (Section B)
        // surfaced, explicitly out of scope for the recommendation above
        // — recorded, not silently folded into the same verdict.
        const localSource = await readSource('discovery/LocalDiscoveryProvider.js');
        assert(/return this\._storageProvider\.load\(PUBLICATIONS_KEY\) \|\| \[\];/.test(localSource),
            '2. a LOCALLY-published Publication (ui/components/WorldEncounterCanvas.js\'s own "local"-origin World Encounter admission, via application/LocalWorldEncounterMaterialSource.js) resolves through discovery/LocalDiscoveryProvider.js, which re-reads durable storage FRESH on every construction — never affected by 0.9.606\'s own gap in the first place; NOT a reconstruction problem, because no ephemeral index sits in front of it to begin with.');

        const peerSource = await readSource('application/PeerWorldEncounterMaterialSource.js');
        assert(/never persists what it retrieves|A RESOLVED SELECTION NAMES A PEER/.test(peerSource) || peerSource.includes('this class only ever'),
            '3. a PEER-origin World Encounter admission is backed by no durable catalog or content store at all, by an existing, deliberate, already-documented "peer material sources never persist what they retrieve" family rule (0.9.329/0.9.473 lineage) — this is NETWORK_REDISCOVERY_BOUNDARY territory for that one specific sub-path: recovering it after a restart would require re-asking the peer, a genuinely different capability this audit does not recommend building, consistent with "no network fan-out or automatic rediscovery" in the Deliberately Excluded list.');

        // L3. Production guard — audit only, no production file touched.
        let changedFiles = [];
        try {
            changedFiles = execSync(
                'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html"',
                { cwd: SOURCE_ROOT.pathname }
            ).toString().trim().split('\n').filter(Boolean);
        } catch {
            changedFiles = ['<git unavailable>'];
        }
        assert(changedFiles.length === 0,
            `4. this audit touches NO production file (found: ${JSON.stringify(changedFiles)}) — it only reads existing source and constructs real, unmodified production classes to prove reconstruction is possible without changing anything.`);
    }
    console.log('✓ Section L: ALREADY_PERSISTED_RECONSTRUCTION_GAP for the decentralized-envelope admission path that produced 0.9.606\'s own finding — every fact needed to reconstruct already survives, durably, in application/LocalPublicationCatalog.js and content/LocalContentStore.js. The locally-published admission path was never affected (discovery/LocalDiscoveryProvider.js already re-reads storage fresh). The peer-origin World Encounter admission path is a separate, deliberate, pre-existing NETWORK_REDISCOVERY_BOUNDARY, explicitly not recommended for this milestone. No production file was touched.');

    console.log('\nAll Publication Discovery Persistence Boundary Audit tests passed.');
    console.log('\n=== 0.9.607 VERDICT ===');
    console.log('ALREADY_PERSISTED_RECONSTRUCTION_GAP. A Repository-admitted Publication\'s durable identity already survives');
    console.log('every session boundary, unconditionally, in application/LocalPublicationCatalog.js (the signed envelope) and');
    console.log('content/LocalContentStore.js (the wrapped bytes) — the exact same durable storage PlacementRecord already uses.');
    console.log('The gap 0.9.606 found is a missing INDEX, not a missing FACT: discovery/DecentralizedPublicationDiscoveryProvider.js');
    console.log('is never repopulated from that durable source when a fresh instance is constructed. Reconstruction is possible');
    console.log('today with NO new class, NO new persistence, and NO network call — only re-running, for every catalog entry at');
    console.log('once, the exact resolvePublicationView() call ui/views/DecentralizedPublicationsView.js#resolveEntry() already');
    console.log('runs one entry at a time — proven live in Sections D-K, including full verification (F), multi-Publication');
    console.log('isolation (H), and lifecycle independence from placement (G, I). Recommended next milestone: wire exactly that');
    console.log('routine into ui/main.js\'s own composition root (Section J), populating the SAME single provider instance already');
    console.log('constructed there, before app.provide() hands it out — never a new store, never a placement-derived guess, never');
    console.log('automatic network rediscovery. The locally-published admission path needs no such fix (never affected); the');
    console.log('peer-origin World Encounter admission path is a separate, deliberate NETWORK_REDISCOVERY_BOUNDARY this milestone');
    console.log('does not recommend closing.');
}

run().catch((error) => {
    console.error('✗ PublicationDiscoveryPersistenceBoundaryAudit tests failed:', error.message);
    console.error(error);
    process.exitCode = 1;
});
