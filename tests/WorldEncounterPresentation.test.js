import {
    describeWorldEncounterPresentation,
    describeWorldEncounterPresentationSourceFamily,
    WorldEncounterPresentationSourceFamily
} from '../application/WorldEncounterPresentation.js';
import { LOCAL_WORLD_DISCOVERY_ORIGIN } from '../application/WorldEncounterIntegration.js';

// 0.9.176 — World Snapshot Presentation.
//
// Unit coverage for the one new pure module this milestone introduces:
// `application/WorldEncounterPresentation.js`. See that file's own header
// for the full rationale — a plain join of an already-computed
// `WorldEncounterInspection` row and an already-resolved
// `{ kind, objectId, origin }` selection into `{ ..., sourceFamily }`.
//
//   Section A: describeWorldEncounterPresentationSourceFamily() — the three
//              recognized families, plus unrecognized/malformed input.
//   Section B: describeWorldEncounterPresentation() — publication shape,
//              every field forwarded verbatim, sourceFamily correctly
//              derived for LOCAL/PEER/SNAPSHOT origins.
//   Section C: avatar shape — same join, LOCAL/PEER sourceFamily, never a
//              SNAPSHOT family in practice but not special-cased against it.
//   Section D: sourceFamily is null whenever resolvedSelection is absent,
//              or names a different kind/objectId than inspection.
//   Section E: malformed/missing inspection degrades to null, never throws.
//   Section F: purity — frozen results, no mutation of inputs, repeatable.
//   Section G: structural sweep — no rank/trust/verified/best vocabulary,
//              no I/O, no new WorldEncounterKind.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function publicationInspection(overrides = {}) {
    return Object.freeze({
        kind: 'PUBLICATION',
        objectId: 'pub-1',
        title: 'A Publication',
        publisherIdentity: { identityId: 'did:key:zAuthor' },
        isSigned: true,
        x: 1,
        y: 2,
        z: 3,
        anchorCount: 0,
        placementCount: 0,
        ...overrides
    });
}

function avatarInspection(overrides = {}) {
    return Object.freeze({
        kind: 'AVATAR',
        objectId: 'avatar-1',
        ownerIdentity: 'did:key:zOwner',
        displayName: 'A Wanderer',
        x: 4,
        y: 5,
        z: 6,
        ...overrides
    });
}

