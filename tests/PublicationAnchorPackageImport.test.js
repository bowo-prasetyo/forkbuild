import { Structure } from '../core/Structure.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { deriveBlueprintFingerprint } from '../core/BlueprintFingerprint.js';
import { BlueprintAttribution } from '../core/BlueprintAttribution.js';
import { BlueprintLineageClaim } from '../core/BlueprintLineageClaim.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
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
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { derivePublicationEvidenceConvergence } from '../application/PublicationEvidenceConvergence.js';
import {
    ImportPackageAnchorsUseCase,
    PackageAnchorImportReason
} from '../application/ImportPackageAnchorsUseCase.js';

// 0.8.7 — External Evidence Import & Publication Package Integration.
//
// 0.8.6 completed the evidence layer itself — discover, verify, exchange,
// synchronize, compare, derive relationships, all without ever adjudicating
// anything. This milestone connects that evidence layer to the OTHER
// portable container this codebase already has, application/
// BlueprintPackage.js (0.4.6, extended in 0.6.6 and 0.6.8) — without
// merging their semantics:
//
//   BlueprintPackage
//     structure          — the design itself
//     attributions        — signed claims ABOUT the design (0.6.6)
//     lineageClaims        — signed claims ABOUT the design's ancestry (0.6.8)
//     anchors              — signed claims ABOUT a PUBLICATION (0.8.7, new)
//
// `anchors` never becomes part of the Structure, never gets ranked,
// deduplicated by anything but the anchor's own id, or silently trusted —
// see application/BlueprintPackage.js's own header for why no separate
// PublicationPackage container was introduced, and application/
// ImportPackageAnchorsUseCase.js's own header for why package import
// reuses application/PublicationAnchorExchange.js's existing validate ->
// construct -> verify SIGNATURE -> catalog boundary rather than building
// a second one.
//
//   Section A: BlueprintPackage — the new optional `anchors` field:
//              byte-identical when omitted, present when supplied,
//              rejects non-PublicationAnchor entries, multiple anchors
//              (including differently-typed ones) all preserved, no
//              dedup/ranking anywhere in the built package
//   Section B: BlueprintImportValidator — structural rejection of a
//              malformed bundled anchor, surfaced as this module's own
//              BlueprintPackageError, never a leaked PublicationAnchorError
//   Section C: ImportPackageAnchorsUseCase — imported/skipped(duplicate)/
//              rejected(invalid-structure/invalid-signature) categorized
//              correctly; one bad anchor never blocks the rest of a
//              bundle; VERIFICATION ISOLATION — a spy ExternalAnchorVerifier
//              proves package import never calls it, and an explicit
//              verify() afterward does
//   Section D: FLAGSHIP — Alice creates a Blueprint, attribution, lineage
//              claim, and a Bitcoin anchor, and exports all of them in one
//              package; Bob imports the package (Structure via
//              ImportBlueprintUseCase, unchanged; the anchor via
//              ImportPackageAnchorsUseCase), catalogs the anchor, derives
//              evidence convergence over it (application/
//              PublicationEvidenceConvergence.js, 0.8.6, untouched), and
//              only THEN explicitly verifies it — VALID. A second,
//              differently-typed anchor (a transparency log) is added and
//              shown to coexist, never merged or ranked against the first,
//              demonstrating package transport =/= proof verification
//              =/= evidence authority.
//
// See docs/Principles.md, "Package Import Is Evidence Ingestion, Not
// Evidence Verification (0.8.7)," and "Importing Evidence Preserves The
// Claim; It Does Not Repair The Claim (0.8.7)."

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

