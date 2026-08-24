import { Structure } from '../core/Structure.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { deriveBlueprintFingerprint, blueprintFingerprintsEqual } from '../core/BlueprintFingerprint.js';
import { BlueprintAttribution, BLUEPRINT_ATTRIBUTION_KIND, CURRENT_SCHEMA_VERSION as ATTRIBUTION_SCHEMA_VERSION } from '../core/BlueprintAttribution.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalBlueprintAttributionStore } from '../application/LocalBlueprintAttributionStore.js';
import { LocalBlueprintAttributionPublicationLog } from '../application/LocalBlueprintAttributionPublicationLog.js';
import { BlueprintAttributionUseCase } from '../application/BlueprintAttributionUseCase.js';
import { BlueprintAttributionExchange } from '../application/BlueprintAttributionExchange.js';
import {
    validateBlueprintAttributionPublication,
    BlueprintAttributionPublicationError
} from '../application/BlueprintAttributionPublicationValidator.js';
import { buildBlueprintPackage, BLUEPRINT_KIND, CURRENT_SCHEMA_VERSION as BLUEPRINT_SCHEMA_VERSION } from '../application/BlueprintPackage.js';
import { validateBlueprintPackage, BlueprintPackageError } from '../application/BlueprintImportValidator.js';
import { ExportBlueprintUseCase } from '../application/ExportBlueprintUseCase.js';
import { ImportBlueprintUseCase } from '../application/ImportBlueprintUseCase.js';

// 0.6.6 — Decentralized Blueprint Exchange.
//
// 0.6.5 built the whole attribution MODEL and drew its own boundary
// exactly where its own design conversation said to stop: "0.6.5 builds
// no exchange transport for an attribution at all... this is 0.6.6's own
// job." This suite proves that missing piece, mirroring
// tests/PlaceNamingExchange.test.js's own shape one domain over:
//
//   Section A: BlueprintAttributionPublicationValidator — every
//              malformed-publication rejection
//   Section B: BlueprintAttributionExchange — export/import/dedup/
//              tamper/impersonation/fingerprint-mismatch rejection
//   Section C: LocalBlueprintAttributionPublicationLog — receivedAt
//              bookkeeping, first-seen-wins
//   Section D: BlueprintPackage's new optional `attributions` field —
//              build/validate round trip, byte-identical when omitted
//   Section E: FLAGSHIP — Alice creates "Farmstead," claims authorship,
//              exports blueprint + attribution together; Bob imports
//              both, verifies the bundled attribution against a
//              LOCALLY-derived fingerprint (never the package's own
//              claim), and sees Alice as an attributed author; Bob then
//              publishes his own attribution for his independent copy;
//              Alice's original blueprint and attribution are untouched
//              throughout.
//
// See docs/Principles.md, "Attribution Exchange Distributes Assertions;
// It Never Establishes Who Actually Made A Design (0.6.6)."

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

// Mirrors tests/BlueprintIdentityAttribution.test.js's own makeIdentity().
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