function run() {
    // ---------------------------------------------------------------
    // Section A — describeWorldEncounterPresentationSourceFamily()
    // ---------------------------------------------------------------
    {
        assert(describeWorldEncounterPresentationSourceFamily(LOCAL_WORLD_DISCOVERY_ORIGIN) === WorldEncounterPresentationSourceFamily.LOCAL,
            "1. the exact LOCAL_WORLD_DISCOVERY_ORIGIN string ('local') classifies as LOCAL");
        assert(describeWorldEncounterPresentationSourceFamily('peer:did:key:zPeer') === WorldEncounterPresentationSourceFamily.PEER,
            "2. any 'peer:*' origin classifies as PEER");
        assert(describeWorldEncounterPresentationSourceFamily('snapshot:hash123:pub-1') === WorldEncounterPresentationSourceFamily.SNAPSHOT,
            "3. any 'snapshot:*' origin classifies as SNAPSHOT");
        assert(describeWorldEncounterPresentationSourceFamily('something-else') === null,
            '4. an unrecognized origin string classifies as null, never a guess');
        assert(describeWorldEncounterPresentationSourceFamily(null) === null, '5. null origin -> null, never throws');
        assert(describeWorldEncounterPresentationSourceFamily(undefined) === null, '6. undefined origin -> null, never throws');
        assert(describeWorldEncounterPresentationSourceFamily(42) === null, '7. non-string origin -> null, never throws');
        assert(describeWorldEncounterPresentationSourceFamily('') === null, '8. empty string origin -> null');
        assert(Object.keys(WorldEncounterPresentationSourceFamily).length === 3,
            '9. exactly three families exist — LOCAL, PEER, SNAPSHOT — never a fourth');

        console.log('✓ Section A: describeWorldEncounterPresentationSourceFamily() classifies exactly the three existing origin patterns, unrecognized input degrading to null');
    }

    // ---------------------------------------------------------------
    // Section B — describeWorldEncounterPresentation() for a PUBLICATION
    // ---------------------------------------------------------------
    {
        const inspection = publicationInspection();

        const local = describeWorldEncounterPresentation({
            inspection,
            resolvedSelection: { kind: 'PUBLICATION', objectId: 'pub-1', origin: LOCAL_WORLD_DISCOVERY_ORIGIN }
        });
        assert(local.kind === 'PUBLICATION', '1. kind is forwarded verbatim');
        assert(local.objectId === 'pub-1', '2. objectId is forwarded verbatim, never renamed to publicationId');
        assert(local.title === 'A Publication', '3. title is forwarded verbatim');
        assert(local.x === 1 && local.y === 2 && local.z === 3, '4. x/y/z are forwarded verbatim, unreshaped');
        assert(local.sourceFamily === WorldEncounterPresentationSourceFamily.LOCAL, '5. a local-origin resolved selection yields sourceFamily LOCAL');

        const peer = describeWorldEncounterPresentation({
            inspection,
            resolvedSelection: { kind: 'PUBLICATION', objectId: 'pub-1', origin: 'peer:did:key:zPeer' }
        });
        assert(peer.sourceFamily === WorldEncounterPresentationSourceFamily.PEER, '6. a peer-origin resolved selection yields sourceFamily PEER');

        const snapshot = describeWorldEncounterPresentation({
            inspection,
            resolvedSelection: { kind: 'PUBLICATION', objectId: 'pub-1', origin: 'snapshot:hash-abc:pub-1' }
        });
        assert(snapshot.sourceFamily === WorldEncounterPresentationSourceFamily.SNAPSHOT,
            '7. FLAGSHIP — a snapshot-origin resolved selection yields sourceFamily SNAPSHOT, the exact fact this milestone exists to surface');
        assert(snapshot.title === 'A Publication' && snapshot.objectId === 'pub-1',
            '8. every other field stays identical regardless of sourceFamily — presentation never reshapes identity/position');

        // Never leaks publisherIdentity/isSigned/anchorCount/placementCount
        // — this milestone's own descriptor is deliberately narrower than
        // the full inspection row (see this file's own header).
        assert(!('publisherIdentity' in snapshot), '9. publisherIdentity is not part of the presentation descriptor');
        assert(!('isSigned' in snapshot), '10. isSigned is not part of the presentation descriptor');
        assert(!('anchorCount' in snapshot), '11. anchorCount is not part of the presentation descriptor');

        console.log('✓ Section B: describeWorldEncounterPresentation() correctly derives LOCAL/PEER/SNAPSHOT for a PUBLICATION, forwarding identity/position fields verbatim');
    }

    // ---------------------------------------------------------------
    // Section C — describeWorldEncounterPresentation() for an AVATAR
    // ---------------------------------------------------------------
    {
        const inspection = avatarInspection();

        const local = describeWorldEncounterPresentation({
            inspection,
            resolvedSelection: { kind: 'AVATAR', objectId: 'avatar-1', origin: LOCAL_WORLD_DISCOVERY_ORIGIN }
        });
        assert(local.kind === 'AVATAR', '1. kind is forwarded verbatim');
        assert(local.displayName === 'A Wanderer', '2. displayName is forwarded verbatim');
        assert(local.sourceFamily === WorldEncounterPresentationSourceFamily.LOCAL, '3. an avatar can carry a LOCAL sourceFamily, exactly like a publication');
        assert(!('title' in local), '4. an avatar presentation never carries a publication-only title field');

        const peer = describeWorldEncounterPresentation({
            inspection,
            resolvedSelection: { kind: 'AVATAR', objectId: 'avatar-1', origin: 'peer:did:key:zPeer' }
        });
        assert(peer.sourceFamily === WorldEncounterPresentationSourceFamily.PEER, '5. an avatar can carry a PEER sourceFamily');

        console.log('✓ Section C: describeWorldEncounterPresentation() handles AVATAR as its own distinct shape, never merged with the PUBLICATION shape');
    }

    // ---------------------------------------------------------------
    // Section D — sourceFamily is null when resolvedSelection is absent or
    // names a different encounter than inspection.
    // ---------------------------------------------------------------
    {
        const inspection = publicationInspection();

        const noSelection = describeWorldEncounterPresentation({ inspection });
        assert(noSelection.sourceFamily === null, '1. a missing resolvedSelection yields sourceFamily null, never a guess');

        const nullSelection = describeWorldEncounterPresentation({ inspection, resolvedSelection: null });
        assert(nullSelection.sourceFamily === null, '2. an explicit null resolvedSelection yields sourceFamily null');

        const differentObjectId = describeWorldEncounterPresentation({
            inspection,
            resolvedSelection: { kind: 'PUBLICATION', objectId: 'some-other-pub', origin: 'snapshot:hash:some-other-pub' }
        });
        assert(differentObjectId.sourceFamily === null, '3. a resolvedSelection naming a different objectId never leaks its origin onto this inspection');

        const differentKind = describeWorldEncounterPresentation({
            inspection,
            resolvedSelection: { kind: 'AVATAR', objectId: 'pub-1', origin: LOCAL_WORLD_DISCOVERY_ORIGIN }
        });
        assert(differentKind.sourceFamily === null, '4. a resolvedSelection naming a different kind (even with the same objectId) never leaks its origin onto this inspection');

        console.log('✓ Section D: sourceFamily is null whenever resolvedSelection is absent, or disagrees with inspection on kind/objectId — never a mismatched guess');
    }

    // ---------------------------------------------------------------
    // Section E — malformed/missing inspection degrades to null.
    // ---------------------------------------------------------------
    {
        assert(describeWorldEncounterPresentation({}) === null, '1. no inspection at all -> null');
        assert(describeWorldEncounterPresentation({ inspection: null }) === null, '2. explicit null inspection -> null');
        assert(describeWorldEncounterPresentation() === null, '3. no arguments at all -> null, never throws');
        assert(describeWorldEncounterPresentation({ inspection: { kind: 'PUBLICATION' } }) === null,
            '4. an inspection with no genuine objectId -> null');
        assert(describeWorldEncounterPresentation({ inspection: { kind: 'SOMETHING_ELSE', objectId: 'x' } }) === null,
            '5. an inspection naming an unrecognized kind -> null, never a guessed third shape');

        console.log('✓ Section E: malformed or missing inspection degrades to null, never throws');
    }

    // ---------------------------------------------------------------
    // Section F — purity: frozen results, no mutation, repeatable.
    // ---------------------------------------------------------------
    {
        const inspection = publicationInspection();
        const resolvedSelection = Object.freeze({ kind: 'PUBLICATION', objectId: 'pub-1', origin: 'snapshot:hash-abc:pub-1' });

        const first = describeWorldEncounterPresentation({ inspection, resolvedSelection });
        const second = describeWorldEncounterPresentation({ inspection, resolvedSelection });
        assert(JSON.stringify(first) === JSON.stringify(second), '1. calling twice with byte-identical arguments returns a byte-identical result');
        assert(Object.isFrozen(first), '2. the returned descriptor is frozen');

        let threw = false;
        try { first.sourceFamily = 'LOCAL'; } catch (e) { threw = true; }
        assert(first.sourceFamily === 'SNAPSHOT', "3. the frozen descriptor's own sourceFamily cannot be reassigned");

        console.log('✓ Section F: describeWorldEncounterPresentation() is pure, frozen, and deterministic — no mutation of its own inputs or outputs');
    }

    // ---------------------------------------------------------------
    // Section G — structural sweep: no rank/trust/verified/best vocabulary,
    // no new WorldEncounterKind, no I/O.
    // ---------------------------------------------------------------
    {
        const snapshot = describeWorldEncounterPresentation({
            inspection: publicationInspection(),
            resolvedSelection: { kind: 'PUBLICATION', objectId: 'pub-1', origin: 'snapshot:hash-abc:pub-1' }
        });
        const keys = Object.keys(snapshot);
        const forbidden = ['rank', 'trust', 'trusted', 'verified', 'best', 'preferred', 'reliable', 'freshness', 'quality', 'score'];
        forbidden.forEach((word) => {
            assert(!keys.some((key) => key.toLowerCase().includes(word)), `1.${word} — no ${word} vocabulary appears on the presentation descriptor`);
        });
        assert(snapshot.kind === 'PUBLICATION', '2. sourceFamily never becomes a third WorldEncounterKind value — kind stays exactly PUBLICATION/AVATAR');

        console.log('✓ Section G: structural sweep — no rank/trust/verified/best vocabulary anywhere on the presentation descriptor, and no new WorldEncounterKind');
    }

    console.log('\n✅ All World Encounter Presentation tests passed.');
}

run();
