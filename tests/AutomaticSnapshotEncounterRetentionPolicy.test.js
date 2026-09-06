import { readFile } from 'node:fs/promises';
import {
    shouldRetainAutomaticSnapshotEncounter,
    DEFAULT_AUTOMATIC_SNAPSHOT_RETENTION_RADIUS
} from '../application/AutomaticSnapshotEncounterRetentionPolicy.js';

// 0.9.189 — Automatic Snapshot Encounter Retention Policy.
//
// 0.9.188's own closing "Recommendation" left one architectural question
// deliberately open: once an automatically-cascaded Snapshot is
// registered, what — if anything — should happen once the Wanderer moves
// away from it? This milestone answers ONLY the spatial policy half of
// that question, as a pure, side-effect-free function; connecting it to
// the existing World source registry's own unregister bridge is
// deliberately separate, later, unscheduled work (see this file's own
// production-code header, "Deliberately excluded").
//
//   Section A: basic retention — same position, inside radius, exactly on
//              radius, outside radius
//   Section B: geometry — positive/negative coordinates, diagonal
//              distance, 3D coordinates, zero radius, large radius
//   Section C: identity independence — contentHash/publicationId/locator/
//              storage/Nostr event id never influence the decision
//   Section D: position independence — two Publications with identical
//              content at different positions, evaluated independently
//   Section E: revision independence — one Publication, two content
//              revisions at different positions, two independent subjects
//   Section F: purity — no registry mutation, no discovery, no
//              materialization, no network, entirely synchronous
//   Section G: boundary behavior — missing/malformed position, non-finite
//              coordinates, invalid radius: graceful non-removal (KEEP)

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function pos(x, y, z) {
    return { x, y, z };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — basic retention.
    // ---------------------------------------------------------------
    {
        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(10, 0, 10),
            snapshotPosition: pos(10, 0, 10),
            retentionRadius: 100
        }) === true, '1. identical position — always retained');

        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(0, 0, 0),
            snapshotPosition: pos(50, 0, 0),
            retentionRadius: 100
        }) === true, '2. well inside the retention radius — retained');

        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(0, 0, 0),
            snapshotPosition: pos(100, 0, 0),
            retentionRadius: 100
        }) === true, '3. exactly on the retention radius — retained (inclusive boundary, matching core/SpatialQuery.js#isWithinRadius)');

        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(0, 0, 0),
            snapshotPosition: pos(100.0001, 0, 0),
            retentionRadius: 100
        }) === false, '4. a hair beyond the retention radius — removed');

        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(0, 0, 0),
            snapshotPosition: pos(1000, 0, 0),
            retentionRadius: 100
        }) === false, '5. far outside the retention radius — removed');

        console.log('✓ Section A: basic retention — same position, inside/on/outside the retention radius, all decided correctly');
    }

    // ---------------------------------------------------------------
    // Section B — geometry.
    // ---------------------------------------------------------------
    {
        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(-50, 0, -50),
            snapshotPosition: pos(-60, 0, -60),
            retentionRadius: 100
        }) === true, '6. negative coordinates on both sides — retained when genuinely close');

        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(-50, 0, 50),
            snapshotPosition: pos(500, 0, -500),
            retentionRadius: 100
        }) === false, '7. negative/positive coordinate mix, far apart — removed');

        // 3-4-5 right triangle in the XZ plane: distance is exactly 5.
        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(0, 0, 0),
            snapshotPosition: pos(3, 0, 4),
            retentionRadius: 5
        }) === true, '8. diagonal distance computed correctly — exactly on radius, retained');
        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(0, 0, 0),
            snapshotPosition: pos(3, 0, 4),
            retentionRadius: 4.999
        }) === false, '9. diagonal distance computed correctly — a hair beyond radius, removed');

        // Full 3D: y participates in the distance, not just x/z.
        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(0, 0, 0),
            snapshotPosition: pos(0, 100, 0),
            retentionRadius: 50
        }) === false, '10. a purely vertical (y-axis) separation is measured, not ignored');
        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(0, 0, 0),
            snapshotPosition: pos(0, 40, 0),
            retentionRadius: 50
        }) === true, '11. a vertical separation inside the radius is retained');

        // Zero radius: a legitimate, maximally strict policy — not malformed.
        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(5, 5, 5),
            snapshotPosition: pos(5, 5, 5),
            retentionRadius: 0
        }) === true, '12. zero radius, identical position — retained (exact match satisfies even a zero radius)');
        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(5, 5, 5),
            snapshotPosition: pos(5, 5, 5.0001),
            retentionRadius: 0
        }) === false, '13. zero radius, any non-exact position — removed');

        // Large radius.
        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(0, 0, 0),
            snapshotPosition: pos(100000, 0, 0),
            retentionRadius: 1000000
        }) === true, '14. a very large radius retains a distant Snapshot');
        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(0, 0, 0),
            snapshotPosition: pos(100000, 0, 0),
            retentionRadius: Infinity
        }) === true, '15. an infinite radius always retains');

        console.log('✓ Section B: geometry — positive/negative coordinates, diagonal distance, 3D (y-axis), zero radius, and large radius all decided correctly');
    }

    // ---------------------------------------------------------------
    // Section C — identity independence.
    // ---------------------------------------------------------------
    {
        const base = {
            wandererPosition: pos(0, 0, 0),
            snapshotPosition: pos(500, 0, 0),
            retentionRadius: 100
        };
        const baseline = shouldRetainAutomaticSnapshotEncounter(base);
        assert(baseline === false, '16. sanity: the baseline scenario removes');

        const withIdentity = shouldRetainAutomaticSnapshotEncounter({
            ...base,
            contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            publicationId: 'pub-1',
            locator: 'ar://aaaa',
            storage: 'ar',
            nostrEventId: 'event-1'
        });
        assert(withIdentity === baseline, '17. contentHash/publicationId/locator/storage/nostrEventId, present, never change the decision');

        const withDifferentIdentity = shouldRetainAutomaticSnapshotEncounter({
            ...base,
            contentHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            publicationId: 'pub-2',
            locator: 'ar://bbbb',
            storage: 'peer',
            nostrEventId: 'event-2'
        });
        assert(withDifferentIdentity === baseline, '18. changing every identity field to a completely different value still never changes the decision');

        console.log('✓ Section C: identity independence — contentHash, publicationId, locator, storage, and Nostr event id never influence the spatial decision');
    }

    // ---------------------------------------------------------------
    // Section D — position independence: two Publications with
    // identical content at different positions, evaluated
    // independently.
    // ---------------------------------------------------------------
    {
        const wandererPosition = pos(0, 0, 0);
        const sharedContentHash = 'shared-hash-across-two-publications';

        const publicationOne = shouldRetainAutomaticSnapshotEncounter({
            wandererPosition,
            snapshotPosition: pos(10, 0, 0),
            retentionRadius: 100,
            contentHash: sharedContentHash,
            publicationId: 'publication-one'
        });
        const publicationTwo = shouldRetainAutomaticSnapshotEncounter({
            wandererPosition,
            snapshotPosition: pos(5000, 0, 0),
            retentionRadius: 100,
            contentHash: sharedContentHash,
            publicationId: 'publication-two'
        });

        assert(publicationOne === true, '19. Publication One, near the Wanderer — retained');
        assert(publicationTwo === false, '20. Publication Two, identical content but far from the Wanderer — removed');
        assert(publicationOne !== publicationTwo, '21. identical content at two different positions is never collapsed into one shared decision');

        console.log('✓ Section D: position independence — two Publications sharing identical content are evaluated purely on their own position');
    }

    // ---------------------------------------------------------------
    // Section E — revision independence: one Publication, two
    // content revisions at different positions.
    // ---------------------------------------------------------------
    {
        const wandererPosition = pos(0, 0, 0);
        const sharedPublicationId = 'same-publication';

        const revisionA = shouldRetainAutomaticSnapshotEncounter({
            wandererPosition,
            snapshotPosition: pos(20, 0, 0),
            retentionRadius: 100,
            publicationId: sharedPublicationId,
            contentHash: 'revision-a-hash'
        });
        const revisionB = shouldRetainAutomaticSnapshotEncounter({
            wandererPosition,
            snapshotPosition: pos(9000, 0, 0),
            retentionRadius: 100,
            publicationId: sharedPublicationId,
            contentHash: 'revision-b-hash'
        });

        assert(revisionA === true, '22. Revision A of the same Publication, near the Wanderer — retained');
        assert(revisionB === false, '23. Revision B of the same Publication, far from the Wanderer — removed');
        assert(revisionA !== revisionB, '24. two co-existing content revisions of the same Publication remain two independent retention subjects, never merged');

        console.log('✓ Section E: revision independence — two content revisions of the same Publication stay independent retention subjects');
    }

    // ---------------------------------------------------------------
    // Section F — purity.
    // ---------------------------------------------------------------
    {
        const input = {
            wandererPosition: pos(1, 2, 3),
            snapshotPosition: pos(4, 5, 6),
            retentionRadius: 100
        };
        // Deep-freeze both position objects — a mutation of either would
        // throw in strict-mode class code, but this file uses plain
        // functions, so freezing is the honest way to prove neither
        // input is ever written to.
        Object.freeze(input.wandererPosition);
        Object.freeze(input.snapshotPosition);
        Object.freeze(input);

        const result = shouldRetainAutomaticSnapshotEncounter(input);
        assert(typeof result === 'boolean', '25. the function returns a plain boolean, never a Promise/thenable or an object of any kind');
        assert(!(result instanceof Promise), '26. sanity: not a Promise');

        const resultAgain = shouldRetainAutomaticSnapshotEncounter(input);
        assert(resultAgain === result, '27. calling the function twice with the identical (frozen) input yields the identical result — no hidden internal state');

        const source = await codeOnlySource('application/AutomaticSnapshotEncounterRetentionPolicy.js');
        const forbidden = [
            'WorldDiscoverySourceRegistry', 'registerMaterializedSnapshotWorldSource',
            'unregisterMaterializedSnapshotWorldSource', 'new WebSocket', 'window.nostr',
            'fetch(', 'NostrSnapshotDiscoveryPublisher', 'ArweaveStorageProvider',
            'LocalContentStore', 'Publication', 'ContentReference', 'async ', 'await ',
            '.then(', 'setTimeout(', 'setInterval('
        ];
        for (const token of forbidden) {
            assert(!source.includes(token), `28. this file never references "${token}" — no registry mutation, no discovery, no materialization, no network, no timers, no asynchronous behavior of any kind`);
        }

        console.log('✓ Section F: purity — synchronous, deterministic, no registry mutation, no discovery, no materialization, no network, no timers');
    }

    // ---------------------------------------------------------------
    // Section G — boundary behavior: graceful non-removal under
    // uncertainty.
    // ---------------------------------------------------------------
    {
        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: null,
            snapshotPosition: pos(0, 0, 0),
            retentionRadius: 100
        }) === true, '29. missing wandererPosition — retained (cannot be evaluated, never interpreted as "remove")');

        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(0, 0, 0),
            snapshotPosition: undefined,
            retentionRadius: 100
        }) === true, '30. missing snapshotPosition — retained');

        assert(shouldRetainAutomaticSnapshotEncounter({}) === true,
            '31. both positions entirely absent (bare empty options) — retained');

        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: { x: 0, y: 0 },
            snapshotPosition: pos(0, 0, 0),
            retentionRadius: 100
        }) === true, '32. malformed wandererPosition missing z — retained');

        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: 'not-a-position',
            snapshotPosition: pos(0, 0, 0),
            retentionRadius: 100
        }) === true, '33. malformed wandererPosition of the wrong type entirely — retained');

        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(0, 0, 0),
            snapshotPosition: pos(NaN, 0, 0),
            retentionRadius: 100
        }) === true, '34. non-finite (NaN) snapshotPosition coordinate — retained');

        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(Infinity, 0, 0),
            snapshotPosition: pos(0, 0, 0),
            retentionRadius: 100
        }) === true, '35. non-finite (Infinity) wandererPosition coordinate — retained');

        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(0, 0, 0),
            snapshotPosition: pos(1000, 0, 0),
            retentionRadius: -1
        }) === true, '36. a negative retentionRadius is malformed, not "retain nothing" — retained');

        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(0, 0, 0),
            snapshotPosition: pos(1000, 0, 0),
            retentionRadius: NaN
        }) === true, '37. a NaN retentionRadius is malformed — retained');

        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(0, 0, 0),
            snapshotPosition: pos(1000, 0, 0),
            retentionRadius: 'far'
        }) === true, '38. a non-numeric retentionRadius is malformed — retained');

        assert(shouldRetainAutomaticSnapshotEncounter({
            wandererPosition: pos(0, 0, 0),
            snapshotPosition: pos(1000, 0, 0)
        }) === false, '39. an OMITTED retentionRadius uses the documented default, and is NOT treated as malformed — this one genuinely removes, since 1000 is well beyond the default radius');

        assert(DEFAULT_AUTOMATIC_SNAPSHOT_RETENTION_RADIUS === 100,
            '40. the documented default retention radius is 100, matching the same streamingRadius-derived order of magnitude application/ShouldRefreshSnapshotDiscovery.js already established');

        console.log('✓ Section G: boundary behavior — missing/malformed positions and invalid radii all gracefully retain, never removing under uncertainty');
    }

    console.log('\n✅ All Automatic Snapshot Encounter Retention Policy tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
