import { readFile, readdir } from 'node:fs/promises';

import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { RoleProviderPreference } from '../core/RoleProviderPreference.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';

// 0.9.294 — Decentralized Role Provider Preference Persistence Boundary.
// See docs/Roadmap.md, "0.9.294 — Decentralized Role Provider Preference
// Persistence Boundary," and core/RoleProviderPreference.js (0.9.293),
// the boundary this milestone gives a durable home.
//
// Section A: round-trip — save() then get() preserves role and providerKey
// Section B: role isolation — three roles produce three independent entries
// Section C: replacement — a second save() for the same role replaces it
// Section D: cross-role preservation — changing one role never touches another
// Section E: restart semantics — a fresh store instance over the same
//            underlying storage reconstructs every preference
// Section F: malformed data — degrades to absence, never an invalid object
// Section G: storage failure — a genuinely throwing provider propagates
// Section H: provider opacity — persists a known-incomplete capability
//            (Base/Proof) exactly as readily as any other providerKey
// Section I: no fallback — absence is absence, never another role's value
//            or an invented default
// Section J: no resolution — zero path from providerKey to a real provider
// Section K: architecture sweep — no provider imports, no registry, no UI

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

// The identical in-memory StorageProvider fake tests/PublicationCommentaryStorage.test.js
// and tests/DurableDocuments.test.js already use for the same purpose — a
// real StorageProvider subclass, so `instanceof StorageProvider` passes,
// backed by nothing but a Map, round-tripping through JSON exactly like a
// real serialized backend would.
class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

