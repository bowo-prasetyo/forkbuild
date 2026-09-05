import { readFile } from 'node:fs/promises';
import { describeWorldSnapshotInspection } from '../application/WorldSnapshotInspection.js';
import { WorldEncounterPresentationSourceFamily } from '../application/WorldEncounterPresentation.js';

// 0.9.177 — World Snapshot Inspection Detail.
//
// Unit coverage for the one new pure module this milestone introduces:
// `application/WorldSnapshotInspection.js`. See that file's own header for
// the full rationale and, just as importantly, its own audit of which
// Snapshot facts are honestly reachable at this boundary today — and which
// are deliberately NOT (a publisher's claimed position, and a Snapshot's
// own locator/storage, neither of which survives to this boundary without
// new plumbing this milestone declines to add).
//
//   Section A: basic SNAPSHOT descriptor shape — contentHash, publicationId,
//              position all correctly derived.
//   Section B: Publication identity — publicationId is the World identity
//              used here, always equal to objectId, never contentHash.
//   Section C: Content identity — contentHash is extracted from origin
//              independently of publicationId, including a colon-safe
//              extraction that never guesses which segment is which.
//   Section D: Storage identity is deliberately absent — no locator/storage
//              field of any kind ever appears on this descriptor.
//   Section E: Position — the World's own current placement, forwarded
//              from the presentation layer's own already-established x/y/z.
//   Section F: Claim vocabulary is deliberately absent — no claimedPosition/
//              positionRelation field appears; a claim does not survive to
//              this boundary today (see the module's own header).
//   Section G: an AMBIGUOUS/unresolved selection produces no Snapshot
//              inspection detail — never a guess.
//   Section H: LOCAL/PEER presentations, and AVATAR encounters, continue
//              through unaffected — this file returns null for them.
//   Section I: malformed/degraded input degrades to null, or to individual
//              null fields, never a guessed value and never a throw.
//   Section J: purity — frozen results, no mutation of inputs, repeatable.
//   Section K: structural sweep — no I/O, no registry access, no discovery/
//              retrieval/hashing/network calls, no rank/trust vocabulary.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function snapshotPresentation(overrides = {}) {
    return Object.freeze({
        kind: 'PUBLICATION',
        objectId: 'pub-1',
        title: 'A Materialized Snapshot',
        x: 11,
        y: 4,
        z: -8,
        sourceFamily: WorldEncounterPresentationSourceFamily.SNAPSHOT,
        ...overrides
    });
}

function resolvedSnapshotSelection(overrides = {}) {
    return Object.freeze({
        kind: 'PUBLICATION',
        objectId: 'pub-1',
        origin: 'snapshot:hash-abc:pub-1',
        ...overrides
    });
}

