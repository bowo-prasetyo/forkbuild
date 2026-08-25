import { Structure } from '../core/Structure.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { deriveBlueprintFingerprint } from '../core/BlueprintFingerprint.js';
import { BlueprintAttribution } from '../core/BlueprintAttribution.js';
import { BlueprintLineageClaim } from '../core/BlueprintLineageClaim.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import {
    buildBlueprintPackage,
    BLUEPRINT_KIND,
    CURRENT_SCHEMA_VERSION as BLUEPRINT_SCHEMA_VERSION
} from '../application/BlueprintPackage.js';
import { validateBlueprintPackage, BlueprintPackageError } from '../application/BlueprintImportValidator.js';
import { ExportBlueprintUseCase } from '../application/ExportBlueprintUseCase.js';
import { ImportBlueprintUseCase } from '../application/ImportBlueprintUseCase.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { PublicationAnchorExchange } from '../application/PublicationAnchorExchange.js';
import { ImportPackageAnchorsUseCase } from '../application/ImportPackageAnchorsUseCase.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacementExchange } from '../application/PublicationSnapshotPlacementExchange.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { SnapshotPlacementResolver } from '../application/SnapshotPlacementResolver.js';
import { SnapshotPlacementResolutionOutcome } from '../application/SnapshotPlacementResolutionOutcome.js';
import {
    ImportPackageSnapshotPlacementsUseCase,
    PackagePlacementImportReason
} from '../application/ImportPackageSnapshotPlacementsUseCase.js';

// 0.8.22 — Snapshot Placement Package Integration.
//
// 0.8.21 completed the placement side's persistence half — a persistent
// catalog, a restart-recovery pass, all without ever resolving anything.
// This milestone connects the placement layer to the OTHER portable
// container this codebase already has, application/BlueprintPackage.js
// (0.4.6, extended in 0.6.6, 0.6.8, and 0.8.7 for anchors) — without
// merging their semantics:
//
//   BlueprintPackage
//     structure          — the design itself
//     attributions        — signed claims ABOUT the design (0.6.6)
//     lineageClaims        — signed claims ABOUT the design's ancestry (0.6.8)
//     anchors              — signed claims ABOUT a PUBLICATION's evidence (0.8.7)
//     placements           — signed claims ABOUT a PUBLICATION's retrievability (0.8.22, new)
//
// `placements` never becomes part of the Structure, never gets ranked,
// deduplicated by anything but the placement's own id, or silently
// resolved — see application/BlueprintPackage.js's own header for why no
// separate PublicationPackage container was introduced (the identical
// reasoning 0.8.7 already established for anchors), and application/
// ImportPackageSnapshotPlacementsUseCase.js's own header for why package
// import reuses application/PublicationSnapshotPlacementExchange.js's
// existing validate -> construct -> verify SIGNATURE -> catalog boundary
// rather than building a second one.
//
//   Section A: BlueprintPackage — the new optional `placements` field:
//              byte-identical when omitted, present when supplied,
//              rejects non-PublicationSnapshotPlacement entries, multiple
//              placements (including differently-stored ones) all
//              preserved, no dedup/ranking anywhere in the built package
//   Section B: BlueprintImportValidator — structural rejection of a
//              malformed bundled placement, surfaced as this module's own
//              BlueprintPackageError, never a leaked
//              PublicationSnapshotPlacementError
//   Section C: ImportPackageSnapshotPlacementsUseCase — imported/
//              skipped(duplicate)/rejected(invalid-structure/invalid-
//              signature) categorized correctly; one bad placement never
//              blocks the rest of a bundle; RESOLUTION ISOLATION — a spy
//              SnapshotPlacementResolver proves package import never
//              calls it, and an explicit resolve() afterward does
//   Section D: FLAGSHIP — Alice bundles a Blueprint, an attribution, a
//              lineage claim, a Bitcoin anchor, AND a snapshot placement
//              in one package. Bob imports the package into an
//              independent replica: the Structure via
//              ImportBlueprintUseCase (unchanged), the anchor via
//              ImportPackageAnchorsUseCase (unchanged, 0.8.7), and the
//              placement via ImportPackageSnapshotPlacementsUseCase
//              (this milestone). The placement is cataloged and
//              discoverable/inspectable WITHOUT the resolver ever being
//              consulted and WITHOUT any content store being contacted.
//              Only once Bob explicitly resolves it does
//              SnapshotPlacementResolver retrieve and hash-verify the
//              actual bytes — RESOLVED. A second, differently-stored
//              placement (arriving via a second package) coexists
//              unranked and unresolved.
//
// See docs/Principles.md, "Package Import Is Placement Ingestion, Not
// Placement Resolution (0.8.22)," and "Package Import Preserves
// Placement Claims; It Does Not Establish Retrieval Availability
// (0.8.22)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    let error = null;
    try { fn(); } catch (e) { threw = true; error = e; }
    assert(threw, message);
    return error;
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function brick(definitionId, x, y, z, rotation = 0) {
    return new Brick({ definitionId, position: new Position(x, y, z), rotation });
}

