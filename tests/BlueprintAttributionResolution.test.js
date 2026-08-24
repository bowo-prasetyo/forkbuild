import { Structure } from '../core/Structure.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { deriveBlueprintFingerprint, blueprintFingerprintsEqual } from '../core/BlueprintFingerprint.js';
import {
    attributionsForFingerprint, rankAttributionsByAuthor, attributionView, describeAttributionView
} from '../core/BlueprintAttributionView.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalBlueprintAttributionStore } from '../application/LocalBlueprintAttributionStore.js';
import { LocalBlueprintAttributionPublicationLog } from '../application/LocalBlueprintAttributionPublicationLog.js';
import { BlueprintAttributionUseCase } from '../application/BlueprintAttributionUseCase.js';
import { BlueprintAttributionExchange } from '../application/BlueprintAttributionExchange.js';
import { ExportBlueprintUseCase } from '../application/ExportBlueprintUseCase.js';
import { ImportBlueprintUseCase } from '../application/ImportBlueprintUseCase.js';

// 0.6.7 — Blueprint Attribution Resolution & Community Identity.
//
// 0.6.5 built the attribution MODEL and 0.6.6 built the EXCHANGE
// transport, but neither ever turned "a pile of signed attributions this
// replica happens to have on file" into something a person can actually
// read. This suite proves the missing derivation layer, mirroring
// tests/PlaceNamingClaims.test.js's/tests/PlaceNamingExchange.test.js's
// own shape one domain over:
//
//   Section A: core/BlueprintAttributionView.js — pure derivation,
//              distinct-author grouping, deterministic ranking
//   Section B: application/BlueprintAttributionUseCase.js#communityView() —
//              wiring, receivedAt attachment, summarize() untouched
//   Section C: FLAGSHIP — Alice, Bob, and Carol each independently claim
//              authorship of the SAME design; every replica exchanges
//              claims with every other in a different order, including
//              a redundant republish and duplicate re-imports; every
//              replica's own community attribution view — the set of
//              distinct authors and their claims — converges to
//              byte-identical, regardless of arrival order, duplicate
//              publications, export/import order, local Structure ids,
//              or Structure brick ids.
//
// See docs/Principles.md, "Attribution Resolution Ranks Presentation,
// Never Authorship (0.6.7)."

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

// One full local backend for one identity — store, log, verifier,
// use case (WITH the publication log wired in, the 0.6.7 constructor
// shape), and exchange, mirroring tests/BlueprintAttributionExchange.test.js's
// own makeReplica() but additionally threading `publicationLog` into
// BlueprintAttributionUseCase so communityView()'s receivedAt actually
// has something to read.
function makeReplica(label) {
    const storage = new InMemoryStorageProvider();
    const store = new LocalBlueprintAttributionStore(storage);
    const log = new LocalBlueprintAttributionPublicationLog(storage);
    const verifier = new LocalAuthorizationVerifier();
    const identity = makeIdentity(label);
    const useCase = new BlueprintAttributionUseCase(store, identity, verifier, log);
    const exchange = new BlueprintAttributionExchange(store, verifier, log);
    return { storage, store, log, verifier, identity, useCase, exchange };
}