class ThrowingStorageProvider extends StorageProvider {
    save() { throw new Error('storage backend unavailable'); }
    load() { throw new Error('storage backend unavailable'); }
    remove() {}
    list() { return []; }
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function run() {
    // ===============================================================
    // Section A — round-trip: save() then get() preserves role and
    // providerKey.
    // ===============================================================
    {
        const store = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
        const original = new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' });
        store.save(original);

        const loaded = store.get(RoleProviderRole.CONTENT);
        assert(loaded instanceof RoleProviderPreference, 'A1. get() returns a real RoleProviderPreference instance');
        assert(loaded !== original, 'A2. the reloaded instance is a NEW object, never the same reference');
        assert(loaded.role === RoleProviderRole.CONTENT, 'A3. role survives the round trip');
        assert(loaded.providerKey === 'ipfs', 'A4. providerKey survives the round trip');
        assert(loaded.equals(original), 'A5. the reloaded preference is value-equal to the original');
        console.log('✓ Section A: save() then get() round-trips role and providerKey through a real, independently constructed RoleProviderPreference instance');
    }

    // ===============================================================
    // Section B — role isolation: saving three roles produces three
    // independent preferences.
    // ===============================================================
    {
        const store = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
        store.save(new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'nostr' }));
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' }));
        store.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'bitcoin' }));

        assert(store.get(RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY).providerKey === 'nostr', 'B1. Discovery = nostr, independently held');
        assert(store.get(RoleProviderRole.CONTENT).providerKey === 'ipfs', 'B2. Content = ipfs, independently held');
        assert(store.get(RoleProviderRole.PROOF_AND_ANCHORING).providerKey === 'bitcoin', 'B3. Proof = bitcoin, independently held');

        const all = store.loadAll();
        assert(all.length === 3, 'B4. loadAll() returns exactly three preferences, one per role');
        assert(new Set(all.map((p) => p.role)).size === 3, 'B5. all three preferences name distinct roles');
        console.log('✓ Section B: three independently saved roles produce three independent, simultaneously readable preferences');
    }

    // ===============================================================
    // Section C — replacement: a second save() for an already-configured
    // role replaces it, never accumulates a duplicate.
    // ===============================================================
    {
        const store = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' }));
        assert(store.get(RoleProviderRole.CONTENT).providerKey === 'ipfs', 'C1. the first save is visible before the second');

        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'arweave' }));
        const loaded = store.get(RoleProviderRole.CONTENT);
        assert(loaded.providerKey === 'arweave', 'C2. the second save REPLACES the first — Content now reads arweave');
        assert(store.loadAll().filter((p) => p.role === RoleProviderRole.CONTENT).length === 1, 'C3. exactly one Content entry exists on file — never two, never an accumulated history');
        console.log('✓ Section C: saving a new providerKey for an already-configured role replaces it outright, exactly the "current configuration, not a log" semantic this milestone names');
    }

    // ===============================================================
    // Section D — cross-role preservation: replacing one role's
    // preference never disturbs another role's own entry.
    // ===============================================================
    {
        const store = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
        store.save(new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'nostr' }));
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' }));
        store.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'bitcoin' }));

        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'arweave' }));

        assert(store.get(RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY).providerKey === 'nostr', 'D1. Discovery is untouched by the Content replacement');
        assert(store.get(RoleProviderRole.CONTENT).providerKey === 'arweave', 'D2. Content itself now reads the replacement');
        assert(store.get(RoleProviderRole.PROOF_AND_ANCHORING).providerKey === 'bitcoin', 'D3. Proof is untouched by the Content replacement');
        console.log('✓ Section D: replacing Content\'s preference leaves Discovery and Proof exactly as they were — the milestone brief\'s own worked example');
    }

    // ===============================================================
    // Section E — restart semantics: a fresh store instance over the
    // same underlying storage reconstructs every preference.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const store1 = new RoleProviderPreferenceStore(storage);
        store1.save(new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'nostr' }));
        store1.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' }));

        // Simulate a process restart: a brand new store instance, no
        // shared in-memory state with store1, over the identical
        // underlying storage.
        const store2 = new RoleProviderPreferenceStore(storage);
        assert(store2.loadAll().length === 2, 'E1. a fresh store instance sees both previously saved preferences');
        assert(store2.get(RoleProviderRole.CONTENT).providerKey === 'ipfs', 'E2. Content is intact after the simulated restart');

        // And a save through the fresh instance is visible to a third.
        store2.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'bitcoin' }));
        const store3 = new RoleProviderPreferenceStore(storage);
        assert(store3.loadAll().length === 3, 'E3. a write from the restarted instance is durable for a subsequent instance too');
        console.log('✓ Section E: a new store instance over the same storage namespace reconstructs every previously saved preference, exactly like an application restart');
    }

    // ===============================================================
    // Section F — malformed data: degrades to absence, never an invalid
    // domain object and never a thrown error.
    // ===============================================================
    {
        // F1-F3: a per-role entry with a shape RoleProviderPreference's
        // own constructor would reject degrades to "absent for that
        // role," never a construction-time throw escaping get()/loadAll().
        const storage = new InMemoryStorageProvider();
        storage.save('role-provider-preference:by-role', {
            [RoleProviderRole.CONTENT]: 'ipfs',
            [RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY]: 'NOT-VALID-SHAPE',
            [RoleProviderRole.PROOF_AND_ANCHORING]: 42,
            NOT_A_REAL_ROLE: 'nostr'
        });
        const store = new RoleProviderPreferenceStore(storage);
        assert(store.get(RoleProviderRole.CONTENT).providerKey === 'ipfs', 'F1. the one genuinely valid entry survives corruption placed alongside it');
        assert(store.get(RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY) === null, 'F2. an entry whose providerKey fails shape validation degrades to null, never a thrown error');
        assert(store.get(RoleProviderRole.PROOF_AND_ANCHORING) === null, 'F3. a non-string providerKey also degrades to null');
        const all = store.loadAll();
        assert(all.length === 1 && all[0].role === RoleProviderRole.CONTENT, 'F4. loadAll() returns only the one valid entry — an unrecognized role key and malformed entries are silently omitted, never surfaced as invalid objects');

        // F5: a payload that isn't a plain object at all degrades to
        // "nothing configured for any role," not a thrown error.
        const storage2 = new InMemoryStorageProvider();
        storage2.save('role-provider-preference:by-role', ['not', 'an', 'object']);
        const store2 = new RoleProviderPreferenceStore(storage2);
        assert(Array.isArray(store2.loadAll()) && store2.loadAll().length === 0, 'F5. a non-object payload degrades to zero preferences, never a thrown error');
        assert(store2.get(RoleProviderRole.CONTENT) === null, 'F6. get() against a non-object payload returns null rather than throwing');

        // F7: an empty/never-written store also degrades cleanly.
        const store3 = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
        assert(store3.get(RoleProviderRole.CONTENT) === null, 'F7. a store with nothing ever saved returns null, not a thrown error');
        assert(store3.loadAll().length === 0, 'F8. …and loadAll() returns an empty array, not null');
        console.log('✓ Section F: malformed or absent persisted data degrades to "no preference for that role" — get() and loadAll() never hand back an invalid RoleProviderPreference and never throw over bad bytes');
    }

    // ===============================================================
    // Section G — storage failure: a provider that genuinely throws
    // propagates out of this class, never mistaken for "no preference."
    // ===============================================================
    {
        const store = new RoleProviderPreferenceStore(new ThrowingStorageProvider());
        expectThrows(() => store.get(RoleProviderRole.CONTENT), 'G1. get() propagates a genuine storage failure rather than degrading to null');
        expectThrows(() => store.loadAll(), 'G2. loadAll() propagates a genuine storage failure rather than degrading to an empty array');
        expectThrows(() => store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' })), 'G3. save() propagates a genuine storage failure rather than silently no-oping');
        console.log('✓ Section G: a StorageProvider that genuinely throws propagates that failure out of save()/get()/loadAll() unmodified — a real backend failure is never mistaken for "nothing configured yet," the exact distinction this milestone\'s own brief asks to preserve');
    }

    // ===============================================================
    // Section H — provider opacity: this store persists a known-
    // incomplete capability exactly as readily as any other providerKey.
    // ===============================================================
    {
        const store = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
        // Base's own real verify half does not exist yet (0.9.292 Section
        // B) — saving and reading this preference back must succeed
        // identically to a fully-capable provider's own preference.
        store.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'base' }));
        const loaded = store.get(RoleProviderRole.PROOF_AND_ANCHORING);
        assert(loaded !== null && loaded.providerKey === 'base', 'H1. a preference for a KNOWN-INCOMPLETE provider capability (Base/Proof, per 0.9.292) persists and reloads exactly like any other — no capability check ever ran');
        console.log('✓ Section H: persistence never secretly becomes capability resolution — a preference for a provider whose real capability is still incomplete round-trips identically to a fully-capable one');
    }

    // ===============================================================
    // Section I — no fallback: absence is absence, never another role's
    // value or an invented default.
    // ===============================================================
    {
        const store = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
        store.save(new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'nostr' }));
        store.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'bitcoin' }));
        // Content was never configured.
        const contentPreference = store.get(RoleProviderRole.CONTENT);
        assert(contentPreference === null, 'I1. an unconfigured role returns null, never a value borrowed from another role');
        assert(contentPreference !== 'nostr' && contentPreference !== 'bitcoin', 'I2. null is genuinely null — not disguised as any real providerKey');
        assert(store.loadAll().every((p) => p.role !== RoleProviderRole.CONTENT), 'I3. loadAll() never invents a Content entry to fill the gap');
        console.log('✓ Section I: "no preference configured" stays semantically distinct from "prefer provider X" — an unconfigured role returns null, never a fallback to another role\'s own value or a made-up default');
    }

    // ===============================================================
    // Section J — no resolution: zero production path from a saved
    // providerKey to an actual, concrete provider.
    // ===============================================================
    {
        const store = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
        assert(typeof store.resolve === 'undefined', 'J1. there is no resolve() method on this store');
        assert(typeof RoleProviderPreferenceStore.registry === 'undefined', 'J2. no registry, static or otherwise, is reachable from this class at all');
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' }));
        const loaded = store.get(RoleProviderRole.CONTENT);
        assert(typeof loaded.resolve === 'undefined', 'J3. the reloaded RoleProviderPreference itself carries no resolve() either — unchanged from core/RoleProviderPreference.js\'s own 0.9.293 contract');
        console.log('✓ Section J: zero production path exists from a saved providerKey to a concrete provider — this store hands back preferences, never resolved capability');
    }

    // ===============================================================
    // Section K — architecture sweep: no provider imports, no registry
    // consultation, no UI dependency, run against the real source file,
    // never a guess from this file's own prose.
    // ===============================================================
    {
        const storeSource = await source('storage/RoleProviderPreferenceStore.js');
        const forbiddenImportPattern = /^import\b[^\n]*from\s*['"][^'"]*(nostr|arweave|ipfs|bitcoin|anchoring|content\/|discovery\/|base\/|ui\/)[^'"]*['"]/im;
        assert(!forbiddenImportPattern.test(storeSource), 'K1. storage/RoleProviderPreferenceStore.js imports no provider implementation, no content/anchoring/discovery module, and no ui/ module');
        const importLines = storeSource.split('\n').filter((line) => /^import\b/.test(line));
        assert(importLines.length === 4, 'K2. exactly four imports — its own StorageProvider/LocalStorageProvider pair, and the 0.9.293 RoleProviderRole/RoleProviderPreference pair — no other collaborator of any kind');
        assert(!/registry/i.test(storeSource.replace(/\/\/.*$/gm, '')), 'K3. the word "registry" never appears in this file\'s own executable code (only, if at all, in comments) — no registry is consulted at any point');
        assert(typeof window === 'undefined' && typeof document === 'undefined', 'K4. this test runs under plain `node`, with no browser globals present, confirming the store never implicitly depends on one');
        console.log('✓ Section K: architecture sweep of the real source file confirms no provider import, no registry consultation, and no UI dependency — persistence stays exactly as unoperational as the 0.9.293 boundary it durably stores');
    }

    console.log('\n✅ All Decentralized Role Provider Preference Persistence tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
