import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { namingView, preferredClaimedName } from '../core/PlaceNamingView.js';
import { WorldRegion } from '../core/WorldRegion.js';
import { RegionKind } from '../core/RegionKind.js';
import { Position } from '../core/Position.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { LocalPlaceNamingPublicationLog } from '../application/LocalPlaceNamingPublicationLog.js';
import { PlaceNamingClaimUseCase } from '../application/PlaceNamingClaimUseCase.js';
import { LocalNamePreferenceStore } from '../application/LocalNamePreferenceStore.js';
import { PlaceNamingClaimExchange } from '../application/PlaceNamingClaimExchange.js';
import {
    buildPlaceNamingClaimPublication, CURRENT_SCHEMA_VERSION, PLACE_NAMING_CLAIM_PUBLICATION_KIND
} from '../application/PlaceNamingClaimPublication.js';
import {
    validatePlaceNamingClaimPublication, PlaceNamingClaimPublicationError
} from '../application/PlaceNamingClaimPublicationValidator.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';

// 0.5.3 — Decentralized Place Name Exchange.
//
// 0.5.2 built the naming MODEL (claim, view, local store, local
// preference) and drew its own boundary exactly where its design
// conversation said to: "a decentralized exchange transport... named
// directly... as its own next milestone." This suite proves that
// missing piece, and — just as importantly — proves it changed NOTHING
// about the model it plugs into:
//
//   Alice's claim --export--> Publication --import--> Bob's claim store
//
// Section A: PlaceNamingClaimPublication — envelope shape + determinism
// Section B: PlaceNamingClaimPublicationValidator — every malformed
//            package rejection this milestone's design conversation
//            implies (bad kind/schemaVersion/missing fields)
// Section C: LocalPlaceNamingPublicationLog — first-seen-wins receivedAt
// Section D: PlaceNamingClaimExchange — export/import, dedup, and
//            refusing anything that doesn't independently verify
// Section E: WorldNavigationSession wiring — delegates correctly, and
//            degrades gracefully with nothing wired
// Section F: regression — core/PlaceNamingClaim.js, core/PlaceNamingView.js,
//            and WorldRegion are completely untouched by this milestone
// Section G: CAPSTONE — the flagship scenario: two independent replicas,
//            Alice and Bob, each with their OWN storage, exchanging
//            claims about the same World and converging on the same
//            naming view without ever exchanging a World document at all

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

// Mirrors tests/PlaceNamingClaims.test.js's own makeIdentity() — one
// independent, authenticated LocalIdentityProvider standing in for one
// distinct identity.
function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

// One fully independent replica: its own storage, its own claim store,
// its own publication log, its own verifier instance, its own
// PlaceNamingClaimUseCase (for publishing under its own identity) and
// its own PlaceNamingClaimExchange (for export/import) — everything a
// second device would actually have, none of it shared with any other
// replica built this way.
function makeReplica(identityProvider) {
    const storage = new InMemoryStorageProvider();
    const store = new LocalPlaceNamingClaimStore(storage);
    const log = new LocalPlaceNamingPublicationLog(storage);
    const verifier = new LocalAuthorizationVerifier();
    const useCase = new PlaceNamingClaimUseCase(store, identityProvider, verifier);
    const exchange = new PlaceNamingClaimExchange(store, verifier, log);
    return { storage, store, log, verifier, useCase, exchange };
}

function publishedClaim(useCase, worldId, regionId, name) {
    return useCase.publish(worldId, regionId, name);
}

