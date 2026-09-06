import { readFile } from 'node:fs/promises';

import { AutomaticSnapshotEncounterRetentionReconciliation } from '../application/AutomaticSnapshotEncounterRetentionReconciliation.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { registerMaterializedSnapshotWorldSource } from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { describeWorldDiscoverySource } from '../core/WorldDiscoverySource.js';

// 0.9.190 — Automatic Snapshot Encounter Retention Integration.
//
// 0.9.189 proved the pure spatial policy correct in isolation; this file
// proves the RUNTIME INTEGRATION correct — that watching a subject via
// `noteAutomaticRegistration()` and then calling `reconcile()` actually
// removes an out-of-radius registered Snapshot from a REAL
// `WorldDiscoverySourceRegistry` through the REAL, unmodified
// `unregisterMaterializedSnapshotWorldSource()` bridge, and, just as
// importantly, that it never touches anything it was not explicitly told
// to watch.
//
//   Section A: retain a registered Snapshot inside the retention radius
//   Section B: remove a registered Snapshot outside the retention radius
//   Section C: boundary — exactly on the radius remains registered
//   Section D: multiple Snapshots — only the distant ones are removed
//   Section E: same content, different Publications — only the distant one
//              is removed
//   Section F: same Publication, different content revisions — only the
//              distant revision is removed
//   Section G: manual independence — a manually-registered Snapshot (never
//              passed through noteAutomaticRegistration()) is never removed
//   Section H: no material destruction — removal touches only the registry
//              slot; the Publication object itself is untouched
//   Section I: no rediscovery — structural sweep confirms no import of the
//              discovery/cascade chain of any kind
//   Section J: idempotence — reconciling twice produces exactly one removal
//   Section K: registry churn — unrelated LOCAL/PEER sources are untouched
//   Section L: movement sequence — near/far/near/far only ever acts on the
//              currently-justified spatial state, and never re-adds a
//              forgotten subject
//   Section M: defensive/boundary behavior — missing registry, malformed
//              noteAutomaticRegistration() input, missing wandererPosition

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function pos(x, y, z) {
    return { x, y, z };
}

function publication(id) {
    return { id, title: `Publication ${id}`, publisherIdentity: 'identity-1' };
}

// Registers a fake, already-PLACED Snapshot directly through the REAL
// registration bridge — exactly what AutomaticSnapshotEncounterCascade's
// own `_run()` does, one layer up, once it reaches PLACED.
function registerSnapshot(registry, { contentHash, publicationId, position }) {
    const result = registerMaterializedSnapshotWorldSource(
        registry,
        { outcome: SnapshotWorldPlacementOutcome.PLACED, contentHash, publicationId, position },
        publication(publicationId)
    );
    assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'setup: registration itself must succeed');
    return result;
}

function originFor(registry, contentHash, publicationId) {
    return `snapshot:${contentHash}:${publicationId}`;
}