function run() {
    // ---------------------------------------------------------------
    // Section A — basic SNAPSHOT descriptor shape.
    // ---------------------------------------------------------------
    {
        const inspection = describeWorldSnapshotInspection({
            presentation: snapshotPresentation(),
            resolvedSelection: resolvedSnapshotSelection()
        });
        assert(inspection !== null, '1. a resolved, SNAPSHOT-sourced PUBLICATION encounter produces a descriptor');
        assert(inspection.kind === 'PUBLICATION', '2. kind is PUBLICATION');
        assert(inspection.objectId === 'pub-1', '3. objectId is forwarded verbatim');
        assert(inspection.publicationId === 'pub-1', '4. publicationId matches objectId');
        assert(inspection.contentHash === 'hash-abc', '5. contentHash is correctly extracted from the origin string');
        assert(inspection.position.x === 11 && inspection.position.y === 4 && inspection.position.z === -8,
            '6. position is bundled from presentation\'s own x/y/z, unchanged');

        console.log('✓ Section A: describeWorldSnapshotInspection() produces the expected descriptor for a resolved, SNAPSHOT-sourced encounter');
    }

    // ---------------------------------------------------------------
    // Section B — Publication identity: publicationId is the World
    // identity, never contentHash.
    // ---------------------------------------------------------------
    {
        const inspection = describeWorldSnapshotInspection({
            presentation: snapshotPresentation({ objectId: 'pub-shared-hash' }),
            resolvedSelection: resolvedSnapshotSelection({ objectId: 'pub-shared-hash', origin: 'snapshot:hash-shared:pub-shared-hash' })
        });
        assert(inspection.publicationId === 'pub-shared-hash', '1. publicationId names the Publication, never the content');
        assert(inspection.publicationId === inspection.objectId, '2. publicationId always agrees with objectId — the same identity, in this Snapshot vocabulary\'s own name');
        assert(inspection.publicationId !== inspection.contentHash, '3. publicationId is never equal to, or confused with, contentHash');

        // Two different Publications sharing an identical contentHash
        // (tests/SnapshotWorldOriginCollision.test.js, 0.9.163) still
        // report two independent publicationIds.
        const other = describeWorldSnapshotInspection({
            presentation: snapshotPresentation({ objectId: 'pub-other-with-same-hash' }),
            resolvedSelection: resolvedSnapshotSelection({ objectId: 'pub-other-with-same-hash', origin: 'snapshot:hash-shared:pub-other-with-same-hash' })
        });
        assert(other.contentHash === inspection.contentHash, '4. sanity — both really do share the identical contentHash');
        assert(other.publicationId !== inspection.publicationId, '5. World identity (publicationId) still tells the two Publications apart even when content identity does not');

        console.log('✓ Section B: publicationId is the descriptor\'s own World identity, always equal to objectId and never confused with contentHash');
    }

    // ---------------------------------------------------------------
    // Section C — Content identity: contentHash extraction is
    // colon-safe, never a naive string split.
    // ---------------------------------------------------------------
    {
        const withHyphenatedHash = describeWorldSnapshotInspection({
            presentation: snapshotPresentation(),
            resolvedSelection: resolvedSnapshotSelection({ origin: 'snapshot:0a1b-2c3d:pub-1' })
        });
        assert(withHyphenatedHash.contentHash === '0a1b-2c3d', '1. a hyphenated hash extracts correctly');

        // A malformed origin whose middle segment looks like it "could" be
        // split several ways is never guessed at — only an origin that
        // reconstructs EXACTLY to materializedSnapshotWorldOrigin(hash, id)
        // for the KNOWN publicationId ever yields a contentHash.
        const withExtraColon = describeWorldSnapshotInspection({
            presentation: snapshotPresentation(),
            resolvedSelection: resolvedSnapshotSelection({ origin: 'snapshot:sha256:abc:pub-1' })
        });
        assert(withExtraColon.contentHash === 'sha256:abc', '2. the full middle segment (even containing its own colon) is recovered by reconstruction, never truncated at the first colon');

        console.log('✓ Section C: contentHash extraction is exact and colon-safe, recovered by reconstruction rather than a naive split');
    }

    // ---------------------------------------------------------------
    // Section D — Storage identity is deliberately absent.
    // ---------------------------------------------------------------
    {
        const inspection = describeWorldSnapshotInspection({
            presentation: snapshotPresentation(),
            resolvedSelection: resolvedSnapshotSelection()
        });
        assert(!('storage' in inspection), '1. no storage field — locator/storage never reaches this boundary (see the module\'s own header, "not reachable here, yet, honestly")');
        assert(!('locator' in inspection), '2. no locator field, for the identical reason');

        console.log('✓ Section D: storage/locator identity is deliberately absent from this descriptor — never a guessed or fabricated value');
    }

    // ---------------------------------------------------------------
    // Section E — Position: the World's own current placement.
    // ---------------------------------------------------------------
    {
        const inspection = describeWorldSnapshotInspection({
            presentation: snapshotPresentation({ x: -3, y: 0, z: 9 }),
            resolvedSelection: resolvedSnapshotSelection()
        });
        assert(inspection.position.x === -3 && inspection.position.y === 0 && inspection.position.z === 9,
            '1. position is exactly presentation\'s own already-established x/y/z — the World\'s own current placement, never recomputed');
        assert(Object.isFrozen(inspection.position), '2. position is frozen');

        console.log('✓ Section E: position reports exactly the World\'s own already-established placement, unchanged');
    }

    // ---------------------------------------------------------------
    // Section F — Claim vocabulary is deliberately absent.
    // ---------------------------------------------------------------
    {
        const inspection = describeWorldSnapshotInspection({
            presentation: snapshotPresentation(),
            resolvedSelection: resolvedSnapshotSelection()
        });
        assert(!('claimedPosition' in inspection), '1. no claimedPosition field — a publisher\'s claim does not survive to this boundary today (see the module\'s own header)');
        assert(!('positionRelation' in inspection), '2. no positionRelation/comparison field — there is nothing safely comparable to compare against yet');

        console.log('✓ Section F: claim vocabulary (claimedPosition/positionRelation) is deliberately absent — this milestone reports only what is honestly reachable');
    }

    // ---------------------------------------------------------------
    // Section G — an AMBIGUOUS/unresolved selection produces nothing.
    // ---------------------------------------------------------------
    {
        const ambiguous = describeWorldSnapshotInspection({
            presentation: snapshotPresentation({ sourceFamily: null }),
            resolvedSelection: null
        });
        assert(ambiguous === null, '1. sourceFamily null (AMBIGUOUS, no explicit choice yet) -> null, never a guess');

        const noSelectionAtAll = describeWorldSnapshotInspection({
            presentation: snapshotPresentation()
        });
        assert(noSelectionAtAll === null, '2. a missing resolvedSelection -> null, even when presentation itself claims SNAPSHOT');

        console.log('✓ Section G: an unresolved/AMBIGUOUS selection produces no Snapshot inspection detail');
    }

    // ---------------------------------------------------------------
    // Section H — LOCAL/PEER presentations and AVATAR encounters
    // continue through unaffected.
    // ---------------------------------------------------------------
    {
        const local = describeWorldSnapshotInspection({
            presentation: snapshotPresentation({ sourceFamily: WorldEncounterPresentationSourceFamily.LOCAL }),
            resolvedSelection: resolvedSnapshotSelection({ origin: 'local' })
        });
        assert(local === null, '1. a LOCAL-sourced encounter produces no Snapshot inspection detail');

        const peer = describeWorldSnapshotInspection({
            presentation: snapshotPresentation({ sourceFamily: WorldEncounterPresentationSourceFamily.PEER }),
            resolvedSelection: resolvedSnapshotSelection({ origin: 'peer:did:key:zPeer' })
        });
        assert(peer === null, '2. a PEER-sourced encounter produces no Snapshot inspection detail');

        const avatar = describeWorldSnapshotInspection({
            presentation: {
                kind: 'AVATAR', objectId: 'avatar-1', displayName: 'A Wanderer', x: 0, y: 0, z: 0,
                sourceFamily: WorldEncounterPresentationSourceFamily.SNAPSHOT
            },
            resolvedSelection: { kind: 'AVATAR', objectId: 'avatar-1', origin: 'snapshot:hash:avatar-1' }
        });
        assert(avatar === null, '3. an AVATAR encounter never produces Snapshot inspection detail, even if (never observed in practice) it somehow carried sourceFamily SNAPSHOT');

        console.log('✓ Section H: LOCAL/PEER-sourced encounters and AVATAR encounters continue through with no Snapshot inspection detail, exactly as before this milestone');
    }

    // ---------------------------------------------------------------
    // Section I — malformed/degraded input degrades gracefully.
    // ---------------------------------------------------------------
    {
        assert(describeWorldSnapshotInspection({}) === null, '1. no presentation at all -> null');
        assert(describeWorldSnapshotInspection() === null, '2. no arguments at all -> null, never throws');
        assert(describeWorldSnapshotInspection({ presentation: null, resolvedSelection: resolvedSnapshotSelection() }) === null, '3. explicit null presentation -> null');
        assert(describeWorldSnapshotInspection({ presentation: { kind: 'PUBLICATION' }, resolvedSelection: resolvedSnapshotSelection() }) === null,
            '4. a presentation with no genuine objectId -> null');

        // presentation/resolvedSelection captured at two different moments
        // (a caller's own bug) never leak one encounter's origin onto
        // another's presentation.
        const mismatchedObjectId = describeWorldSnapshotInspection({
            presentation: snapshotPresentation({ objectId: 'pub-1' }),
            resolvedSelection: resolvedSnapshotSelection({ objectId: 'pub-2', origin: 'snapshot:hash-abc:pub-2' })
        });
        assert(mismatchedObjectId === null, '5. a resolvedSelection naming a different objectId than presentation -> null, never a mismatched guess');

        const mismatchedKind = describeWorldSnapshotInspection({
            presentation: snapshotPresentation(),
            resolvedSelection: { kind: 'AVATAR', objectId: 'pub-1', origin: 'snapshot:hash-abc:pub-1' }
        });
        assert(mismatchedKind === null, '6. a resolvedSelection naming a different kind than presentation -> null');

        // A malformed/inconsistent origin degrades contentHash to null —
        // never a thrown error, and never a guessed value — while the
        // facts that ARE still genuinely known (identity, position) are
        // still reported.
        const malformedOrigin = describeWorldSnapshotInspection({
            presentation: snapshotPresentation(),
            resolvedSelection: resolvedSnapshotSelection({ origin: 'snapshot:pub-1' })
        });
        assert(malformedOrigin !== null, '7. a malformed origin still produces a descriptor — identity/position are independently known');
        assert(malformedOrigin.contentHash === null, '8. ...but contentHash degrades to null rather than guessing which fragment it might be');
        assert(malformedOrigin.publicationId === 'pub-1', '9. ...while publicationId/position remain correctly reported');

        const nonSnapshotOrigin = describeWorldSnapshotInspection({
            presentation: snapshotPresentation(),
            resolvedSelection: resolvedSnapshotSelection({ origin: 'local' })
        });
        assert(nonSnapshotOrigin.contentHash === null, '10. an origin that does not even look like a Snapshot origin also degrades contentHash to null, never throws');

        console.log('✓ Section I: malformed/mismatched/degraded input degrades to null, or to individual null fields, never a guess and never a throw');
    }

    // ---------------------------------------------------------------
    // Section J — purity: frozen results, no mutation, repeatable.
    // ---------------------------------------------------------------
    {
        const presentation = snapshotPresentation();
        const resolvedSelection = resolvedSnapshotSelection();

        const first = describeWorldSnapshotInspection({ presentation, resolvedSelection });
        const second = describeWorldSnapshotInspection({ presentation, resolvedSelection });
        assert(JSON.stringify(first) === JSON.stringify(second), '1. calling twice with byte-identical arguments returns a byte-identical result');
        assert(Object.isFrozen(first), '2. the returned descriptor is frozen');

        let threw = false;
        try { first.contentHash = 'tampered'; } catch (e) { threw = true; }
        assert(first.contentHash === 'hash-abc', "3. the frozen descriptor's own contentHash cannot be reassigned");

        assert(Object.isFrozen(presentation) && Object.isFrozen(resolvedSelection), '4. sanity — the inputs themselves stay frozen/unmutated');

        console.log('✓ Section J: describeWorldSnapshotInspection() is pure, frozen, and deterministic — no mutation of its own inputs or outputs');
    }

    // ---------------------------------------------------------------
    // Section K — structural sweep: no I/O, no registry access, no
    // discovery/retrieval/hashing/network calls, no rank/trust vocabulary.
    // ---------------------------------------------------------------
    return (async () => {
        const source = await readFile(new URL('../application/WorldSnapshotInspection.js', import.meta.url), 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/fetch\(|localStorage|WebRTC|WorldDiscoverySourceRegistry|registry\.|deriveWorldEncounters\(|resolveSnapshotWorldPlacement\(|resolveSnapshotWorldPositionClaim\(|registerMaterializedSnapshotWorldSource\(/.test(codeOnly),
            '1. no I/O, no registry access, and no re-invocation of any upstream resolution/placement/registration function — this file only joins two already-computed facts');
        assert(!/computeContentHash|sha256|crypto\./.test(codeOnly),
            '2. no hashing of any kind — contentHash is only ever extracted from an already-known origin string, never recomputed');
        assert(!/rank|trust|verified|best|preferred|reliable|freshness|quality|score/i.test(codeOnly),
            '3. no rank/trust/verified/best/preferred/reliable/freshness/quality/score vocabulary anywhere in the new module\'s own executable code');
        assert(!/Nostr|Arweave/i.test(codeOnly),
            '4. no Nostr/Arweave-specific vocabulary — this file operates entirely on already-established World facts, reached only through their existing origin-string encoding');

        const canvasSource = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
        assert(canvasSource.includes("import { describeWorldSnapshotInspection } from '../../application/WorldSnapshotInspection.js';"),
            '5. WorldEncounterCanvas.js wires the new pure module in as a plain import, exactly like every other application/ seam it depends on');

        console.log('✓ Section K: structural sweep — no I/O, no registry access, no re-invocation of upstream resolution/placement/registration, no hashing, and no rank/trust vocabulary');

        console.log('\n✅ All World Snapshot Inspection tests passed.');
    })();
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
