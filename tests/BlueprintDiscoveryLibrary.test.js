import { Structure } from '../core/Structure.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { sortStructures, STRUCTURE_SORT_OPTIONS } from '../core/sortStructures.js';
import { buildCategoryOptions, matches, normalize } from '../ui/components/BuildLibraryPanel.js';
import { LibraryUsageHistoryStore } from '../application/LibraryUsageHistoryStore.js';
import { LocalStructureLibraryStore } from '../application/LocalStructureLibraryStore.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/CreateStructureRegistryUseCase.js';

// 0.6.4 — Blueprint Discovery, Search & Library Organization.
//
// 0.6.3 gave a personal Structure a real authoring workflow; what it
// left unaddressed is what happens once a library holds dozens of
// them. Nothing here adds a new domain concept — `core/Structure.js`
// gains no fields, `core/StructureRegistry.js` and
// `application/LocalStructureLibraryStore.js`'s existing methods are
// untouched — this milestone is entirely new, pure PRESENTATION logic
// over data those two already expose, plus one small new local store
// for "what did I recently use."
//
//   Section A: core/sortStructures.js — every sort key, always
//              deterministic (ties always fall back to id), never
//              mutates its input
//   Section B: ui/components/BuildLibraryPanel.js#buildCategoryOptions()
//              — counts and first-seen order derived from whatever
//              category groups are handed in, across more than one
//              source
//   Section C: application/LibraryUsageHistoryStore.js — recording a
//              use, most-recent-first ordering, re-use moves to front
//              without duplicating, limit, clear()
//   Section D: application/LocalStructureLibraryStore.js#getSavedAtById()
//              — survives a metadata-only rename, absent for anything
//              never saved
//   Section E: CAPSTONE — search (now including description) + a
//              category filter + a source filter + a sort key +
//              Recent, composed together exactly the way
//              ui/views/EditorView.js and
//              ui/components/BuildLibraryPanel.js do it, entirely
//              headlessly; a removed personal Structure silently drops
//              out of a stale Recent list rather than throwing

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