function makeAnchorReplica(label) {
    const catalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PublicationAnchorExchange(catalog, verifier);
    const identity = makeIdentity(label);
    return { catalog, verifier, exchange, identity };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — BlueprintPackage's new optional `anchors` field
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const structure = farmstead();
        const contentHash = deriveBlueprintFingerprint(structure);

        // Omitted entirely — byte-identical to a pre-0.8.7 export, the
        // same property attributions/lineageClaims already proved.
        const plainPkg = buildBlueprintPackage(structure);
        assert(!('anchors' in plainPkg), '1. a package built with no anchors carries no anchors key at all');
        validateBlueprintPackage(plainPkg);

        const bitcoinAnchor = signAnchor(alice, {
            publicationId: 'pub-farmstead', contentHash, anchorType: 'bitcoin-op-return',
            locator: 'bitcoin://tx/farmstead', proof: { txid: 'farmstead-tx' }
        });

        const bundledPkg = buildBlueprintPackage(structure, { anchors: [bitcoinAnchor] });
        assert(Array.isArray(bundledPkg.anchors) && bundledPkg.anchors.length === 1,
            '2. a package built WITH anchors carries them');
        assert(bundledPkg.anchors[0].id === bitcoinAnchor.id, '3. bundled anchor is exactly anchor.toJSON()');
        assert(JSON.stringify(bundledPkg.anchors[0]) === JSON.stringify(bitcoinAnchor.toJSON()),
            '4. the bundled envelope is byte-identical to anchor.toJSON() — no mutation, no added field');
        assert(bundledPkg.kind === BLUEPRINT_KIND && bundledPkg.schemaVersion === BLUEPRINT_SCHEMA_VERSION,
            '5. bundling anchors never changes the package\'s own kind/schemaVersion');
        assert(bundledPkg.anchors[0].verified === undefined && bundledPkg.anchors[0].verificationOutcome === undefined,
            '6. the bundled anchor carries no verification result of any kind — only the signed claim itself');
        assert(bundledPkg.anchors[0].evidenceScore === undefined && bundledPkg.anchors[0].evidenceRank === undefined,
            '7. the bundled anchor carries no score/rank of any kind');
        validateBlueprintPackage(bundledPkg); // never throws

        expectThrows(() => buildBlueprintPackage(structure, { anchors: [{ not: 'an anchor instance' }] }),
            '8. buildBlueprintPackage rejects an anchors entry that is not a real PublicationAnchor instance');

        // Multiple, independently signed, differently-typed anchors — all
        // preserved, no dedup by anchorType/contentHash/locator, no
        // ranking, mirroring core/PublicationAnchor.js's own multi-evidence
        // coexistence rule.
        const anotherBitcoinAnchor = signAnchor(alice, {
            publicationId: 'pub-farmstead', contentHash, anchorType: 'bitcoin-op-return',
            locator: 'bitcoin://tx/farmstead-2'
        });
        const transparencyAnchor = signAnchor(alice, {
            publicationId: 'pub-farmstead', contentHash, anchorType: 'transparency-log',
            locator: 'ctlog://entry/farmstead'
        });
        const multiPkg = buildBlueprintPackage(structure, {
            anchors: [bitcoinAnchor, anotherBitcoinAnchor, transparencyAnchor]
        });
        assert(multiPkg.anchors.length === 3, '9. all three independent anchors survive, none collapsed by anchorType/contentHash/locator');
        assert(new Set(multiPkg.anchors.map((a) => a.id)).size === 3, '10. each retains its own distinct anchor identity');
        validateBlueprintPackage(multiPkg);

        // ExportBlueprintUseCase passes anchors straight through, exactly
        // like attributions/lineageClaims.
        const viaUseCase = new ExportBlueprintUseCase().execute(structure, { anchors: [bitcoinAnchor] });
        assert(JSON.stringify(viaUseCase) === JSON.stringify(bundledPkg),
            '11. ExportBlueprintUseCase.execute(structure, { anchors }) matches buildBlueprintPackage() exactly');

        // ImportBlueprintUseCase is UNCHANGED by this milestone — it still
        // only ever returns a Structure; reading pkg.anchors back out is
        // application/ImportPackageAnchorsUseCase.js's own job (Section C).
        const rebuiltStructure = new ImportBlueprintUseCase().execute(bundledPkg);
        assert(rebuiltStructure instanceof Structure && rebuiltStructure.name === structure.name,
            '12. ImportBlueprintUseCase still only ever returns a Structure, unaffected by bundled anchors');
    }
    console.log('✓ Section A: BlueprintPackage — the new optional `anchors` field: byte-identical when omitted, present + unmutated when supplied, rejects non-instances, multiple independent/differently-typed anchors all preserved, no dedup/ranking');

    // ---------------------------------------------------------------
    // Section B — BlueprintImportValidator
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const structure = farmstead({ id: 'farmstead-2' });
        const anchor = signAnchor(alice, {
            publicationId: 'pub-b', contentHash: 'hash-b', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/b'
        });

        const pkg = buildBlueprintPackage(structure, { anchors: [anchor] });
        validateBlueprintPackage(pkg); // never throws

        expectThrows(() => validateBlueprintPackage({ ...pkg, anchors: 'not-an-array' }),
            '1. rejects a non-array anchors field');

        const brokenPkg = buildBlueprintPackage(structure, { anchors: [anchor] });
        brokenPkg.anchors[0].signature = null;
        const err = expectThrows(() => validateBlueprintPackage(brokenPkg),
            '2. rejects a package whose bundled anchor is structurally malformed');
        assert(err instanceof BlueprintPackageError, '3. the rejection is a BlueprintPackageError, not a leaked PublicationAnchorError');

        const missingFieldPkg = buildBlueprintPackage(structure, { anchors: [anchor] });
        delete missingFieldPkg.anchors[0].locator;
        expectThrows(() => validateBlueprintPackage(missingFieldPkg),
            '4. rejects a bundled anchor missing a required field (locator)');

        const wrongKindPkg = buildBlueprintPackage(structure, { anchors: [anchor] });
        wrongKindPkg.anchors[0].kind = 'something.else';
        expectThrows(() => validateBlueprintPackage(wrongKindPkg),
            '5. rejects a bundled anchor with the wrong kind discriminator');

        // A package with no anchors at all is unaffected by any of this.
        validateBlueprintPackage(buildBlueprintPackage(structure));
    }
    console.log('✓ Section B: BlueprintImportValidator — structural rejection of a malformed bundled anchor, surfaced as BlueprintPackageError, never a leaked PublicationAnchorError');

    // ---------------------------------------------------------------
    // Section C — ImportPackageAnchorsUseCase
    // ---------------------------------------------------------------
    {
        expectThrows(() => new ImportPackageAnchorsUseCase(null), '1. constructor requires an anchor exchange');
        expectThrows(() => new ImportPackageAnchorsUseCase({}), '2. constructor requires an exchange with importAnchor()');

        const alice = makeIdentity('Alice');
        const structure = farmstead({ id: 'farmstead-3' });
        const bob = makeAnchorReplica('Bob');
        const importer = new ImportPackageAnchorsUseCase(bob.exchange);

        // A package with no anchors at all — empty result, never an error.
        const emptyResult = importer.execute(buildBlueprintPackage(structure));
        assert(emptyResult.importedAnchors.length === 0 && emptyResult.skippedAnchors.length === 0 && emptyResult.rejectedAnchors.length === 0,
            '3. a package with no anchors imports cleanly with an entirely empty result');

        // A genuinely signed anchor imports and catalogs.
        const genuine = signAnchor(alice, { publicationId: 'pub-c', contentHash: 'hash-c', anchorType: 'local-test', locator: 'local://ledger/c' });
        const forged = signAnchor(alice, { publicationId: 'pub-c-2', contentHash: 'hash-c-2', anchorType: 'local-test', locator: 'local://ledger/c-2' }).toJSON();
        forged.contentHash = 'tampered-after-signing';
        const malformed = { kind: 'something.else' };

        const pkg = buildBlueprintPackage(structure, { anchors: [genuine] });
        pkg.anchors.push(forged, malformed);

        const result = importer.execute(pkg);
        assert(result.importedAnchors.length === 1 && result.importedAnchors[0].id === genuine.id,
            '4. the genuine anchor imports — one bad envelope never blocks a good sibling in the same bundle');
        assert(bob.catalog.has(genuine.id), '5. the catalog actually holds the imported anchor');
        assert(result.rejectedAnchors.length === 2, '6. both the forged and the malformed anchor are rejected — the batch keeps going past each');

        const forgedRejection = result.rejectedAnchors.find((r) => r.anchor === forged);
        assert(forgedRejection.reason === PackageAnchorImportReason.INVALID_SIGNATURE,
            '7. the tampered/forged anchor is categorized as INVALID_SIGNATURE, distinct from a structural failure');
        const malformedRejection = result.rejectedAnchors.find((r) => r.anchor === malformed);
        assert(malformedRejection.reason === PackageAnchorImportReason.INVALID_STRUCTURE,
            '8. the structurally malformed anchor is categorized as INVALID_STRUCTURE, distinct from a signature failure');
        assert(typeof forgedRejection.message === 'string' && forgedRejection.message.length > 0,
            '9. a rejection carries a human-readable message, never a bare success: false');

        // Re-importing the identical package is a clean duplicate, never
        // an error and never a second catalog entry.
        const reImportResult = importer.execute(pkg);
        assert(reImportResult.importedAnchors.length === 0, '10. re-importing reports nothing newly imported');
        assert(reImportResult.skippedAnchors.length === 1 && reImportResult.skippedAnchors[0].reason === PackageAnchorImportReason.DUPLICATE,
            '11. the already-known genuine anchor is reported as a DUPLICATE skip, never an error');
        assert(reImportResult.rejectedAnchors.length === 2, '12. the forged/malformed entries are rejected again, identically, on re-import');
        assert(bob.catalog.list().length === 1, '13. the catalog still holds exactly one entry — no duplicate, no partial re-catalog of the rejected entries');

        // --- Verification isolation: package import is ingestion, never
        // verification. A spy ExternalAnchorVerifier would fail the
        // instant it is ever consulted by importer.execute(). ---
        let externalVerifierCalls = 0;
        const spyVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
        const originalVerify = spyVerifier.verify.bind(spyVerifier);
        spyVerifier.verify = async (...args) => { externalVerifierCalls += 1; return originalVerify(...args); };

        const anotherGenuine = signAnchor(alice, { publicationId: 'pub-isolation', contentHash: 'hash-isolation', anchorType: 'local-test', locator: 'local://ledger/isolation' });
        const isolationPkg = buildBlueprintPackage(structure, { anchors: [anotherGenuine] });

        importer.execute(isolationPkg);
        assert(externalVerifierCalls === 0, '14. importPackage() results in ExternalAnchorVerifier calls === 0 — evidence ingestion, not evidence verification');

        const explicitResult = await spyVerifier.verify(anotherGenuine.toJSON(), {
            proofVerifier: { anchorType: 'local-test', verify: () => ({ valid: true }) }
        });
        assert(externalVerifierCalls === 1, '15. an explicit verify(anchor) call afterward results in ExternalAnchorVerifier calls === 1');
        assert(explicitResult.outcome === AnchorVerificationOutcome.VALID, '16. sanity: the explicit verification genuinely succeeds for this anchor');
    }
    console.log('✓ Section C: ImportPackageAnchorsUseCase — imported/skipped(duplicate)/rejected(invalid-structure/invalid-signature) categorized correctly, one bad anchor never blocks the rest of a bundle, re-import converges harmlessly, VERIFICATION ISOLATION proven with a spy ExternalAnchorVerifier');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: Alice creates a Blueprint, an attribution, a
    // lineage claim, and a Bitcoin anchor, and exports all four together;
    // Bob imports the package, catalogs the anchor, derives evidence
    // convergence over it, and only THEN explicitly verifies it.
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

        // Alice exports Blueprint + Attribution + Lineage + Anchor in ONE
        // package — the whole point of this milestone's transport
        // convenience.
        const pkg = new ExportBlueprintUseCase().execute(structure, {
            attributions: [attribution], lineageClaims: [lineageClaim], anchors: [bitcoinAnchor]
        });
        assert(pkg.attributions.length === 1 && pkg.lineageClaims.length === 1 && pkg.anchors.length === 1,
            '1. Alice\'s exported package bundles all three independent kinds of evidence, plus the Structure');

        // -------- Bob's side: an entirely independent replica --------
        validateBlueprintPackage(pkg); // never throws — well-formed on arrival

        const bobStructure = new ImportBlueprintUseCase().execute(pkg);
        assert(bobStructure instanceof Structure && bobStructure.name === "Alice's Riverside Inn",
            '2. Bob imports the Structure via the ordinary, unmodified ImportBlueprintUseCase');

        const bob = makeAnchorReplica('Bob');
        const importer = new ImportPackageAnchorsUseCase(bob.exchange);
        const importResult = importer.execute(pkg);
        assert(importResult.importedAnchors.length === 1 && importResult.importedAnchors[0].id === bitcoinAnchor.id,
            '3. Bob catalogs the bundled anchor — package transport, nothing more, nothing verified yet');
        assert(bob.catalog.has(bitcoinAnchor.id), '4. the anchor is genuinely in Bob\'s own catalog');

        // Before any verification: derive evidence convergence over what
        // Bob's catalog now knows — application/PublicationEvidenceConvergence.js
        // (0.8.6), completely unchanged by this milestone.
        const knownAnchors = bob.catalog.findByPublicationId('pub-flagship');
        const convergence = derivePublicationEvidenceConvergence({
            publicationId: 'pub-flagship', expectedContentHash: fingerprint, anchors: knownAnchors
        });
        assert(convergence.anchorCount === 1 && convergence.anchorTypes.length === 1 && convergence.anchorTypes[0] === 'bitcoin-op-return',
            '5. the derived evidence view reports exactly one anchor, of one anchorType — derived purely from cataloged claims, no verification involved');
        assert(convergence.contentBindingConflict === false, '6. no conflict — the single anchor agrees with the expected content hash');
        assert(convergence.anchors[0].verification === null,
            '7. the derived view carries no local verification observation at all before anything was ever verified — nothing was ever supplied, nothing was ever run implicitly');

        // ONLY NOW does Bob explicitly verify the anchor — a deliberate,
        // separate user action, never implied by import or by deriving a
        // convergence view over it.
        const bobVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
        const acceptingPlugin = { anchorType: 'bitcoin-op-return', verify: () => ({ valid: true }) };
        const verifyResult = await bobVerifier.verify(bob.catalog.get(bitcoinAnchor.id).toJSON(), {
            expectedContentHash: fingerprint, expectedPublicationId: 'pub-flagship', proofVerifier: acceptingPlugin
        });
        assert(verifyResult.outcome === AnchorVerificationOutcome.VALID, '8. Bob\'s explicit verification succeeds — VALID');

        // The verification result is never written back anywhere Bob's
        // catalog or a re-derived convergence view could pick it up on
        // its own — it stays exactly what the caller does with it.
        assert(bob.catalog.get(bitcoinAnchor.id).toJSON().verified === undefined,
            '9. the VALID outcome is never written back into the cataloged anchor record');

        // -------- A second, independently-typed anchor arrives via a
        // SECOND package — package transport, proof verification, and
        // evidence authority all stay separate, demonstrated together. --------
        const transparencyAnchor = signAnchor(alice, {
            publicationId: 'pub-flagship', contentHash: fingerprint, anchorType: 'transparency-log',
            locator: 'ctlog://entry/flagship'
        });
        const secondPkg = buildBlueprintPackage(structure, { anchors: [transparencyAnchor] });
        const secondImportResult = importer.execute(secondPkg);
        assert(secondImportResult.importedAnchors.length === 1, '10. the second, differently-typed anchor imports independently of the first');

        const bothAnchors = bob.catalog.findByPublicationId('pub-flagship');
        assert(bothAnchors.length === 2, '11. Bob now holds two independent anchors for the same publication — neither replaced the other');

        const convergenceAfter = derivePublicationEvidenceConvergence({
            publicationId: 'pub-flagship', expectedContentHash: fingerprint, anchors: bothAnchors
        });
        assert(convergenceAfter.anchorCount === 2 && convergenceAfter.anchorTypes.length === 2,
            '12. the derived view now reports two anchors of two distinct anchorTypes — package transport merged nothing');
        assert(convergenceAfter.contentBindingConflict === false,
            '13. both anchors agree with the expected content hash — no conflict, and still no ranking of one over the other');

        // The un-verified transparency anchor coexists with the already-
        // verified Bitcoin anchor without either being promoted or
        // demoted — package transport, proof verification, and evidence
        // authority are three separate questions, exactly as this
        // milestone's own design intended.
        const transparencyVerifyResult = await bobVerifier.verify(bob.catalog.get(transparencyAnchor.id).toJSON(), {
            expectedContentHash: fingerprint, expectedPublicationId: 'pub-flagship'
        });
        assert(transparencyVerifyResult.outcome === AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED,
            '14. with no proofVerifier plugged in for transparency-log, verification honestly reports VALID_PROOF_UNVERIFIED — never silently upgraded, never silently blocked by the OTHER anchor already being VALID');

        // Alice's own originals are completely untouched throughout.
        assert(pkg.anchors[0].id === bitcoinAnchor.id && pkg.anchors[0].signature.signature === bitcoinAnchor.signature.signature,
            '15. Alice\'s original exported package is byte-identical to what it was before any of Bob\'s import/verify activity');
    }
    console.log('✓ Section D: FLAGSHIP — Alice bundles Blueprint + Attribution + Lineage + Bitcoin anchor in one package; Bob imports, catalogs the anchor, derives evidence convergence (0.8.6, unmodified), and only then explicitly verifies it — VALID; a second, differently-typed anchor coexists, unranked and independently un/verified — package transport =/= proof verification =/= evidence authority');

    console.log('\nAll Publication Anchor Package Import tests passed.');
}

run().catch((error) => {
    console.error('PublicationAnchorPackageImport.test.js FAILED:', error);
    process.exitCode = 1;
});