function hasOrigin(registry, origin) {
    return registry.listSources().some((source) => source.origin === origin);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — retain inside the retention radius.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, { contentHash: 'hash-a', publicationId: 'pub-1', position: pos(10, 0, 0) });
        const origin = originFor(registry, 'hash-a', 'pub-1');

        const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: registry });
        reconciliation.noteAutomaticRegistration({ publicationId: 'pub-1', contentHash: 'hash-a' });

        const removed = reconciliation.reconcile(pos(0, 0, 0));
        assert(removed.length === 0, '1. nothing removed when the Wanderer is well inside the retention radius');
        assert(hasOrigin(registry, origin), '2. the registered source itself remains in the registry');
        assert(reconciliation.watchedAutomaticSubjects().length === 1, '3. the subject remains watched after a KEEP decision');

        console.log('✓ Section A: a registered Snapshot inside the retention radius is retained');
    }

    // ---------------------------------------------------------------
    // Section B — remove outside the retention radius.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, { contentHash: 'hash-b', publicationId: 'pub-1', position: pos(5000, 0, 0) });
        const origin = originFor(registry, 'hash-b', 'pub-1');

        const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: registry });
        reconciliation.noteAutomaticRegistration({ publicationId: 'pub-1', contentHash: 'hash-b' });

        const removed = reconciliation.reconcile(pos(0, 0, 0));
        assert(removed.length === 1, '4. exactly one subject removed');
        assert(removed[0].publicationId === 'pub-1' && removed[0].contentHash === 'hash-b', '5. the removed subject is reported back to the caller');
        assert(!hasOrigin(registry, origin), '6. the distant Snapshot is unregistered through the existing bridge');
        assert(reconciliation.watchedAutomaticSubjects().length === 0, '7. the subject is forgotten once removed');

        console.log('✓ Section B: a registered Snapshot outside the retention radius is unregistered');
    }

    // ---------------------------------------------------------------
    // Section C — boundary: exactly on the radius remains registered.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, { contentHash: 'hash-c', publicationId: 'pub-1', position: pos(100, 0, 0) });
        const origin = originFor(registry, 'hash-c', 'pub-1');

        const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: registry, retentionRadius: 100 });
        reconciliation.noteAutomaticRegistration({ publicationId: 'pub-1', contentHash: 'hash-c' });

        const removed = reconciliation.reconcile(pos(0, 0, 0));
        assert(removed.length === 0, '8. exactly on the retention radius is retained, not removed');
        assert(hasOrigin(registry, origin), '9. the source remains registered at exactly the boundary distance');

        console.log('✓ Section C: exactly on the retention radius remains registered (inclusive boundary)');
    }

    // ---------------------------------------------------------------
    // Section D — multiple Snapshots: only the distant ones are removed.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, { contentHash: 'hash-A', publicationId: 'P1', position: pos(10, 0, 0) });
        registerSnapshot(registry, { contentHash: 'hash-B', publicationId: 'P1', position: pos(9000, 0, 0) });
        registerSnapshot(registry, { contentHash: 'hash-A', publicationId: 'P2', position: pos(-20, 0, 0) });
        registerSnapshot(registry, { contentHash: 'hash-C', publicationId: 'P2', position: pos(0, 9000, 0) });

        const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: registry });
        reconciliation.noteAutomaticRegistration({ publicationId: 'P1', contentHash: 'hash-A' });
        reconciliation.noteAutomaticRegistration({ publicationId: 'P1', contentHash: 'hash-B' });
        reconciliation.noteAutomaticRegistration({ publicationId: 'P2', contentHash: 'hash-A' });
        reconciliation.noteAutomaticRegistration({ publicationId: 'P2', contentHash: 'hash-C' });

        const removed = reconciliation.reconcile(pos(0, 0, 0));
        const removedKeys = new Set(removed.map((r) => `${r.publicationId}:${r.contentHash}`));
        assert(removedKeys.size === 2, '10. exactly two distant subjects removed');
        assert(removedKeys.has('P1:hash-B') && removedKeys.has('P2:hash-C'), '11. the two FAR subjects are the ones removed');
        assert(hasOrigin(registry, originFor(registry, 'hash-A', 'P1')), '12. P1/hash-A (near) remains registered');
        assert(hasOrigin(registry, originFor(registry, 'hash-A', 'P2')), '13. P2/hash-A (near) remains registered');
        assert(!hasOrigin(registry, originFor(registry, 'hash-B', 'P1')), '14. P1/hash-B (far) is gone');
        assert(!hasOrigin(registry, originFor(registry, 'hash-C', 'P2')), '15. P2/hash-C (far) is gone');

        console.log('✓ Section D: with multiple registered Snapshots, only the ones outside the radius are removed');
    }

    // ---------------------------------------------------------------
    // Section E — same content, different Publications.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, { contentHash: 'shared-hash', publicationId: 'P1', position: pos(10, 0, 0) });
        registerSnapshot(registry, { contentHash: 'shared-hash', publicationId: 'P2', position: pos(9000, 0, 0) });

        const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: registry });
        reconciliation.noteAutomaticRegistration({ publicationId: 'P1', contentHash: 'shared-hash' });
        reconciliation.noteAutomaticRegistration({ publicationId: 'P2', contentHash: 'shared-hash' });

        reconciliation.reconcile(pos(0, 0, 0));
        assert(hasOrigin(registry, originFor(registry, 'shared-hash', 'P1')), '16. Publication One, near, remains registered');
        assert(!hasOrigin(registry, originFor(registry, 'shared-hash', 'P2')), '17. Publication Two, identical content but far, is removed');

        console.log('✓ Section E: two Publications sharing identical content are reconciled purely on their own position');
    }

    // ---------------------------------------------------------------
    // Section F — same Publication, different content revisions.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, { contentHash: 'revision-a', publicationId: 'same-pub', position: pos(20, 0, 0) });
        registerSnapshot(registry, { contentHash: 'revision-b', publicationId: 'same-pub', position: pos(9000, 0, 0) });

        const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: registry });
        reconciliation.noteAutomaticRegistration({ publicationId: 'same-pub', contentHash: 'revision-a' });
        reconciliation.noteAutomaticRegistration({ publicationId: 'same-pub', contentHash: 'revision-b' });

        reconciliation.reconcile(pos(0, 0, 0));
        assert(hasOrigin(registry, originFor(registry, 'revision-a', 'same-pub')), '18. Revision A, near, remains registered');
        assert(!hasOrigin(registry, originFor(registry, 'revision-b', 'same-pub')), '19. Revision B, far, is removed');

        console.log('✓ Section F: two content revisions of the same Publication are reconciled as independent subjects');
    }

    // ---------------------------------------------------------------
    // Section G — manual independence.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        // Registered exactly as OwnPublicationPanel.js's own explicit
        // "Register" button would — through the SAME bridge function, but
        // NEVER passed through noteAutomaticRegistration().
        registerSnapshot(registry, { contentHash: 'manual-hash', publicationId: 'manual-pub', position: pos(9000, 0, 0) });
        const origin = originFor(registry, 'manual-hash', 'manual-pub');

        const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: registry });
        // Deliberately never call noteAutomaticRegistration() for this pair.

        const removed = reconciliation.reconcile(pos(0, 0, 0));
        assert(removed.length === 0, '20. a manually-registered Snapshot is never reported as removed');
        assert(hasOrigin(registry, origin), '21. a manually-registered Snapshot, however far, is never touched by retention reconciliation');
        assert(reconciliation.watchedAutomaticSubjects().length === 0, '22. a manually-registered Snapshot is never watched in the first place');

        console.log('✓ Section G: manual registrations remain completely independent of automatic retention');
    }

    // ---------------------------------------------------------------
    // Section H — no material destruction.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const pub = publication('pub-h');
        const result = registerMaterializedSnapshotWorldSource(
            registry,
            { outcome: SnapshotWorldPlacementOutcome.PLACED, contentHash: 'hash-h', publicationId: 'pub-h', position: pos(9000, 0, 0) },
            pub
        );
        assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'setup');

        const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: registry });
        reconciliation.noteAutomaticRegistration({ publicationId: 'pub-h', contentHash: 'hash-h' });
        reconciliation.reconcile(pos(0, 0, 0));

        assert(!hasOrigin(registry, originFor(registry, 'hash-h', 'pub-h')), '23. the registry slot itself is gone');
        assert(pub.id === 'pub-h' && pub.title === 'Publication pub-h', '24. the Publication object itself is entirely untouched — no field cleared or mutated');

        console.log('✓ Section H: removal touches only the World registry slot — material, Publication, and content identity are untouched');
    }

    // ---------------------------------------------------------------
    // Section I — no rediscovery: structural sweep.
    // ---------------------------------------------------------------
    {
        const source = await codeOnlySource('application/AutomaticSnapshotEncounterRetentionReconciliation.js');
        const forbidden = [
            'AutomaticSnapshotEncounterCascade', 'WorldSnapshotDiscoveryMonitor',
            'DiscoverSnapshotCandidatesCommand', 'ResolveSelectedSnapshotCommand',
            'MaterializeSelectedSnapshotCommand',
            'resolveSnapshotWorldPlacement', 'NostrSnapshotDiscoveryPublisher',
            'ArweaveStorageProvider', 'new WebSocket', 'window.nostr', 'fetch('
        ];
        for (const token of forbidden) {
            assert(!source.includes(token), `25. this file never references "${token}" — no rediscovery, no re-registration, no cascade of any kind`);
        }
        // `registerMaterializedSnapshotWorldSource` (the REGISTERING half of
        // the bridge, as opposed to the imported, un-prefixed
        // `unregisterMaterializedSnapshotWorldSource`) is checked separately
        // with a word-boundary regex, since the forbidden substring above
        // would otherwise also (correctly) match inside the legitimately
        // imported `unregisterMaterializedSnapshotWorldSource` identifier.
        assert(!/(?<!un)registerMaterializedSnapshotWorldSource/.test(source), '25b. this file never calls the REGISTERING half of the bridge — only the symmetric unregister undo');
        console.log('✓ Section I: structural sweep — no import or call of the discovery/resolve/materialize/place/register chain');
    }

    // ---------------------------------------------------------------
    // Section J — idempotence.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        let removeSourceCalls = 0;
        const originalRemoveSource = registry.removeSource.bind(registry);
        registry.removeSource = (origin) => {
            removeSourceCalls += 1;
            return originalRemoveSource(origin);
        };

        registerSnapshot(registry, { contentHash: 'hash-j', publicationId: 'pub-j', position: pos(9000, 0, 0) });
        const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: registry });
        reconciliation.noteAutomaticRegistration({ publicationId: 'pub-j', contentHash: 'hash-j' });

        const firstPass = reconciliation.reconcile(pos(0, 0, 0));
        assert(firstPass.length === 1, '26. the first pass removes the distant subject');
        assert(removeSourceCalls === 1, '27. the first pass calls removeSource() exactly once');

        const secondPass = reconciliation.reconcile(pos(0, 0, 0));
        assert(secondPass.length === 0, '28. the second pass removes nothing further');
        assert(removeSourceCalls === 1, '29. the second pass never calls removeSource() again — the subject was already forgotten');

        console.log('✓ Section J: reconciling twice produces exactly one removal, never a repeat');
    }

    // ---------------------------------------------------------------
    // Section K — registry churn: unrelated sources untouched.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeWorldDiscoverySource({ origin: 'local', publications: [publication('local-pub')], placements: [] }));
        registry.setSource(describeWorldDiscoverySource({ origin: 'peer:identity-9', publications: [publication('peer-pub')], placements: [] }));
        registerSnapshot(registry, { contentHash: 'hash-k', publicationId: 'pub-k', position: pos(9000, 0, 0) });

        const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: registry });
        reconciliation.noteAutomaticRegistration({ publicationId: 'pub-k', contentHash: 'hash-k' });
        reconciliation.reconcile(pos(0, 0, 0));

        assert(hasOrigin(registry, 'local'), '30. the unrelated LOCAL source is untouched');
        assert(hasOrigin(registry, 'peer:identity-9'), '31. the unrelated PEER source is untouched');
        assert(!hasOrigin(registry, originFor(registry, 'hash-k', 'pub-k')), '32. only the distant, watched Snapshot source is removed');
        assert(registry.listSources().length === 2, '33. exactly the two unrelated sources remain');

        console.log('✓ Section K: unrelated LOCAL/PEER registrations are never disturbed by retention reconciliation');
    }

    // ---------------------------------------------------------------
    // Section L — movement sequence: near / far / near / far.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, { contentHash: 'hash-l', publicationId: 'pub-l', position: pos(50, 0, 0) });
        const origin = originFor(registry, 'hash-l', 'pub-l');

        const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: registry });
        reconciliation.noteAutomaticRegistration({ publicationId: 'pub-l', contentHash: 'hash-l' });

        reconciliation.reconcile(pos(0, 0, 0)); // near (distance 50) — retained
        assert(hasOrigin(registry, origin), '34. near: retained');

        reconciliation.reconcile(pos(9000, 0, 0)); // far — removed
        assert(!hasOrigin(registry, origin), '35. far: removed');

        // Wanderer walks back near. Retention never re-registers on its own
        // — see this module's own header, "No re-registration, no
        // rediscovery, ever."
        reconciliation.reconcile(pos(0, 0, 0)); // near again
        assert(!hasOrigin(registry, origin), '36. near again: still absent — reconciliation never re-registers a forgotten subject');
        assert(reconciliation.watchedAutomaticSubjects().length === 0, '37. the subject stays forgotten');

        reconciliation.reconcile(pos(9000, 0, 0)); // far again — still nothing to do
        assert(!hasOrigin(registry, origin), '38. far again: still absent, and no error from reconciling an already-forgotten subject');

        console.log('✓ Section L: a near/far/near/far movement sequence only ever acts on the currently-justified spatial state, and never rediscovers');
    }

    // ---------------------------------------------------------------
    // Section M — defensive/boundary behavior.
    // ---------------------------------------------------------------
    {
        const inertReconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: null });
        inertReconciliation.noteAutomaticRegistration({ publicationId: 'pub-1', contentHash: 'hash-1' });
        const removedWithNoRegistry = inertReconciliation.reconcile(pos(0, 0, 0));
        assert(Array.isArray(removedWithNoRegistry) && removedWithNoRegistry.length === 0, '39. a missing registry degrades gracefully, never throwing');

        const registry = new WorldDiscoverySourceRegistry();
        const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: registry });

        reconciliation.noteAutomaticRegistration({ publicationId: '', contentHash: 'hash-1' });
        reconciliation.noteAutomaticRegistration({ publicationId: 'pub-1', contentHash: '' });
        reconciliation.noteAutomaticRegistration({});
        reconciliation.noteAutomaticRegistration(undefined);
        assert(reconciliation.watchedAutomaticSubjects().length === 0, '40. malformed noteAutomaticRegistration() input is silently ignored, never watched');

        registerSnapshot(registry, { contentHash: 'hash-m', publicationId: 'pub-m', position: pos(10, 0, 0) });
        reconciliation.noteAutomaticRegistration({ publicationId: 'pub-m', contentHash: 'hash-m' });
        const removed = reconciliation.reconcile(null);
        assert(removed.length === 0, '41. a missing wandererPosition delegates to the pure policy\'s own graceful KEEP — never treated as "remove"');
        assert(hasOrigin(registry, originFor(registry, 'hash-m', 'pub-m')), '42. the subject remains registered when the Wanderer\'s own position is unknown');

        console.log('✓ Section M: defensive/boundary behavior — missing registry, malformed input, and unknown Wanderer position all degrade gracefully');
    }

    console.log('\n✅ All Automatic Snapshot Encounter Retention Integration tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