function makeStructure({ id, name, category = 'uncategorized', description = '', brickCount = 1 }) {
    const bricks = [];
    for (let i = 0; i < brickCount; i++) {
        bricks.push(new Brick({ definitionId: 'core:cube', position: new Position(i, 0, 0) }));
    }
    return new Structure({ id, name, category, description, bricks });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A: core/sortStructures.js
    // ---------------------------------------------------------------
    {
        const registry = new CreateBrickRegistryUseCase().execute();

        const a = makeStructure({ id: 'b:aaa', name: 'Zebra House', brickCount: 3 });
        const b = makeStructure({ id: 'a:bbb', name: 'apple barn', brickCount: 7 });
        const c = makeStructure({ id: 'c:ccc', name: 'apple barn', brickCount: 2 }); // tie on name with b

        // 1. Name — case-insensitive, ties broken by id.
        const byName = sortStructures([a, b, c], 'name');
        assert(byName.map((s) => s.id).join(',') === 'a:bbb,c:ccc,b:aaa',
            'name: case-insensitive alphabetical, ties (b vs c share a lowercased name) broken by id');

        // 2. Brick count — descending, ties broken by id.
        const byBrickCount = sortStructures([a, b, c], 'brickCount');
        assert(byBrickCount.map((s) => s.id).join(',') === 'a:bbb,b:aaa,c:ccc',
            'brickCount: descending (7, 3, 2)');

        // 3. Recent — consults ONLY the savedAtById map handed in, never
        //    the Structure itself; an id absent from the map sorts as
        //    least recent (core/Structure.js has no createdAt field at
        //    all — see that class's own header).
        const byRecent = sortStructures([a, b, c], 'recent', {
            savedAtById: { 'a:bbb': 500, 'c:ccc': 900 }
            // 'b:aaa' deliberately absent — e.g. a built-in Structure
        });
        assert(byRecent.map((s) => s.id).join(',') === 'c:ccc,a:bbb,b:aaa',
            'recent: highest savedAt first, an id missing from the map sorts last');

        // 4. Footprint/height — via the real registry, real bricks
        //    spread along X (see makeStructure()) so brick count alone
        //    already drives footprint without needing custom geometry.
        const wide = makeStructure({ id: 'z:wide', name: 'Wide', brickCount: 5 });
        const narrow = makeStructure({ id: 'z:narrow', name: 'Narrow', brickCount: 1 });
        const byFootprint = sortStructures([narrow, wide], 'footprint', { registry });
        assert(byFootprint[0].id === 'z:wide', 'footprint: the structure spanning more ground sorts first (descending)');
        // Height ties (every brick here is the same definition, so every
        // structure's own height is identical) fall back to id.
        const byHeight = sortStructures([wide, narrow], 'height', { registry });
        assert(byHeight.map((s) => s.id).join(',') === 'z:narrow,z:wide',
            'height: a tie (identical brick heights) breaks on id, ascending');

        // 5. Purity — the input array and its Structures are untouched.
        const original = [a, b, c];
        const originalOrder = original.map((s) => s.id).join(',');
        sortStructures(original, 'name');
        assert(original.map((s) => s.id).join(',') === originalOrder, 'purity: sortStructures never mutates its input array');

        // 6. Every documented sort key is actually usable, and the
        // option list stays exactly the vocabulary the UI dropdown
        // renders from.
        assert(STRUCTURE_SORT_OPTIONS.map((o) => o.key).join(',') === 'name,recent,brickCount,footprint,height',
            'STRUCTURE_SORT_OPTIONS: the exact five keys this milestone shipped, in menu order');

        console.log('✓ Section A: core/sortStructures.js — every key deterministic, tie-broken by id, never mutates its input');
    }

    // ---------------------------------------------------------------
    // Section B: buildCategoryOptions()
    // ---------------------------------------------------------------
    {
        const builtInGroups = [
            { category: 'residential', structures: [makeStructure({ id: 'v:house', name: 'House' })] },
            { category: 'agricultural', structures: [
                makeStructure({ id: 'v:barn', name: 'Barn' }),
                makeStructure({ id: 'v:silo', name: 'Silo' })
            ] }
        ];
        const personalGroups = [
            { category: 'agricultural', structures: [makeStructure({ id: 'p:farm', name: 'Farmstead' })] },
            { category: 'decoration', structures: [makeStructure({ id: 'p:statue', name: 'Statue' })] }
        ];

        const { total, options } = buildCategoryOptions(builtInGroups, personalGroups);

        assert(total === 5, 'buildCategoryOptions: total counts every structure across both group lists');
        assert(options.map((o) => o.category).join(',') === 'residential,agricultural,decoration',
            'buildCategoryOptions: first-seen order across group lists — residential and agricultural from the built-in list, decoration only introduced by the personal one');
        const agricultural = options.find((o) => o.category === 'agricultural');
        assert(agricultural.count === 3, 'buildCategoryOptions: a category appearing in BOTH lists merges its count (2 built-in + 1 personal)');
        const residential = options.find((o) => o.category === 'residential');
        assert(residential.count === 1, 'buildCategoryOptions: a category appearing in only one list keeps its own count');

        // Empty input degrades to an empty, zero-total option list rather
        // than throwing — the "All (0)" case an empty search/filter
        // combination produces.
        const empty = buildCategoryOptions([], []);
        assert(empty.total === 0 && empty.options.length === 0, 'buildCategoryOptions: no groups in, no options out, total zero');

        console.log('✓ Section B: buildCategoryOptions() — merges counts across sources, first-seen order, degrades gracefully when empty');
    }

    // ---------------------------------------------------------------
    // Section C: application/LibraryUsageHistoryStore.js
    // ---------------------------------------------------------------
    {
        const store = new LibraryUsageHistoryStore({ storageProvider: new InMemoryStorageProvider() });

        assert(store.listRecent().length === 0, 'listRecent: empty history returns an empty array, never throws');

        store.recordUse('village:house', { usedAt: 100 });
        store.recordUse('village:barn', { usedAt: 200 });
        store.recordUse('personal:farmstead', { usedAt: 300 });

        assert(store.listRecent().join(',') === 'personal:farmstead,village:barn,village:house',
            'listRecent: most-recently-used first');

        // Re-using an already-recorded id moves it to the front, never
        // duplicating it in the list.
        store.recordUse('village:house', { usedAt: 400 });
        const afterReuse = store.listRecent();
        assert(afterReuse.join(',') === 'village:house,personal:farmstead,village:barn',
            'listRecent: re-recording an id moves it to the front');
        assert(afterReuse.filter((id) => id === 'village:house').length === 1,
            'listRecent: re-recording an id never duplicates its entry');

        assert(store.listRecent(2).join(',') === 'village:house,personal:farmstead',
            'listRecent: honors an explicit limit');

        store.clear('village:house');
        assert(store.listRecent().join(',') === 'personal:farmstead,village:barn',
            'clear: removes exactly one id\'s own record, leaving the rest');

        // Guards mirror every other local store in this codebase — an
        // invalid id is silently ignored, never throws.
        store.recordUse(null);
        store.recordUse('');
        store.clear(null);
        assert(store.listRecent().join(',') === 'personal:farmstead,village:barn',
            'guards: recordUse/clear silently ignore an invalid id');

        console.log('✓ Section C: LibraryUsageHistoryStore — recency order, re-use moves to front without duplicating, limit, clear(), guards');
    }

    // ---------------------------------------------------------------
    // Section D: LocalStructureLibraryStore#getSavedAtById()
    // ---------------------------------------------------------------
    {
        const store = new LocalStructureLibraryStore({ storageProvider: new InMemoryStorageProvider() });

        assert(Object.keys(store.getSavedAtById()).length === 0, 'getSavedAtById: an empty library returns an empty map');

        store.addStructure(makeStructure({ id: 'p:farmstead', name: 'Farmstead' }), { savedAt: 1000 });
        store.addStructure(makeStructure({ id: 'p:tower', name: 'Tower' }), { savedAt: 2000 });

        const map = store.getSavedAtById();
        assert(map['p:farmstead'] === 1000 && map['p:tower'] === 2000,
            'getSavedAtById: returns each stored Structure\'s own savedAt, keyed by id');
        assert(!('village:house' in map), 'getSavedAtById: a built-in Structure id (never stored here) is simply absent');

        // Renaming (a metadata-only overwrite) preserves the ORIGINAL
        // savedAt — the exact same guarantee addStructure()'s own header
        // already documents for listStructures()' recency order; this
        // just proves the timestamp ITSELF, not only the order, survives.
        store.updateStructureMetadata('p:farmstead', { name: 'Farmstead Deluxe' });
        assert(store.getSavedAtById()['p:farmstead'] === 1000,
            'getSavedAtById: a rename never bumps the original savedAt');

        console.log('✓ Section D: LocalStructureLibraryStore#getSavedAtById() — per-id timestamps, absent for built-ins, survives a rename');
    }

    // ---------------------------------------------------------------
    // Section E: CAPSTONE — the full discovery pipeline, headlessly
    // ---------------------------------------------------------------
    {
        const structureRegistry = new CreateStructureRegistryUseCase().execute();
        const personalStorage = new InMemoryStorageProvider();
        const personalLibrary = new LocalStructureLibraryStore({ storageProvider: personalStorage });
        const usageHistory = new LibraryUsageHistoryStore({ storageProvider: new InMemoryStorageProvider() });

        const farmstead = makeStructure({
            id: 'p:farmstead-1', name: 'Farmstead', category: 'agricultural',
            description: 'A small agricultural settlement with a barn and silo.'
        });
        const gazebo = makeStructure({
            id: 'p:gazebo-1', name: 'Garden Gazebo', category: 'decoration',
            description: 'An open pavilion for the garden.'
        });
        personalLibrary.addStructure(farmstead, { savedAt: 1000 });
        personalLibrary.addStructure(gazebo, { savedAt: 2000 });

        // 1. Search matches DESCRIPTION, not only name/category/tags —
        //    the actual new field this milestone wires into matches()'s
        //    existing, unmodified, generic field-list contract.
        const query = normalize('agricultural settlement');
        const searchHits = personalLibrary.listStructures().filter((s) =>
            matches(query, s.name, s.category, s.tags.join(' '), s.description));
        assert(searchHits.length === 1 && searchHits[0].id === 'p:farmstead-1',
            'capstone: searching a phrase that only appears in a description finds exactly that structure');

        // 2. Category options over the built-in + personal libraries
        //    together — the same computation
        //    ui/components/BuildLibraryPanel.js's own categoryOptions
        //    performs.
        const { options } = buildCategoryOptions(structureRegistry.groupByCategory(), personalLibrary.groupByCategory());
        const decoration = options.find((o) => o.category === 'decoration');
        assert(decoration.count === 1, 'capstone: the personal-only "decoration" category appears with its own count');

        // 3. Sort personal structures by recency using the store's own
        //    getSavedAtById() — Garden Gazebo (savedAt 2000) before
        //    Farmstead (savedAt 1000).
        const byRecent = sortStructures(personalLibrary.listStructures(), 'recent', {
            savedAtById: personalLibrary.getSavedAtById()
        });
        assert(byRecent.map((s) => s.id).join(',') === 'p:gazebo-1,p:farmstead-1',
            'capstone: recent sort orders personal structures by their own real savedAt');

        // 4. Record usage, then resolve Recent against BOTH libraries —
        //    the exact responsibility ui/views/EditorView.js's own
        //    resolveRecentStructures() carries, reproduced headlessly.
        const builtInHouse = structureRegistry.get('village:house');
        usageHistory.recordUse(builtInHouse.id, { usedAt: 10 });
        usageHistory.recordUse('p:farmstead-1', { usedAt: 20 });

        function resolveRecent() {
            const resolved = [];
            for (const id of usageHistory.listRecent(5)) {
                const personal = personalLibrary.getStructure(id);
                if (personal) { resolved.push({ structure: personal, source: 'personal' }); continue; }
                const builtIn = structureRegistry.get(id);
                if (builtIn) { resolved.push({ structure: builtIn, source: 'built-in' }); }
            }
            return resolved;
        }

        const recentBefore = resolveRecent();
        assert(recentBefore.length === 2, 'capstone: both a built-in and a personal usage resolve');
        assert(recentBefore[0].structure.id === 'p:farmstead-1' && recentBefore[0].source === 'personal',
            'capstone: most-recently-used (Farmstead) resolves first, correctly tagged personal');
        assert(recentBefore[1].structure.id === builtInHouse.id && recentBefore[1].source === 'built-in',
            'capstone: the built-in usage resolves too, correctly tagged built-in');

        // 5. Removing the personal Structure from its library leaves a
        //    STALE usage-history entry behind (by design — see
        //    LibraryUsageHistoryStore's own header) that silently drops
        //    out of the resolved list rather than resolving to a ghost
        //    or throwing.
        personalLibrary.removeStructure('p:farmstead-1');
        const recentAfter = resolveRecent();
        assert(recentAfter.length === 1 && recentAfter[0].structure.id === builtInHouse.id,
            'capstone: a removed personal Structure silently disappears from Recent; the built-in entry is unaffected');

        console.log('✓ Section E: CAPSTONE — description search, cross-library category counts, recency sort, and Recent resolution/staleness all compose correctly');
    }

    console.log('✓ All BlueprintDiscoveryLibrary tests passed');
}

// tests.html's `await import(file)` only reliably waits for a module's
// synchronous top-level evaluation — see every other test file's own
// closing comment on this — so this is invoked with top-level await,
// never fire-and-forget.
await run();