// Builds one setup() of store/verifier/log/exchange/useCase for a fresh
// identity, mirroring the throwaway harness every exchange test file in
// this codebase already assembles for itself.
function makeReplica(label) {
    const storage = new InMemoryStorageProvider();
    const store = new LocalBlueprintAttributionStore(storage);
    const log = new LocalBlueprintAttributionPublicationLog(storage);
    const verifier = new LocalAuthorizationVerifier();
    const identity = makeIdentity(label);
    const useCase = new BlueprintAttributionUseCase(store, identity, verifier);
    const exchange = new BlueprintAttributionExchange(store, verifier, log);
    return { storage, store, log, verifier, identity, useCase, exchange };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — BlueprintAttributionPublicationValidator
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        let attribution = new BlueprintAttribution({ fingerprint: 'bp:abc', authorIdentityId: alice.getSigningIdentity().id });
        attribution = attribution.withSignature(alice.signCanonical(attribution.getSigningDescriptor()));
        const validPkg = attribution.toJSON();

        // A well-formed publication never throws.
        validateBlueprintAttributionPublication(validPkg);

        expectThrows(() => validateBlueprintAttributionPublication(null), '1. rejects a null package');
        expectThrows(() => validateBlueprintAttributionPublication('not json'), '2. rejects a non-object package');
        expectThrows(() => validateBlueprintAttributionPublication({ ...validPkg, kind: 'something.else' }),
            '3. rejects the wrong kind discriminator');
        expectThrows(() => validateBlueprintAttributionPublication({ ...validPkg, schemaVersion: 999 }),
            '4. rejects an unsupported schema version');
        for (const field of ['id', 'fingerprint', 'authorIdentityId', 'createdAt']) {
            const bad = { ...validPkg, [field]: '' };
            const err = expectThrows(() => validateBlueprintAttributionPublication(bad),
                `5. rejects a missing ${field}`);
            assert(err instanceof BlueprintAttributionPublicationError, `6. ${field} rejection is a BlueprintAttributionPublicationError`);
        }
        expectThrows(() => validateBlueprintAttributionPublication({ ...validPkg, signature: null }),
            '7. rejects a missing signature');
        expectThrows(() => validateBlueprintAttributionPublication({ ...validPkg, signature: { ...validPkg.signature, signer: '' } }),
            '8. rejects a signature missing its own signer field');

        assert(validPkg.kind === BLUEPRINT_ATTRIBUTION_KIND, '9. the publication IS attribution.toJSON() — no separate envelope');
        assert(validPkg.schemaVersion === ATTRIBUTION_SCHEMA_VERSION, '10. carries the current schema version');
    }
    console.log('✓ Section A: BlueprintAttributionPublicationValidator — every malformed-publication rejection');

    // ---------------------------------------------------------------
    // Section B — BlueprintAttributionExchange
    // ---------------------------------------------------------------
    {
        const alice = makeReplica('Alice');
        const bob = makeReplica('Bob');

        const structure = farmstead();
        const fingerprint = deriveBlueprintFingerprint(structure);
        const aliceAttribution = alice.useCase.publish(structure);

        expectThrows(() => alice.exchange.exportAttribution(null), '11. exportAttribution() rejects a non-attribution');
        const pkg = alice.exchange.exportAttribution(aliceAttribution);
        assert(pkg.id === aliceAttribution.id && pkg.fingerprint === fingerprint,
            '12. exportAttribution() is a pure passthrough to toJSON()');

        // Bob imports Alice's publication into his OWN, completely
        // independent store.
        const imported = bob.exchange.importAttribution(pkg);
        assert(imported.isNew === true, '13. first import reports isNew: true');
        assert(imported.attribution.id === aliceAttribution.id, '14. imported attribution keeps its own id');
        assert(bob.store.has(fingerprint, aliceAttribution.id), '15. imported attribution actually landed in Bob\'s store');
        assert(alice.storage !== bob.storage, '16. Alice and Bob hold genuinely independent storage backends');

        // Re-importing the SAME publication is a safe no-op, never an error.
        const reimported = bob.exchange.importAttribution(pkg);
        assert(reimported.isNew === false, '17. re-importing the same publication reports isNew: false');
        assert(bob.store.list(fingerprint).length === 1, '18. re-import never duplicates storage');

        // Malformed / unverifiable publications are all rejected before persistence.
        const sizeBefore = bob.store.list(fingerprint).length;
        expectThrows(() => bob.exchange.importAttribution({ not: 'a publication' }),
            '19. rejects a structurally malformed publication');
        expectThrows(() => bob.exchange.importAttribution({ ...pkg, signature: null }),
            '20. rejects an unsigned publication');
        expectThrows(() => bob.exchange.importAttribution({ ...pkg, fingerprint: 'bp:tampered' }),
            '21. rejects a tampered publication (signature no longer verifies)');

        // Impostor: Charlie signs an attribution but attributes it to Alice's identity.
        const charlie = makeIdentity('Charlie');
        let impostor = new BlueprintAttribution({ fingerprint, authorIdentityId: alice.identity.getSigningIdentity().id });
        impostor = impostor.withSignature(charlie.signCanonical(impostor.getSigningDescriptor()));
        expectThrows(() => bob.exchange.importAttribution(impostor.toJSON()),
            '22. rejects an attribution signed by someone other than its own claimed author');

        assert(bob.store.list(fingerprint).length === sizeBefore,
            '23. not one malformed/unverifiable import added anything to Bob\'s store');

        // The critical rule: a cryptographically VALID signature is never
        // enough on its own — the fingerprint it carries must match what
        // the receiver can derive locally, when the receiver has
        // something local to check it against.
        const unrelatedStructure = farmstead({ id: 'unrelated', name: 'Barn' });
        const unrelatedFingerprint = deriveBlueprintFingerprint(unrelatedStructure);
        assert(!blueprintFingerprintsEqual(unrelatedFingerprint, fingerprint), 'sanity: fixtures really are different designs');
        const mismatchError = expectThrows(
            () => bob.exchange.importAttribution(alice.exchange.exportAttribution(bob.useCase.publish(structure)), { expectedFingerprint: unrelatedFingerprint }),
            '24. rejects a genuinely, cryptographically VALID attribution when its fingerprint does not match the caller\'s locally-derived one'
        );
        assert(/fingerprint/i.test(mismatchError.message), '25. the rejection names the fingerprint mismatch, not a signature failure');

        // A bare import with no local Structure to compare against is
        // still perfectly valid — the cross-check is opt-in via
        // expectedFingerprint, never mandatory.
        const carol = makeReplica('Carol');
        const bareImport = carol.exchange.importAttribution(pkg);
        assert(bareImport.isNew === true, '26. a bare import (no expectedFingerprint) still succeeds');

        // And a matching expectedFingerprint sails through unchanged.
        const dave = makeReplica('Dave');
        const confirmedImport = dave.exchange.importAttribution(pkg, { expectedFingerprint: fingerprint });
        assert(confirmedImport.isNew === true, '27. a matching expectedFingerprint import succeeds');
    }
    console.log('✓ Section B: BlueprintAttributionExchange — export/import/dedup/tamper/impersonation/fingerprint-mismatch');

    // ---------------------------------------------------------------
    // Section C — LocalBlueprintAttributionPublicationLog
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const log = new LocalBlueprintAttributionPublicationLog(storage);

        assert(log.getReceivedAt('bp:abc', 'never-seen') === null, '28. unknown id has no receivedAt');
        log.recordReceipt('bp:abc', 'attr-1');
        const first = log.getReceivedAt('bp:abc', 'attr-1');
        assert(typeof first === 'string' && first.length > 0, '29. recordReceipt() stamps an ISO timestamp');

        // First-seen-wins: re-recording never resets the timestamp.
        log.recordReceipt('bp:abc', 'attr-1');
        assert(log.getReceivedAt('bp:abc', 'attr-1') === first, '30. re-recording the same id never resets receivedAt');

        // Scoped per-fingerprint, exactly like the attribution store itself.
        assert(log.getReceivedAt('bp:other', 'attr-1') === null, '31. a different fingerprint has an independent, empty log');
    }
    console.log('✓ Section C: LocalBlueprintAttributionPublicationLog — receivedAt bookkeeping, first-seen-wins, per-fingerprint scoping');

    // ---------------------------------------------------------------
    // Section D — BlueprintPackage's new optional `attributions` field
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const structure = farmstead({ id: 'pkg-test' });
        const fingerprint = deriveBlueprintFingerprint(structure);
        let attribution = new BlueprintAttribution({ fingerprint, authorIdentityId: alice.getSigningIdentity().id });
        attribution = attribution.withSignature(alice.signCanonical(attribution.getSigningDescriptor()));

        // Omitted entirely — byte-identical to a pre-0.6.6 export.
        const plainPkg = buildBlueprintPackage(structure);
        assert(!('attributions' in plainPkg), '32. a package built with no attributions carries no attributions key at all');
        validateBlueprintPackage(plainPkg);

        // Present — round-trips through the validator too.
        const bundledPkg = buildBlueprintPackage(structure, { attributions: [attribution] });
        assert(Array.isArray(bundledPkg.attributions) && bundledPkg.attributions.length === 1,
            '33. a package built WITH attributions carries them');
        assert(bundledPkg.attributions[0].id === attribution.id, '34. bundled attribution is exactly attribution.toJSON()');
        assert(bundledPkg.kind === BLUEPRINT_KIND && bundledPkg.schemaVersion === BLUEPRINT_SCHEMA_VERSION,
            '35. bundling attributions never changes the package\'s own kind/schemaVersion');
        validateBlueprintPackage(bundledPkg); // never throws

        expectThrows(() => buildBlueprintPackage(structure, { attributions: [{ not: 'an attribution instance' }] }),
            '36. buildBlueprintPackage rejects an attributions entry that is not a real BlueprintAttribution instance');

        // The validator rejects a malformed bundled attribution too, with
        // its OWN error type, never leaking the attribution module's own.
        const brokenPkg = buildBlueprintPackage(structure, { attributions: [attribution] });
        brokenPkg.attributions[0].signature = null;
        const err = expectThrows(() => validateBlueprintPackage(brokenPkg),
            '37. rejects a package whose bundled attribution is structurally malformed');
        assert(err instanceof BlueprintPackageError, '38. the rejection is a BlueprintPackageError, not a BlueprintAttributionPublicationError');

        expectThrows(() => validateBlueprintPackage({ ...plainPkg, attributions: 'not-an-array' }),
            '39. rejects a non-array attributions field');

        // ExportBlueprintUseCase passes attributions straight through.
        const viaUseCase = new ExportBlueprintUseCase().execute(structure, { attributions: [attribution] });
        assert(JSON.stringify(viaUseCase) === JSON.stringify(bundledPkg),
            '40. ExportBlueprintUseCase.execute(structure, { attributions }) matches buildBlueprintPackage() exactly');

        // ImportBlueprintUseCase is UNCHANGED by this milestone — it still
        // only ever returns a Structure; reading pkg.attributions back out
        // is the caller's own job (see application/BlueprintAttributionExchange.js).
        const rebuiltStructure = new ImportBlueprintUseCase().execute(bundledPkg);
        assert(rebuiltStructure instanceof Structure, '41. ImportBlueprintUseCase still returns a plain Structure');
        assert(blueprintFingerprintsEqual(deriveBlueprintFingerprint(rebuiltStructure), fingerprint),
            '42. the imported Structure fingerprints identically to the one the bundled attribution is about');
    }
    console.log('✓ Section D: BlueprintPackage — optional attributions field builds, validates, and round-trips without disturbing the Structure-only shape');

    // ---------------------------------------------------------------
    // Section E — FLAGSHIP: Alice creates, attributes, and exports both;
    // Bob imports both under fresh ids and independently verifies them.
    // ---------------------------------------------------------------
    console.log('\n--- Decentralized Blueprint Exchange: flagship scenario ---');

    const alice = makeReplica('Alice');
    const bob = makeReplica('Bob');

    // Phase A — Alice creates "Farmstead," fingerprints it, and claims authorship.
    const aliceStructure = farmstead({ id: 'alice-local-id', name: "Alice's Farmstead" });
    const aliceFingerprint = deriveBlueprintFingerprint(aliceStructure);
    const aliceAttribution = alice.useCase.publish(aliceStructure);
    assert(aliceAttribution.fingerprint === aliceFingerprint, '43. PHASE A: Alice\'s attribution is for her own structure\'s own fingerprint');
    console.log('✓ Phase A: Alice created "Farmstead," derived its fingerprint, and claimed authorship');

    // Phase B — Alice exports BOTH the blueprint and her attribution, in
    // ONE package — two independent things, bundled for convenience.
    const sharePackage = new ExportBlueprintUseCase().execute(aliceStructure, { attributions: [aliceAttribution] });
    assert(sharePackage.kind === BLUEPRINT_KIND, '44. PHASE B: it is still an ordinary Blueprint Package');
    assert(sharePackage.attributions.length === 1 && sharePackage.attributions[0].id === aliceAttribution.id,
        '45. PHASE B: Alice\'s attribution travels alongside the design');
    const wireJSON = JSON.stringify(sharePackage);
    console.log('✓ Phase B: Alice exported "Farmstead" + her attribution as one portable package');

    // Phase C — Bob imports the blueprint. 0.4.6's own rule: every id
    // crossing the boundary regenerates.
    const bobPackage = JSON.parse(wireJSON);
    const bobStructure = new ImportBlueprintUseCase().execute(bobPackage);
    assert(bobStructure.id !== aliceStructure.id, '46. PHASE C: Bob\'s Structure has its own, independent local id');
    const bobFingerprint = deriveBlueprintFingerprint(bobStructure);
    assert(blueprintFingerprintsEqual(bobFingerprint, aliceFingerprint),
        '47. PHASE C: Bob\'s import fingerprints IDENTICALLY to Alice\'s original, despite a fully independent local id');
    console.log('✓ Phase C: Bob imported the blueprint under a fresh id and computed an identical fingerprint');

    // Phase D — Bob imports the bundled attribution, cross-checked
    // against his OWN, locally-derived fingerprint — never the one the
    // package merely claims.
    const attributionImportResult = bob.exchange.importAttribution(bobPackage.attributions[0], { expectedFingerprint: bobFingerprint });
    assert(attributionImportResult.isNew === true, '48. PHASE D: Bob\'s import of the bundled attribution is new to him');
    assert(bob.store.has(bobFingerprint, aliceAttribution.id), '49. PHASE D: the attribution is on file under Bob\'s own locally-derived fingerprint');
    const summaryAfterImport = bob.useCase.summarize(bobStructure);
    assert(summaryAfterImport.attributions.length === 1 && summaryAfterImport.attributions[0].authorIdentityId === aliceAttribution.authorIdentityId,
        '50. PHASE D: Bob sees Alice as an attributed author of his own imported copy');
    assert(summaryAfterImport.mine === null, '51. PHASE D: Alice\'s attribution is never "mine" for Bob');
    console.log('✓ Phase D: Bob imported and verified the bundled attribution against his own locally-derived fingerprint — Alice now shows as an attributed author');

    // Phase E — A tampered claimed fingerprint is rejected even with an
    // otherwise-valid signature: simulate a package whose `attributions`
    // entry was hand-edited to claim a DIFFERENT design than the one
    // actually bundled.
    const tamperedPackage = JSON.parse(wireJSON);
    tamperedPackage.attributions[0].fingerprint = 'bp:not-the-real-design';
    // The signature no longer verifies (fingerprint is part of the signed
    // payload) — rejected at the verification step, before the
    // fingerprint cross-check even runs.
    const freshReplica = makeReplica('Eve');
    expectThrows(() => freshReplica.exchange.importAttribution(tamperedPackage.attributions[0], { expectedFingerprint: bobFingerprint }),
        '52. PHASE E: a hand-edited fingerprint invalidates the signature — rejected before persistence');
    console.log('✓ Phase E: a hand-tampered attribution was rejected — signature and content are bound together');

    // Phase F — Bob modifies his own independent copy and publishes his
    // OWN attribution. Two identities, two independently-signed
    // attributions, same underlying design content Bob started from.
    bobStructure.bricks[0].position = new Position(9, 9, 9);
    const bobOwnFingerprint = deriveBlueprintFingerprint(bobStructure);
    assert(!blueprintFingerprintsEqual(bobOwnFingerprint, bobFingerprint),
        '53. PHASE F: modifying Bob\'s copy changes ITS OWN fingerprint — a derivative design');
    const bobAttribution = bob.useCase.publish(bobStructure);
    assert(bobAttribution.fingerprint === bobOwnFingerprint, '54. PHASE F: Bob\'s new attribution is for HIS modified design, a different fingerprint than Alice\'s original');
    console.log('✓ Phase F: Bob modified his copy and published his own attribution for the resulting, distinct design');

    // Phase G — Independence: none of Bob's activity ever touched Alice's
    // own replica.
    assert(alice.store.list(aliceFingerprint).length === 1, '55. PHASE G: Alice\'s own store still shows exactly her one attribution');
    assert(alice.store.list(aliceFingerprint)[0].id === aliceAttribution.id, '56. PHASE G: it is still exactly the attribution she originally published');
    assert(deriveBlueprintFingerprint(aliceStructure) === aliceFingerprint, '57. PHASE G: Alice\'s own original Structure is untouched — same fingerprint as ever');
    console.log('✓ Phase G: Alice\'s original blueprint and attribution were untouched by everything Bob did with his own copy');

    console.log('\nAll Decentralized Blueprint Exchange tests passed.');
}

// tests.html's `await import(file)` only reliably waits for a module's
// synchronous top-level evaluation — see every other test file's own
// closing comment on this — so this is invoked with top-level await,
// never fire-and-forget.
await run();