// A serializable, viewer-independent summary of a communityView() result
// — authors and their claim ids only, deliberately EXCLUDING `mine` and
// `receivedAt`, which are correctly, intentionally different per viewer
// (see this file's own Section C header). This is what "the same
// community attribution view" actually means across replicas.
function communityShape(view) {
    return {
        fingerprint: view.fingerprint,
        authorCount: view.authorCount,
        authors: view.authors.map((a) => ({
            authorIdentityId: a.authorIdentityId,
            score: a.score,
            claimIds: a.claims.map((c) => c.id)
        })),
        claimIds: view.claims.map((c) => c.id)
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — core/BlueprintAttributionView.js: pure derivation
    // ---------------------------------------------------------------
    {
        assert(JSON.stringify(attributionsForFingerprint(null, [{ fingerprint: 'bp:a' }])) === '[]',
            '1. attributionsForFingerprint(null, ...) is always []');
        assert(JSON.stringify(attributionsForFingerprint('bp:a', null)) === '[]',
            '2. attributionsForFingerprint(fingerprint, non-array) is always []');
        assert(JSON.stringify(attributionsForFingerprint('bp:a', [null, undefined])) === '[]',
            '3. attributionsForFingerprint tolerates falsy entries');

        const raw = [
            { id: 'c1', fingerprint: 'bp:a', authorIdentityId: 'alice', createdAt: '2026-01-01T00:00:00.000Z' },
            { id: 'c2', fingerprint: 'bp:a', authorIdentityId: 'bob', createdAt: '2026-01-03T00:00:00.000Z' },
            { id: 'c3', fingerprint: 'bp:a', authorIdentityId: 'alice', createdAt: '2026-01-02T00:00:00.000Z' },
            { id: 'c4', fingerprint: 'bp:other', authorIdentityId: 'carol', createdAt: '2026-01-01T00:00:00.000Z' }
        ];
        const forA = attributionsForFingerprint('bp:a', raw);
        assert(forA.length === 3, '4. attributionsForFingerprint filters to exactly the matching fingerprint');
        assert(!forA.some((c) => c.id === 'c4'), '5. a claim for a different fingerprint is never included');

        const ranked = rankAttributionsByAuthor(forA);
        assert(ranked.length === 2, '6. rankAttributionsByAuthor groups by DISTINCT authorIdentityId, never raw claim count');
        assert(ranked[0].authorIdentityId === 'alice' && ranked[0].score === 2,
            '7. the author with more claims for this fingerprint ranks first');
        assert(ranked[0].claims[0].id === 'c3' && ranked[0].claims[1].id === 'c1',
            '8. within one author, claims are sorted most-recent-first');
        assert(ranked[1].authorIdentityId === 'bob' && ranked[1].score === 1, '9. the second author\'s own group is correct');

        // Deterministic tie-break: two authors with the same score sort by authorIdentityId.
        const tied = rankAttributionsByAuthor([
            { id: 't1', fingerprint: 'bp:t', authorIdentityId: 'zed', createdAt: '2026-01-01T00:00:00.000Z' },
            { id: 't2', fingerprint: 'bp:t', authorIdentityId: 'amy', createdAt: '2026-01-01T00:00:00.000Z' }
        ]);
        assert(tied[0].authorIdentityId === 'amy' && tied[1].authorIdentityId === 'zed',
            '10. tied scores break deterministically by authorIdentityId, never by discovery order');

        assert(JSON.stringify(rankAttributionsByAuthor([{ fingerprint: 'bp:x' }])) === '[]',
            '11. an attribution with no authorIdentityId is silently skipped, never throws');

        // attributionView() composes the two — null/empty fingerprint always degrades cleanly.
        const emptyView = attributionView(null, raw, 'alice');
        assert(emptyView.fingerprint === null && emptyView.authors.length === 0 && emptyView.authorCount === 0
            && emptyView.claims.length === 0 && emptyView.mine === null,
            '12. attributionView(null, ...) is a fully empty, non-throwing view');

        const view = attributionView('bp:a', raw, 'alice');
        assert(view.fingerprint === 'bp:a', '13. attributionView carries the fingerprint it was asked about');
        assert(view.authorCount === 2, '14. authorCount is the DISTINCT author count');
        assert(view.claims.length === 3 && view.claims[0].id === 'c2', '15. claims is every claim for this fingerprint, most recent first');
        assert(view.mine && view.mine.id === 'c3', '16. mine resolves to the CURRENT identity\'s own most recent claim');
        assert(attributionView('bp:a', raw, 'nobody-ever-claimed-this').mine === null,
            '17. mine is null for an identity with no claim on file');
        assert(attributionView('bp:a', raw, null).mine === null, '18. mine is null when no identity is signed in');

        assert(describeAttributionView(emptyView) === '', '19. describeAttributionView is empty for no attributions');
        assert(describeAttributionView(attributionView('bp:x', [
            { id: 'x1', fingerprint: 'bp:x', authorIdentityId: 'solo', createdAt: '2026-01-01T00:00:00.000Z' }
        ], null)) === 'Attributed to 1 author', '20. singular phrasing for exactly one author');
        assert(describeAttributionView(view) === 'Attributed to 2 authors', '21. plural phrasing for more than one');
        assert(describeAttributionView(null) === '', '22. describeAttributionView(null) never throws');
    }
    console.log('✓ Section A: core/BlueprintAttributionView.js — distinct-author grouping, deterministic ranking, presentation-only summaries');

    // ---------------------------------------------------------------
    // Section B — application/BlueprintAttributionUseCase.js#communityView()
    // ---------------------------------------------------------------
    {
        const alice = makeReplica('Alice');
        const bob = makeReplica('Bob');
        const structure = farmstead();
        const fingerprint = deriveBlueprintFingerprint(structure);

        const empty = alice.useCase.communityView(structure);
        assert(empty.fingerprint === fingerprint && empty.authorCount === 0 && empty.authors.length === 0
            && empty.claims.length === 0 && empty.mine === null && JSON.stringify(empty.receivedAt) === '{}',
            '23. communityView() on a fresh design is fully empty');
        assert(alice.useCase.communityView(null).fingerprint === null, '24. communityView(null) degrades cleanly, never throws');

        const aliceAttribution = alice.useCase.publish(structure);
        const afterFirstPublish = alice.useCase.communityView(structure);
        assert(afterFirstPublish.authorCount === 1 && afterFirstPublish.authors[0].score === 1,
            '25. publishing once yields exactly one author with one claim');
        assert(afterFirstPublish.mine && afterFirstPublish.mine.id === aliceAttribution.id,
            '26. mine identifies the identity\'s own just-published claim');
        assert(afterFirstPublish.receivedAt[aliceAttribution.id] === null,
            '27. a self-published claim was never "received" — receivedAt is null, not a fabricated timestamp');

        // A redundant republish by the SAME identity — a second, distinct
        // BlueprintAttribution id, same authorIdentityId — never inflates
        // authorCount, only that one author's own score.
        const aliceSecondAttribution = alice.useCase.publish(structure);
        assert(aliceSecondAttribution.id !== aliceAttribution.id, '28. sanity: a republish really is a distinct attribution id');
        const afterRepublish = alice.useCase.communityView(structure);
        assert(afterRepublish.authorCount === 1, '29. republishing under the SAME identity never inflates authorCount');
        assert(afterRepublish.authors[0].score === 2, '30. but it does increase that one author\'s own claim count');

        // summarize() — the pre-0.6.7 method — stays completely
        // unchanged: same raw attributions, never reads the publication
        // log, never gains a `view`/`receivedAt` field.
        const summary = alice.useCase.summarize(structure);
        assert(summary.attributions.length === 2 && summary.mine.id === aliceSecondAttribution.id,
            '31. summarize() is untouched — still the flat, unranked read every existing caller relies on');
        assert(!('view' in summary) && !('receivedAt' in summary), '32. summarize()\'s own return shape gained no new fields');

        // Bob independently authors his own copy and publishes; Alice
        // imports Bob's publication through the REAL exchange transport
        // — this is what actually exercises receivedAt.
        const bobStructure = farmstead({ id: 'bob-copy' });
        assert(blueprintFingerprintsEqual(deriveBlueprintFingerprint(bobStructure), fingerprint),
            'sanity: Bob\'s independent copy fingerprints identically');
        const bobAttribution = bob.useCase.publish(bobStructure);
        const imported = alice.exchange.importAttribution(bob.exchange.exportAttribution(bobAttribution), { expectedFingerprint: fingerprint });
        assert(imported.isNew === true, '33. sanity: Bob\'s attribution really is new to Alice\'s replica');

        const afterImport = alice.useCase.communityView(structure);
        assert(afterImport.authorCount === 2, '34. importing a second identity\'s claim raises authorCount to 2');
        const bobEntry = afterImport.authors.find((a) => a.authorIdentityId === bobAttribution.authorIdentityId);
        assert(bobEntry && bobEntry.score === 1, '35. the imported author shows up with their own correct score');
        assert(typeof afterImport.receivedAt[bobAttribution.id] === 'string' && afterImport.receivedAt[bobAttribution.id].length > 0,
            '36. a RECEIVED claim carries a real receivedAt timestamp');
        assert(afterImport.receivedAt[aliceAttribution.id] === null,
            '37. Alice\'s own claims are still never "received" even after an unrelated import');

        // A use case constructed WITHOUT a publication log (the pre-0.6.7,
        // 3-argument shape every existing call site still uses) degrades
        // gracefully rather than throwing.
        const legacyStorage = new InMemoryStorageProvider();
        const legacyStore = new LocalBlueprintAttributionStore(legacyStorage);
        const legacyVerifier = new LocalAuthorizationVerifier();
        const legacyIdentity = makeIdentity('Legacy');
        const legacyUseCase = new BlueprintAttributionUseCase(legacyStore, legacyIdentity, legacyVerifier);
        legacyUseCase.publish(structure);
        const legacyView = legacyUseCase.communityView(structure);
        assert(legacyView.authorCount === 1 && JSON.stringify(legacyView.receivedAt) === '{}',
            '38. no publicationLog wired in at all still works — receivedAt stays empty rather than throwing');
    }
    console.log('✓ Section B: application/BlueprintAttributionUseCase.js#communityView() — wiring, receivedAt attachment, summarize() untouched');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: three independent authors converge on one
    // identical community attribution view, regardless of arrival order.
    // ---------------------------------------------------------------
    console.log('\n--- Blueprint Attribution Resolution: flagship convergence scenario ---');

    const alice = makeReplica('Alice');
    const bob = makeReplica('Bob');
    const carol = makeReplica('Carol');

    // Phase A — Alice authors "Farmstead" and exports it; Bob and Carol
    // each import it independently through the REAL 0.4.6 export/import
    // boundary, which mints each of them a fully independent Structure
    // id and fully independent brick ids. All three then claim
    // authorship of their own copy under their own identity.
    const aliceStructure = farmstead({ id: 'alice-original' });
    const fingerprint = deriveBlueprintFingerprint(aliceStructure);
    const blueprintWire = JSON.stringify(new ExportBlueprintUseCase().execute(aliceStructure));
    const bobStructure = new ImportBlueprintUseCase().execute(JSON.parse(blueprintWire));
    const carolStructure = new ImportBlueprintUseCase().execute(JSON.parse(blueprintWire));
    assert(bobStructure.id !== aliceStructure.id && carolStructure.id !== aliceStructure.id && bobStructure.id !== carolStructure.id,
        '39a. PHASE A: the export/import boundary minted three fully independent local Structure ids');
    assert(blueprintFingerprintsEqual(deriveBlueprintFingerprint(bobStructure), fingerprint)
        && blueprintFingerprintsEqual(deriveBlueprintFingerprint(carolStructure), fingerprint),
        '39. PHASE A: all three independently-imported copies share one design identity');

    const aliceAttribution = alice.useCase.publish(aliceStructure);
    const bobAttribution = bob.useCase.publish(bobStructure);
    const carolAttribution = carol.useCase.publish(carolStructure);
    // Alice also redundantly republishes — a second, distinct signed
    // claim under her own identity, exactly the "same author shouts
    // twice" case this milestone's own header names.
    const aliceRepublish = alice.useCase.publish(aliceStructure);
    console.log('✓ Phase A: Alice, Bob, and Carol each independently claimed authorship; Alice additionally republished');

    // Phase B — export every publication once, as plain portable JSON —
    // exactly what would cross a real wire.
    const alicePkg1 = alice.exchange.exportAttribution(aliceAttribution);
    const alicePkg2 = alice.exchange.exportAttribution(aliceRepublish);
    const bobPkg = bob.exchange.exportAttribution(bobAttribution);
    const carolPkg = carol.exchange.exportAttribution(carolAttribution);
    console.log('✓ Phase B: every claim exported as a portable publication');

    // Phase C — every replica imports every OTHER replica's claims, each
    // in a DIFFERENT order, with Bob additionally re-importing Carol's
    // publication a second time (a duplicate the ordinary gossip
    // transport would produce) and Carol importing Alice's republished
    // claim before her original one.
    alice.exchange.importAttribution(bobPkg, { expectedFingerprint: fingerprint });
    alice.exchange.importAttribution(carolPkg, { expectedFingerprint: fingerprint });

    bob.exchange.importAttribution(carolPkg, { expectedFingerprint: fingerprint });
    bob.exchange.importAttribution(alicePkg2, { expectedFingerprint: fingerprint });
    bob.exchange.importAttribution(alicePkg1, { expectedFingerprint: fingerprint });
    const duplicateImport = bob.exchange.importAttribution(carolPkg, { expectedFingerprint: fingerprint });
    assert(duplicateImport.isNew === false, '40. PHASE C: re-importing the same publication a second time is recognized as not-new');

    carol.exchange.importAttribution(alicePkg2, { expectedFingerprint: fingerprint });
    carol.exchange.importAttribution(alicePkg1, { expectedFingerprint: fingerprint });
    carol.exchange.importAttribution(bobPkg, { expectedFingerprint: fingerprint });
    console.log('✓ Phase C: every replica imported every other replica\'s claims, each in its own order, including one duplicate re-import');

    // Phase D — every replica now derives its OWN community attribution
    // view from its OWN local Structure copy. Despite fully independent
    // local Structure ids, fully independent brick ids, different
    // arrival order, and one duplicate import, the COMMUNITY shape —
    // which identities are attributed, how many claims each has, and
    // which claim ids exist — is byte-identical everywhere.
    const aliceView = alice.useCase.communityView(aliceStructure);
    const bobView = bob.useCase.communityView(bobStructure);
    const carolView = carol.useCase.communityView(carolStructure);

    assert(aliceView.authorCount === 3, '41. PHASE D: three distinct authors, never four — Alice\'s republish never counted twice');
    const aliceShape = JSON.stringify(communityShape(aliceView));
    const bobShape = JSON.stringify(communityShape(bobView));
    const carolShape = JSON.stringify(communityShape(carolView));
    assert(aliceShape === bobShape && bobShape === carolShape,
        '42. PHASE D: every replica\'s own community attribution view converges to an identical shape');

    const aliceEntry = aliceView.authors.find((a) => a.authorIdentityId === aliceAttribution.authorIdentityId);
    assert(aliceEntry.score === 2, '43. PHASE D: Alice\'s own entry correctly shows 2 supporting claims (original + republish), everywhere');
    console.log('✓ Phase D: Alice, Bob, and Carol\'s independently-derived community attribution views are identical — 3 authors, Alice at 2 claims');

    // Phase E — each viewer's OWN "mine" and "receivedAt" are correctly,
    // deliberately DIFFERENT, precisely because those two fields are
    // viewer-relative facts, never part of the shared community view
    // compared above.
    assert(aliceView.mine && aliceView.mine.authorIdentityId === aliceAttribution.authorIdentityId,
        '44. PHASE E: Alice sees her OWN claim as "mine"');
    assert(bobView.mine && bobView.mine.authorIdentityId === bobAttribution.authorIdentityId,
        '45. PHASE E: Bob sees HIS OWN claim as "mine", never Alice\'s or Carol\'s');
    assert(carolView.mine && carolView.mine.authorIdentityId === carolAttribution.authorIdentityId,
        '46. PHASE E: Carol likewise sees only her own claim as "mine"');
    assert(aliceView.receivedAt[bobAttribution.id] !== null && aliceView.receivedAt[aliceAttribution.id] === null,
        '47. PHASE E: Alice\'s receivedAt is populated for claims she imported, null for her own');
    assert(bobView.receivedAt[carolAttribution.id] !== null && bobView.receivedAt[bobAttribution.id] === null,
        '48. PHASE E: Bob\'s receivedAt is independently populated for what HE imported, null for his own');
    console.log('✓ Phase E: "mine" and "receivedAt" stay correctly viewer-relative even though the community view itself converged');

    // Phase F — none of this touched local Structure identity or brick
    // identity at all; every replica's own Structure instance is exactly
    // as it always was.
    assert(aliceStructure.id === 'alice-original' && bobStructure.id !== aliceStructure.id && carolStructure.id !== aliceStructure.id,
        '49. PHASE F: local Structure ids were never touched by any of this claim traffic');
    assert(blueprintFingerprintsEqual(deriveBlueprintFingerprint(aliceStructure), fingerprint),
        '50. PHASE F: Alice\'s own Structure still fingerprints identically after everything above');
    console.log('✓ Phase F: local Structure identity stayed exactly as disposable as ever — only the fingerprint-scoped community view converged');

    console.log('\nAll Blueprint Attribution Resolution tests passed.');
}

// tests.html's `await import(file)` only reliably waits for a module's
// synchronous top-level evaluation — see every other test file's own
// closing comment on this — so this is invoked with top-level await,
// never fire-and-forget.
await run();