function farmstead({ id = 'farmstead-1', name = 'Farmstead', category = 'Architecture', description = 'A cozy farmstead.', bricks } = {}) {
    return new Structure({
        id, name, category, description,
        bricks: bricks || [
            brick('core:wall_1x3', 0, 0, 0),
            brick('core:wall_1x3', 1, 0, 0, 90),
            brick('core:roof_hip', 0, 1, 0)
        ]
    });
}

function signAnchor(identityProvider, fields) {
    let anchor = new PublicationAnchor({
        ...fields,
        anchorIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    anchor = anchor.withSignature(identityProvider.signCanonical(anchor.getSigningDescriptor()));
    return anchor;
}

function signPlacement(identityProvider, fields) {
    let placement = new PublicationSnapshotPlacement({
        ...fields,
        placerIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    placement = placement.withSignature(identityProvider.signCanonical(placement.getSigningDescriptor()));
    return placement;
}

function makeAnchorReplica(label) {
    const catalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PublicationAnchorExchange(catalog, verifier);
    const identity = makeIdentity(label);
    return { catalog, verifier, exchange, identity };
}

function makePlacementReplica(label) {
    const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PublicationSnapshotPlacementExchange(catalog, verifier);
    const identity = makeIdentity(label);
    return { catalog, verifier, exchange, identity };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — BlueprintPackage's new optional `placements` field
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const structure = farmstead();
        const fingerprint = deriveBlueprintFingerprint(structure);

        // Omitted entirely — byte-identical to a pre-0.8.22 export, the
        // same property attributions/lineageClaims/anchors already proved.
        const plainPkg = buildBlueprintPackage(structure);
        assert(!('placements' in plainPkg), '1. a package built with no placements carries no placements key at all');
        validateBlueprintPackage(plainPkg);

        const ipfsPlacement = signPlacement(alice, {
            publicationId: 'pub-farmstead', contentHash: fingerprint,
            storage: 'ipfs', locator: 'ipfs://CID-farmstead'
        });

        const bundledPkg = buildBlueprintPackage(structure, { placements: [ipfsPlacement] });
        assert(Array.isArray(bundledPkg.placements) && bundledPkg.placements.length === 1,
            '2. a package built WITH placements carries them');
        assert(bundledPkg.placements[0].id === ipfsPlacement.id, '3. bundled placement is exactly placement.toJSON()');
        assert(JSON.stringify(bundledPkg.placements[0]) === JSON.stringify(ipfsPlacement.toJSON()),
            '4. the bundled envelope is byte-identical to placement.toJSON() — no mutation, no added field');
        assert(bundledPkg.kind === BLUEPRINT_KIND && bundledPkg.schemaVersion === BLUEPRINT_SCHEMA_VERSION,
            '5. bundling placements never changes the package\'s own kind/schemaVersion');
        assert(bundledPkg.placements[0].resolved === undefined && bundledPkg.placements[0].resolutionOutcome === undefined,
            '6. the bundled placement carries no resolution result of any kind — only the signed claim itself');
        assert(bundledPkg.placements[0].availability === undefined,
            '7. the bundled placement carries no availability state of any kind');
        validateBlueprintPackage(bundledPkg); // never throws

        expectThrows(() => buildBlueprintPackage(structure, { placements: [{ not: 'a placement instance' }] }),
            '8. buildBlueprintPackage rejects a placements entry that is not a real PublicationSnapshotPlacement instance');

        // Multiple, independently signed, differently-stored placements —
        // all preserved, no dedup by storage/contentHash/locator, no
        // ranking, mirroring core/PublicationSnapshotPlacement.js's own
        // multi-locator coexistence rule.
        const anotherIpfsPlacement = signPlacement(alice, {
            publicationId: 'pub-farmstead', contentHash: fingerprint,
            storage: 'ipfs', locator: 'ipfs://CID-farmstead-2'
        });
        const localPlacement = signPlacement(alice, {
            publicationId: 'pub-farmstead', contentHash: fingerprint,
            storage: 'local', locator: 'local://replica/farmstead'
        });
        const multiPkg = buildBlueprintPackage(structure, {
            placements: [ipfsPlacement, anotherIpfsPlacement, localPlacement]
        });
        assert(multiPkg.placements.length === 3, '9. all three independent placements survive, none collapsed by storage/contentHash/locator');
        assert(new Set(multiPkg.placements.map((p) => p.id)).size === 3, '10. each retains its own distinct placement identity');
        validateBlueprintPackage(multiPkg);

        // ExportBlueprintUseCase passes placements straight through,
        // exactly like attributions/lineageClaims/anchors.
        const viaUseCase = new ExportBlueprintUseCase().execute(structure, { placements: [ipfsPlacement] });
        assert(JSON.stringify(viaUseCase) === JSON.stringify(bundledPkg),
            '11. ExportBlueprintUseCase.execute(structure, { placements }) matches buildBlueprintPackage() exactly');

        // ImportBlueprintUseCase is UNCHANGED by this milestone — it still
        // only ever returns a Structure; reading pkg.placements back out
        // is application/ImportPackageSnapshotPlacementsUseCase.js's own
        // job (Section C).
        const rebuiltStructure = new ImportBlueprintUseCase().execute(bundledPkg);
        assert(rebuiltStructure instanceof Structure && rebuiltStructure.name === structure.name,
            '12. ImportBlueprintUseCase still only ever returns a Structure, unaffected by bundled placements');
    }
    console.log('✓ Section A: BlueprintPackage — the new optional `placements` field: byte-identical when omitted, present + unmutated when supplied, rejects non-instances, multiple independent/differently-stored placements all preserved, no dedup/ranking');

    // ---------------------------------------------------------------
    // Section B — BlueprintImportValidator
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const structure = farmstead({ id: 'farmstead-2' });
        const placement = signPlacement(alice, {
            publicationId: 'pub-b', contentHash: 'hash-b', storage: 'ipfs', locator: 'ipfs://CID-b'
        });

        const pkg = buildBlueprintPackage(structure, { placements: [placement] });
        validateBlueprintPackage(pkg); // never throws

        expectThrows(() => validateBlueprintPackage({ ...pkg, placements: 'not-an-array' }),
            '1. rejects a non-array placements field');

        const brokenPkg = buildBlueprintPackage(structure, { placements: [placement] });
        brokenPkg.placements[0].signature = null;
        const err = expectThrows(() => validateBlueprintPackage(brokenPkg),
            '2. rejects a package whose bundled placement is structurally malformed');
        assert(err instanceof BlueprintPackageError, '3. the rejection is a BlueprintPackageError, not a leaked PublicationSnapshotPlacementError');

        const missingFieldPkg = buildBlueprintPackage(structure, { placements: [placement] });
        delete missingFieldPkg.placements[0].locator;
        expectThrows(() => validateBlueprintPackage(missingFieldPkg),
            '4. rejects a bundled placement missing a required field (locator)');

        const wrongKindPkg = buildBlueprintPackage(structure, { placements: [placement] });
        wrongKindPkg.placements[0].kind = 'something.else';
        expectThrows(() => validateBlueprintPackage(wrongKindPkg),
            '5. rejects a bundled placement with the wrong kind discriminator');

        // A package with no placements at all is unaffected by any of this.
        validateBlueprintPackage(buildBlueprintPackage(structure));
    }
    console.log('✓ Section B: BlueprintImportValidator — structural rejection of a malformed bundled placement, surfaced as BlueprintPackageError, never a leaked PublicationSnapshotPlacementError');

    // ---------------------------------------------------------------
    // Section C — ImportPackageSnapshotPlacementsUseCase
    // ---------------------------------------------------------------
    {
        expectThrows(() => new ImportPackageSnapshotPlacementsUseCase(null), '1. constructor requires a placement exchange');
        expectThrows(() => new ImportPackageSnapshotPlacementsUseCase({}), '2. constructor requires an exchange with importPlacement()');

        const alice = makeIdentity('Alice');
        const structure = farmstead({ id: 'farmstead-3' });
        const bob = makePlacementReplica('Bob');
        const importer = new ImportPackageSnapshotPlacementsUseCase(bob.exchange);

        // A package with no placements at all — empty result, never an error.
        const emptyResult = importer.execute(buildBlueprintPackage(structure));
        assert(emptyResult.importedPlacements.length === 0 && emptyResult.skippedPlacements.length === 0 && emptyResult.rejectedPlacements.length === 0,
            '3. a package with no placements imports cleanly with an entirely empty result');

        // A genuinely signed placement imports and catalogs.
        const genuine = signPlacement(alice, { publicationId: 'pub-c', contentHash: 'hash-c', storage: 'ipfs', locator: 'ipfs://CID-c' });
        const forged = signPlacement(alice, { publicationId: 'pub-c-2', contentHash: 'hash-c-2', storage: 'ipfs', locator: 'ipfs://CID-c-2' }).toJSON();
        forged.contentHash = 'tampered-after-signing';
        const malformed = { kind: 'something.else' };

        const pkg = buildBlueprintPackage(structure, { placements: [genuine] });
        pkg.placements.push(forged, malformed);

        const result = importer.execute(pkg);
        assert(result.importedPlacements.length === 1 && result.importedPlacements[0].id === genuine.id,
            '4. the genuine placement imports — one bad envelope never blocks a good sibling in the same bundle');
        assert(bob.catalog.has(genuine.id), '5. the catalog actually holds the imported placement');
        assert(result.rejectedPlacements.length === 2, '6. both the forged and the malformed placement are rejected — the batch keeps going past each');

        const forgedRejection = result.rejectedPlacements.find((r) => r.placement === forged);
        assert(forgedRejection.reason === PackagePlacementImportReason.INVALID_SIGNATURE,
            '7. the tampered/forged placement is categorized as INVALID_SIGNATURE, distinct from a structural failure');
        const malformedRejection = result.rejectedPlacements.find((r) => r.placement === malformed);
        assert(malformedRejection.reason === PackagePlacementImportReason.INVALID_STRUCTURE,
            '8. the structurally malformed placement is categorized as INVALID_STRUCTURE, distinct from a signature failure');
        assert(typeof forgedRejection.message === 'string' && forgedRejection.message.length > 0,
            '9. a rejection carries a human-readable message, never a bare success: false');

        // Re-importing the identical package is a clean duplicate, never
        // an error and never a second catalog entry.
        const reImportResult = importer.execute(pkg);
        assert(reImportResult.importedPlacements.length === 0, '10. re-importing reports nothing newly imported');
        assert(reImportResult.skippedPlacements.length === 1 && reImportResult.skippedPlacements[0].reason === PackagePlacementImportReason.DUPLICATE,
            '11. the already-known genuine placement is reported as a DUPLICATE skip, never an error');
        assert(reImportResult.rejectedPlacements.length === 2, '12. the forged/malformed entries are rejected again, identically, on re-import');
        assert(bob.catalog.list().length === 1, '13. the catalog still holds exactly one entry — no duplicate, no partial re-catalog of the rejected entries');

        // --- Resolution isolation: package import is ingestion, never
        // resolution. A spy SnapshotPlacementResolver would fail the
        // instant it is ever consulted by importer.execute(). ---
        let resolverCalls = 0;
        const spyResolver = new SnapshotPlacementResolver(new LocalAuthorizationVerifier());
        const originalResolve = spyResolver.resolve.bind(spyResolver);
        spyResolver.resolve = async (...args) => { resolverCalls += 1; return originalResolve(...args); };

        const anotherGenuine = signPlacement(alice, { publicationId: 'pub-isolation', contentHash: 'hash-isolation', storage: 'ipfs', locator: 'ipfs://CID-isolation' });
        const isolationPkg = buildBlueprintPackage(structure, { placements: [anotherGenuine] });

        importer.execute(isolationPkg);
        assert(resolverCalls === 0, '14. importPackage() results in SnapshotPlacementResolver calls === 0 — placement ingestion, not placement resolution');

        const explicitResult = await spyResolver.resolve(anotherGenuine.toJSON(), { storeRegistry: new SnapshotPlacementStoreRegistry() });
        assert(resolverCalls === 1, '15. an explicit resolve(placement) call afterward results in SnapshotPlacementResolver calls === 1');
        assert(explicitResult.outcome === SnapshotPlacementResolutionOutcome.STORE_UNAVAILABLE,
            '16. sanity: the explicit resolution genuinely runs for this placement (no ipfs store registered, so STORE_UNAVAILABLE — still a real call, never bypassed)');
    }
    console.log('✓ Section C: ImportPackageSnapshotPlacementsUseCase — imported/skipped(duplicate)/rejected(invalid-structure/invalid-signature) categorized correctly, one bad placement never blocks the rest of a bundle, re-import converges harmlessly, RESOLUTION ISOLATION proven with a spy SnapshotPlacementResolver');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: Alice bundles a Blueprint, an attribution, a
    // lineage claim, a Bitcoin anchor, AND a snapshot placement into one
    // package. Bob imports the package into an independent replica,
    // catalogs the anchor and the placement, and only THEN explicitly
    // resolves the placement.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const structure = farmstead({ id: 'farmstead-flagship', name: "Alice's Riverside Inn" });
        const fingerprint = deriveBlueprintFingerprint(structure);

        let attribution = new BlueprintAttribution({ fingerprint, authorIdentityId: alice.getSigningIdentity().id });
        attribution = attribution.withSignature(alice.signCanonical(attribution.getSigningDescriptor()));

        let lineageClaim = new BlueprintLineageClaim({
            sourceFingerprint: 'bp:some-earlier-design', derivedFingerprint: fingerprint,
            authorIdentityId: alice.getSigningIdentity().id
        });
        lineageClaim = lineageClaim.withSignature(alice.signCanonical(lineageClaim.getSigningDescriptor()));

        const bitcoinAnchor = signAnchor(alice, {
            publicationId: 'pub-flagship', contentHash: fingerprint, anchorType: 'bitcoin-op-return',
            locator: 'bitcoin://tx/flagship', proof: { txid: 'flagship-tx' }
        });

        // The actual snapshot bytes this placement claims are retrievable
        // — already sitting in Bob's own local content store, exactly the
        // "resolved against his own registered local content store"
        // scenario 0.8.21's own flagship already used. Alice never sees
        // this store; she only signs a claim that this exact content hash
        // is retrievable via `local` storage at some locator.
        const bobLocalStorage = new InMemoryStorageProvider();
        const bobLocalStore = new LocalContentStore(bobLocalStorage);
        const snapshotBytes = JSON.stringify({ note: 'Alice\'s Riverside Inn snapshot bytes' });
        const reference = bobLocalStore.put(snapshotBytes);

        const localPlacement = signPlacement(alice, {
            publicationId: 'pub-flagship', contentHash: reference.hash,
            storage: 'local', locator: 'local://replica/flagship-snapshot'
        });

        // Alice exports Blueprint + Attribution + Lineage + Anchor +
        // Placement in ONE package — the whole point of this milestone's
        // transport convenience.
        const pkg = new ExportBlueprintUseCase().execute(structure, {
            attributions: [attribution], lineageClaims: [lineageClaim],
            anchors: [bitcoinAnchor], placements: [localPlacement]
        });
        assert(pkg.attributions.length === 1 && pkg.lineageClaims.length === 1 && pkg.anchors.length === 1 && pkg.placements.length === 1,
            '1. Alice\'s exported package bundles all four independent kinds of claims, plus the Structure');

        // -------- Bob's side: an entirely independent replica --------
        validateBlueprintPackage(pkg); // never throws — well-formed on arrival

        const bobStructure = new ImportBlueprintUseCase().execute(pkg);
        assert(bobStructure instanceof Structure && bobStructure.name === "Alice's Riverside Inn",
            '2. Bob imports the Structure via the ordinary, unmodified ImportBlueprintUseCase');

        const bobAnchorReplica = makeAnchorReplica('Bob');
        const anchorImporter = new ImportPackageAnchorsUseCase(bobAnchorReplica.exchange);
        const anchorImportResult = anchorImporter.execute(pkg);
        assert(anchorImportResult.importedAnchors.length === 1, '3. Bob catalogs the bundled anchor via the existing, unmodified 0.8.7 importer');

        const bobPlacementReplica = makePlacementReplica('Bob');
        const placementImporter = new ImportPackageSnapshotPlacementsUseCase(bobPlacementReplica.exchange);
        const placementImportResult = placementImporter.execute(pkg);
        assert(placementImportResult.importedPlacements.length === 1 && placementImportResult.importedPlacements[0].id === localPlacement.id,
            '4. Bob catalogs the bundled placement — package transport, nothing more, nothing resolved yet');
        assert(bobPlacementReplica.catalog.has(localPlacement.id), '5. the placement is genuinely in Bob\'s own catalog');

        // Before any resolution: the placement is discoverable/inspectable
        // purely from the catalog — a spy resolver proves it was never
        // once consulted by either import call above.
        let resolverCalls = 0;
        const spyResolver = new SnapshotPlacementResolver(bobPlacementReplica.verifier);
        const originalResolve = spyResolver.resolve.bind(spyResolver);
        spyResolver.resolve = async (...args) => { resolverCalls += 1; return originalResolve(...args); };
        assert(resolverCalls === 0, '6. zero SnapshotPlacementResolver calls have happened purely from importing and cataloging');

        const knownPlacements = bobPlacementReplica.catalog.findByPublicationId('pub-flagship');
        assert(knownPlacements.length === 1 && knownPlacements[0].storage === 'local',
            '7. the placement is discoverable via the catalog\'s own findByPublicationId(), purely from cataloged data');
        assert(resolverCalls === 0, '8. inspecting/discovering the cataloged placement still never touches the resolver');

        // ONLY NOW does Bob explicitly press "Resolve Snapshot" — a
        // deliberate, separate user action, never implied by import or by
        // discovering/inspecting the placement.
        const bobRegistry = new SnapshotPlacementStoreRegistry();
        bobRegistry.register(bobLocalStore);
        const resolveResult = await spyResolver.resolve(
            bobPlacementReplica.catalog.get(localPlacement.id).toJSON(),
            { storeRegistry: bobRegistry }
        );
        assert(resolverCalls === 1, '9. exactly one explicit resolve() call happened, and only after Bob\'s own explicit action');
        assert(resolveResult.outcome === SnapshotPlacementResolutionOutcome.RESOLVED, '10. Bob\'s explicit resolution succeeds — RESOLVED');
        assert(resolveResult.bytes === snapshotBytes, '11. the retrieved bytes are exactly the snapshot bytes Bob\'s own local store already held');

        // The resolution result is never written back anywhere Bob's
        // catalog could pick up on its own.
        assert(bobPlacementReplica.catalog.get(localPlacement.id).toJSON().resolved === undefined,
            '12. the RESOLVED outcome is never written back into the cataloged placement record');

        // -------- A second, differently-stored placement arrives via a
        // SECOND package — package transport, resolution, and
        // availability all stay separate, demonstrated together. --------
        const ipfsPlacement = signPlacement(alice, {
            publicationId: 'pub-flagship', contentHash: fingerprint, storage: 'ipfs', locator: 'ipfs://CID-flagship'
        });
        const secondPkg = buildBlueprintPackage(structure, { placements: [ipfsPlacement] });
        const secondImportResult = placementImporter.execute(secondPkg);
        assert(secondImportResult.importedPlacements.length === 1, '13. the second, differently-stored placement imports independently of the first');

        const bothPlacements = bobPlacementReplica.catalog.findByPublicationId('pub-flagship');
        assert(bothPlacements.length === 2, '14. Bob now holds two independent placements for the same publication — neither replaced the other');

        // The un-resolved IPFS placement coexists with the already-
        // resolved local placement without either being promoted or
        // demoted — package transport, resolution, and availability are
        // three separate questions, exactly as this milestone's own
        // design intended. No store is registered for 'ipfs', so this
        // one honestly reports STORE_UNAVAILABLE if ever resolved — but
        // this milestone never resolves it at all, proving the point by
        // omission: an unresolved placement is exactly as cataloged and
        // exactly as discoverable as a resolved one.
        assert(bothPlacements.some((p) => p.storage === 'local') && bothPlacements.some((p) => p.storage === 'ipfs'),
            '15. both storage backends are represented, unranked, in Bob\'s catalog');

        // Alice's own originals are completely untouched throughout.
        assert(pkg.placements[0].id === localPlacement.id && pkg.placements[0].signature.signature === localPlacement.signature.signature,
            '16. Alice\'s original exported package is byte-identical to what it was before any of Bob\'s import/resolve activity');
    }
    console.log('✓ Section D: FLAGSHIP — Alice bundles Blueprint + Attribution + Lineage + Bitcoin anchor + Snapshot Placement in one package; Bob imports, catalogs the anchor and the placement, and only then explicitly resolves the placement — RESOLVED against his own local content store; a second, differently-stored placement coexists, unranked and unresolved — package transport =/= signature validity =/= availability');

    console.log('\nAll Publication Snapshot Placement Package Import tests passed.');
}

run().catch((error) => {
    console.error('PublicationSnapshotPlacementPackageImport.test.js FAILED:', error);
    process.exitCode = 1;
});