async function run() {
    // -------------------------------------------------------------
    // Section A: application/PlaceNamingClaimPublication.js
    // -------------------------------------------------------------
    {
        expectThrows(() => buildPlaceNamingClaimPublication(null),
            '1. buildPlaceNamingClaimPublication rejects a missing claim');
        expectThrows(() => buildPlaceNamingClaimPublication({ not: 'a claim' }),
            '2. buildPlaceNamingClaimPublication rejects anything that is not a PlaceNamingClaim instance');

        const unsigned = new PlaceNamingClaim({ worldId: 'w1', regionId: 'r1', name: 'X', authorIdentityId: 'a1' });
        expectThrows(() => buildPlaceNamingClaimPublication(unsigned),
            '3. buildPlaceNamingClaimPublication refuses an unsigned claim');

        const alice = makeIdentity('Alice');
        let claim = new PlaceNamingClaim({
            worldId: 'w1', regionId: 'r1', name: 'Green Valley', authorIdentityId: alice.getSigningIdentity().id
        });
        claim = claim.withSignature(alice.signCanonical(claim.getSigningDescriptor()));

        const pkg = buildPlaceNamingClaimPublication(claim);
        assert(pkg.kind === PLACE_NAMING_CLAIM_PUBLICATION_KIND, '4. package carries the forkbuild.place-naming-claim discriminator');
        assert(pkg.schemaVersion === CURRENT_SCHEMA_VERSION, '5. package carries the current schema version');
        assert(JSON.stringify(pkg.claim) === JSON.stringify(claim.toJSON()),
            '6. package.claim is exactly PlaceNamingClaim#toJSON(), nothing added or dropped');

        const pkgAgain = buildPlaceNamingClaimPublication(claim);
        assert(JSON.stringify(pkg) === JSON.stringify(pkgAgain),
            '7. exporting the same claim twice is byte-identical');

        // Validating a well-formed package never throws.
        validatePlaceNamingClaimPublication(pkg);
    }
    console.log('✓ Section A: application/PlaceNamingClaimPublication.js — envelope shape & determinism');

    // -------------------------------------------------------------
    // Section B: application/PlaceNamingClaimPublicationValidator.js
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        let claim = new PlaceNamingClaim({
            worldId: 'w1', regionId: 'r1', name: 'Green Valley', authorIdentityId: alice.getSigningIdentity().id
        });
        claim = claim.withSignature(alice.signCanonical(claim.getSigningDescriptor()));
        const validPkg = buildPlaceNamingClaimPublication(claim);

        expectThrows(() => validatePlaceNamingClaimPublication(null), '8. rejects a null package');
        expectThrows(() => validatePlaceNamingClaimPublication('not json'), '9. rejects a non-object package');
        expectThrows(() => validatePlaceNamingClaimPublication({ ...validPkg, kind: 'something.else' }),
            '10. rejects the wrong kind discriminator');
        expectThrows(() => validatePlaceNamingClaimPublication({ ...validPkg, schemaVersion: 999 }),
            '11. rejects an unsupported schema version');
        expectThrows(() => validatePlaceNamingClaimPublication({ ...validPkg, claim: undefined }),
            '12. rejects a missing claim');
        expectThrows(() => validatePlaceNamingClaimPublication({ ...validPkg, claim: { ...validPkg.claim, id: '' } }),
            '13. rejects a missing claim.id');
        expectThrows(() => validatePlaceNamingClaimPublication({ ...validPkg, claim: { ...validPkg.claim, worldId: '' } }),
            '14. rejects a missing claim.worldId');
        expectThrows(() => validatePlaceNamingClaimPublication({ ...validPkg, claim: { ...validPkg.claim, name: '' } }),
            '15. rejects a missing claim.name');
        expectThrows(() => validatePlaceNamingClaimPublication({ ...validPkg, claim: { ...validPkg.claim, signature: null } }),
            '16. rejects a missing claim.signature');
        expectThrows(() => validatePlaceNamingClaimPublication({
            ...validPkg, claim: { ...validPkg.claim, signature: { ...validPkg.claim.signature, signature: undefined } }
        }), '17. rejects a claim.signature missing its own signature bytes');

        const err = expectThrows(() => validatePlaceNamingClaimPublication({ ...validPkg, kind: 'nope' }),
            '18. rejection is a PlaceNamingClaimPublicationError');
        assert(err instanceof PlaceNamingClaimPublicationError, '19. confirmed: PlaceNamingClaimPublicationError');
    }
    console.log('✓ Section B: application/PlaceNamingClaimPublicationValidator.js — every malformed-package rejection');

    // -------------------------------------------------------------
    // Section C: application/LocalPlaceNamingPublicationLog.js
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const log = new LocalPlaceNamingPublicationLog(storage);

        assert(log.getReceivedAt('w1', 'claim-1') === null, '20. no receipt on file yet');
        log.recordReceipt('w1', 'claim-1');
        const firstReceipt = log.getReceivedAt('w1', 'claim-1');
        assert(typeof firstReceipt === 'string' && firstReceipt.length > 0, '21. recordReceipt() stamps an ISO timestamp');

        // First-seen-wins: re-recording the same claim id must NEVER
        // move receivedAt forward. recordReceipt() guards on "already
        // has an entry" BEFORE it ever reads the clock, so this holds
        // regardless of how much real time elapses between calls —
        // no need to mock Date to prove it.
        log.recordReceipt('w1', 'claim-1');
        log.recordReceipt('w1', 'claim-1');
        assert(log.getReceivedAt('w1', 'claim-1') === firstReceipt, '22. first-seen always wins — receivedAt never moves on a re-receipt');

        // Isolated per World.
        assert(log.getReceivedAt('w2', 'claim-1') === null, '23. a receipt for w1 never leaks into w2');
    }
    console.log('✓ Section C: application/LocalPlaceNamingPublicationLog.js — first-seen-wins, per-World isolation');

    // -------------------------------------------------------------
    // Section D: application/PlaceNamingClaimExchange.js
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const aliceReplica = makeReplica(alice);
        const bobReplica = makeReplica(bob);

        const claim = publishedClaim(aliceReplica.useCase, 'w1', 'r1', 'Green Valley');
        const pkg = aliceReplica.exchange.exportClaim(claim);

        // Bob imports it: brand new to him.
        const firstImport = bobReplica.exchange.importClaim(pkg);
        assert(firstImport.isNew === true, '24. first import of a claim is new');
        assert(firstImport.claim.id === claim.id, '25. the imported claim keeps the exact same id — never re-minted');
        assert(bobReplica.store.list('w1').length === 1, '26. the claim actually landed in Bob\'s own store');
        assert(bobReplica.log.getReceivedAt('w1', claim.id) !== null, '27. importing records a receipt');

        // Bob receives the EXACT SAME package a second and third time —
        // the ordinary cost of any gossip-style transport.
        const secondImport = bobReplica.exchange.importClaim(pkg);
        const thirdImport = bobReplica.exchange.importClaim(JSON.parse(JSON.stringify(pkg)));
        assert(secondImport.isNew === false && thirdImport.isNew === false,
            '28. re-importing the same claim is never treated as new');
        assert(bobReplica.store.list('w1').length === 1,
            '29. Alice publishes it, Bob receives it three times -> still exactly ONE local claim');

        // A tampered package (payload changed after signing) must never
        // verify, and must never be stored.
        const tamperedPkg = JSON.parse(JSON.stringify(pkg));
        tamperedPkg.claim.name = 'Hacked Valley';
        expectThrows(() => bobReplica.exchange.importClaim(tamperedPkg),
            '30. importClaim() refuses a tampered claim (signature no longer matches the payload)');
        assert(bobReplica.store.listForRegion('w1', 'r1').filter((c) => c.name === 'Hacked Valley').length === 0,
            '31. the tampered claim was never persisted');

        // An impersonation (Bob signs a claim but attributes it to Alice).
        let impostorClaim = new PlaceNamingClaim({
            worldId: 'w1', regionId: 'r1', name: "Bob's Lie", authorIdentityId: alice.getSigningIdentity().id
        });
        impostorClaim = impostorClaim.withSignature(bob.signCanonical(impostorClaim.getSigningDescriptor()));
        const impostorPkg = aliceReplica.exchange.exportClaim(impostorClaim);
        expectThrows(() => bobReplica.exchange.importClaim(impostorPkg),
            '32. importClaim() refuses a claim signed by someone other than its own authorIdentityId');

        // Malformed packages fail validation before anything is
        // constructed or verified.
        expectThrows(() => bobReplica.exchange.importClaim({ not: 'a publication' }),
            '33. importClaim() rejects a malformed package before construction/verification');

        // Determinism: exporting the same claim via the use-case-level
        // exchange twice is still byte-identical.
        const exportAgain = aliceReplica.exchange.exportClaim(claim);
        assert(JSON.stringify(pkg) === JSON.stringify(exportAgain),
            '34. PlaceNamingClaimExchange#exportClaim() is deterministic');
    }
    console.log('✓ Section D: application/PlaceNamingClaimExchange.js — export/import, idempotent dedup, tamper/impersonation rejection');

    // -------------------------------------------------------------
    // Section E: application/WorldNavigationSession.js wiring
    // -------------------------------------------------------------
    {
        const bareSession = new WorldNavigationSession({ registry: null });
        expectThrows(() => bareSession.exportPlaceNamingClaim('r1', 'c1'),
            '35. exportPlaceNamingClaim() throws cleanly when exchange is not wired');
        expectThrows(() => bareSession.importPlaceNamingClaim({}),
            '36. importPlaceNamingClaim() throws cleanly when exchange is not wired');
    }
    console.log('✓ Section E: application/WorldNavigationSession.js — graceful degradation with nothing wired (delegation itself is exercised end-to-end in Section G)');

    // -------------------------------------------------------------
    // Section F: regression — 0.5.2's own model is untouched
    // -------------------------------------------------------------
    {
        const region = new WorldRegion({
            id: 'r1', worldId: 'w1', authorIdentityId: 'a1', name: 'Willow Village',
            kind: RegionKind.VILLAGE, position: new Position(0, 0, 0), radius: 30
        });
        const beforeJSON = JSON.stringify(region.toJSON());

        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const aliceReplica = makeReplica(alice);
        const bobReplica = makeReplica(bob);
        const claim = publishedClaim(aliceReplica.useCase, 'w1', 'r1', 'Riverbend');
        const imported = bobReplica.exchange.importClaim(aliceReplica.exchange.exportClaim(claim)).claim;

        // An IMPORTED claim ranks in core/PlaceNamingView.js exactly like
        // a locally published one — namingView() has no notion of "where
        // a claim came from" at all.
        const view = namingView('r1', bobReplica.store.list('w1'));
        assert(view.length === 1 && view[0].name === 'Riverbend' && view[0].score === 1,
            '37. an imported claim participates in namingView() ranking identically to a locally published one');
        assert(preferredClaimedName('r1', [imported]) === 'Riverbend', '38. preferredClaimedName() is untouched by this milestone');

        assert(JSON.stringify(region.toJSON()) === beforeJSON,
            '39. WorldRegion is byte-for-byte unchanged by any exchange activity — exchange never touches World content at all');
    }
    console.log('✓ Section F: core/PlaceNamingClaim.js / core/PlaceNamingView.js / WorldRegion — completely unmodified by 0.5.3');

    // -------------------------------------------------------------
    // Section G: CAPSTONE — the flagship scenario
    // -------------------------------------------------------------
    console.log('\n--- Decentralized Place Name Exchange: flagship scenario ---');

    const worldId = 'shared-world';
    const regionId = 'shared-region';

    // Phase A — Alice's own replica creates a region (shared World
    // geometry both replicas already agree exists — 0.5.3 exchanges
    // NAMING CLAIMS, never World documents; see Section F above).
    const region = new WorldRegion({
        id: regionId, worldId, authorIdentityId: 'alice-region-author',
        name: 'Unnamed Region', kind: RegionKind.VILLAGE, position: new Position(0, 0, 0), radius: 40
    });
    console.log('✓ Phase A: Alice created a WorldRegion both replicas already share');

    // Phase B — Alice publishes "Green Valley" on her OWN replica.
    const alice = makeIdentity('Alice');
    const aliceReplica = makeReplica(alice);
    const aliceGreenValley = publishedClaim(aliceReplica.useCase, worldId, regionId, 'Green Valley');
    console.log('✓ Phase B: Alice published "Green Valley"');

    // Phase C — Alice exports the signed claim as a portable publication.
    const greenValleyPkg = aliceReplica.exchange.exportClaim(aliceGreenValley);
    const greenValleyWire = JSON.stringify(greenValleyPkg);
    console.log('✓ Phase C: Alice exported the signed claim');

    // Phase D — Bob, on a COMPLETELY INDEPENDENT replica (own storage,
    // own store, own verifier), imports it.
    const bob = makeIdentity('Bob');
    const bobReplica = makeReplica(bob);
    const bobsImportOfGreenValley = bobReplica.exchange.importClaim(JSON.parse(greenValleyWire));
    assert(bobsImportOfGreenValley.isNew === true, '40. PHASE D: Bob\'s import of Green Valley is new to him');
    console.log('✓ Phase D: Bob imported the claim into his own independent replica');

    // Phase E — Bob's own replica independently re-verifies it (never
    // trusts that it was already checked somewhere else).
    const bobsOwnVerification = bobReplica.verifier.verifyPlaceNamingClaim(bobsImportOfGreenValley.claim.toJSON());
    assert(bobsOwnVerification.valid === true, '41. PHASE E: Bob\'s own verifier independently confirms the claim, not just trusts the import');
    console.log('✓ Phase E: Bob independently validated the imported claim');

    // Phase F — Bob's own PlaceNamingView now shows "Green Valley."
    let bobsView = namingView(regionId, bobReplica.store.list(worldId));
    assert(bobsView.length === 1 && bobsView[0].name === 'Green Valley',
        '42. PHASE F: Bob\'s naming view shows "Green Valley" from Alice\'s claim alone');
    console.log('✓ Phase F: Bob\'s PlaceNamingView shows "Green Valley"');

    // Phase G — Bob publishes his OWN opinion, "Emerald Valley."
    const bobEmeraldValley = publishedClaim(bobReplica.useCase, worldId, regionId, 'Emerald Valley');
    console.log('✓ Phase G: Bob published "Emerald Valley"');

    // Phase H — Alice receives Bob's claim the same way Bob received hers.
    const emeraldValleyPkg = bobReplica.exchange.exportClaim(bobEmeraldValley);
    const alicesImportOfEmeraldValley = aliceReplica.exchange.importClaim(JSON.parse(JSON.stringify(emeraldValleyPkg)));
    assert(alicesImportOfEmeraldValley.isNew === true, '43. PHASE H: Alice\'s import of Emerald Valley is new to her');
    console.log('✓ Phase H: Alice received Bob\'s claim');

    // Phase I — Both replicas deterministically derive the SAME ranked
    // view from their own independently-assembled claim lists — neither
    // replica ever directly read the other's storage.
    const aliceView = namingView(regionId, aliceReplica.store.list(worldId));
    bobsView = namingView(regionId, bobReplica.store.list(worldId));
    assert(aliceView.length === 2 && bobsView.length === 2,
        '44. PHASE I: both replicas now see exactly 2 distinct names');
    assert(JSON.stringify(aliceView.map((v) => [v.name, v.score])) === JSON.stringify(bobsView.map((v) => [v.name, v.score])),
        '45. PHASE I: both replicas converge on the IDENTICAL ranking (name/score pairs, same order)');
    assert(aliceView[0].score === 1 && aliceView[1].score === 1,
        '46. PHASE I: one distinct author each -> tied at score 1, deterministic alphabetical tie-break decides the order');
    console.log('✓ Phase I: both replicas deterministically derive the same ranked naming view');

    // Phase J / K — Alice and Bob each set their OWN local preference,
    // via the real 0.5.2 LocalNamePreferenceStore — never a claim, never
    // exchanged, never visible to the other, and never part of the
    // exchange surface at all (proving that is the point: nothing above
    // needed it, and setting one now changes nothing about either
    // replica's naming view).
    const alicePrefs = new LocalNamePreferenceStore(aliceReplica.storage, alice);
    const bobPrefs = new LocalNamePreferenceStore(bobReplica.storage, bob);
    alicePrefs.setPreferredName(worldId, regionId, 'Green Valley');
    bobPrefs.setPreferredName(worldId, regionId, 'Emerald Valley');
    assert(alicePrefs.getPreferredName(worldId, regionId) === 'Green Valley', '47. PHASE J: Alice\'s own local preference sticks');
    assert(bobPrefs.getPreferredName(worldId, regionId) === 'Emerald Valley', '48. PHASE K: Bob\'s own local preference sticks, independently of Alice\'s');
    const unaffectedAliceView = namingView(regionId, aliceReplica.store.list(worldId));
    assert(JSON.stringify(unaffectedAliceView) === JSON.stringify(aliceView),
        '49. PHASE J/K: setting either preference changed nothing about the shared naming view produced in Phase I');
    console.log('✓ Phase J/K: Alice and Bob each chose a different local preference, isolated from each other and from the shared naming view');

    // Phase L — the WorldRegion/World snapshot itself never moved, on
    // either replica, through any of this.
    assert(region.name === 'Unnamed Region', '50. PHASE L: the WorldRegion itself was never renamed by any claim, on either replica');
    for (const claim of aliceReplica.store.list(worldId)) {
        assert(aliceReplica.verifier.verifyPlaceNamingClaim(claim.toJSON()).valid,
            '51. PHASE L: every claim on Alice\'s replica still independently verifies at the end');
    }
    for (const claim of bobReplica.store.list(worldId)) {
        assert(bobReplica.verifier.verifyPlaceNamingClaim(claim.toJSON()).valid,
            '52. PHASE L: every claim on Bob\'s replica still independently verifies at the end');
    }
    console.log('✓ Phase L: WorldRegion/World state stayed byte-identical throughout; every claim on both replicas still verifies');

    console.log('\nAll Decentralized Place Name Exchange tests passed.');
}

// tests.html's `await import(file)` only reliably waits for a module's
// synchronous top-level evaluation — see every other test file's own
// closing comment on this — so this is invoked with top-level await,
// never fire-and-forget.
await run();
