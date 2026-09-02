import { readFile } from 'node:fs/promises';
import { hydratePublicationDistributionLifecycles } from '../application/PublicationDistributionLifecycleHydration.js';
import { PublicationDistributionLifecycleRestorer } from '../application/PublicationDistributionLifecycleRestorer.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionLifecyclePersistence } from '../application/PublicationDistributionLifecyclePersistence.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.57 — Publication Distribution Lifecycle Hydration Composition.
// See docs/Roadmap.md, "0.9.57 — Publication Distribution Lifecycle
// Hydration Composition," for the full milestone story.
//
//   Section A: FLAGSHIP — a real restorer/store/persistence trio hydrates
//              three explicit publication ids at once, in order, and the
//              store ends up holding all three restored lifecycles
//   Section B: results preserve input order and pair each id with what
//              restore() returned for it, including null for a missing one
//   Section C: empty publicationIds — zero restore() calls, [] returned
//   Section D: non-array publicationIds degrades to [] silently
//   Section E: duplicate ids call restore() once per occurrence, no dedup
//   Section F: a throwing restorer.restore() propagates immediately,
//              unchanged, and never attempts ids after the failing one
//   Section G: malformed individual ids are forwarded to restore(), never
//              separately validated here
//   Section H: constructor-style validation of the restorer argument
//   Section I: no discovery — restorer is duck-typed to restore() only
//   Section J: architectural regression

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() {
        super();
        this._data = new Map();
    }
    save(name, data) {
        this._data.set(name, JSON.parse(JSON.stringify(data)));
    }
    load(name) {
        return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null;
    }
    remove(name) {
        this._data.delete(name);
    }
    list() {
        return Array.from(this._data.keys());
    }
}

function makeSpyRestorer(restoreImpl) {
    const restoreCalls = [];
    return {
        restoreCalls,
        restore(publicationId) {
            restoreCalls.push(publicationId);
            return restoreImpl(publicationId);
        }
    };
}

const lifecycleA = Object.freeze({
    material: Object.freeze({ state: 'PRESENT', uri: 'ar://TXHYDRATEA', storage: 'ar' }),
    discovery: Object.freeze({ state: 'ABSENT' })
});
const lifecycleB = Object.freeze({
    material: Object.freeze({ state: 'PRESENT', uri: 'ar://TXHYDRATEB', storage: 'ar' }),
    discovery: Object.freeze({ state: 'ABSENT' })
});

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: a real restorer/store/persistence trio
    // hydrates three explicit publication ids in one call. Two have
    // persisted snapshots, one does not — the store ends up holding
    // exactly the two that did, and this file's own return value reports
    // all three.
    // ---------------------------------------------------------------
    {
        const sharedStorage = new InMemoryStorageProvider();
        const persistence = new PublicationDistributionLifecyclePersistence(sharedStorage);
        persistence.save('pub-a', lifecycleA);
        persistence.save('pub-b', lifecycleB);
        // 'pub-c' is deliberately never persisted.

        const store = new PublicationDistributionLifecycleMemoryStore();
        const restorer = new PublicationDistributionLifecycleRestorer(persistence, store);

        assert(store.get('pub-a') === null && store.get('pub-b') === null && store.get('pub-c') === null, 'sanity: the store starts out empty for all three ids');

        const results = hydratePublicationDistributionLifecycles(restorer, ['pub-a', 'pub-b', 'pub-c']);

        assert(Array.isArray(results) && results.length === 3, '1. FLAGSHIP — one result pair per input id');
        assert(results[0].publicationId === 'pub-a' && results[0].lifecycle.material.uri === lifecycleA.material.uri, '2. FLAGSHIP — pub-a restored with its own persisted facts');
        assert(results[1].publicationId === 'pub-b' && results[1].lifecycle.material.uri === lifecycleB.material.uri, '3. FLAGSHIP — pub-b restored with its own persisted facts');
        assert(results[2].publicationId === 'pub-c' && results[2].lifecycle === null, '4. FLAGSHIP — pub-c, never persisted, restores as null');

        assert(store.get('pub-a') === results[0].lifecycle, '5. FLAGSHIP — the store now holds the exact object returned for pub-a');
        assert(store.get('pub-b') === results[1].lifecycle, '6. FLAGSHIP — the store now holds the exact object returned for pub-b');
        assert(store.get('pub-c') === null, '7. FLAGSHIP — the store still holds nothing for pub-c, exactly as 0.9.56\'s own restore() would leave it');

        console.log('✓ Flagship: hydrating three explicit publication ids in one call restores the two with persisted snapshots into the store and reports null for the one without, in order');
    }

    // ---------------------------------------------------------------
    // Section B — results preserve input order and pair each id with
    // exactly what restore() returned for it.
    // ---------------------------------------------------------------
    {
        const restorer = makeSpyRestorer((id) => (id === 'pub-y' ? lifecycleB : null));
        const results = hydratePublicationDistributionLifecycles(restorer, ['pub-x', 'pub-y', 'pub-z']);

        assert(results.length === 3, '8. one pair per input id');
        assert(results[0].publicationId === 'pub-x' && results[0].lifecycle === null, '9. pub-x paired with restore()\'s own null result');
        assert(results[1].publicationId === 'pub-y' && results[1].lifecycle === lifecycleB, '10. pub-y paired with the exact object restore() returned');
        assert(results[2].publicationId === 'pub-z' && results[2].lifecycle === null, '11. pub-z paired with restore()\'s own null result');
        assert(restorer.restoreCalls.length === 3 && restorer.restoreCalls[0] === 'pub-x' && restorer.restoreCalls[1] === 'pub-y' && restorer.restoreCalls[2] === 'pub-z', '12. restore() was called once per id, in the exact input order');

        console.log('✓ Results preserve input order and pair each id with exactly what restore() returned for it');
    }

    // ---------------------------------------------------------------
    // Section C — empty publicationIds is a valid, explicit "restore
    // nothing" request: zero restore() calls, [] returned.
    // ---------------------------------------------------------------
    {
        const restorer = makeSpyRestorer(() => lifecycleA);
        const results = hydratePublicationDistributionLifecycles(restorer, []);

        assert(Array.isArray(results) && results.length === 0, '13. an empty publicationIds array returns an empty result');
        assert(restorer.restoreCalls.length === 0, '14. an empty publicationIds array calls restore() zero times');

        console.log('✓ Empty publicationIds: a valid, explicit "restore nothing" request — zero restore() calls, [] returned');
    }

    // ---------------------------------------------------------------
    // Section D — non-array publicationIds degrades to [] silently,
    // never throws.
    // ---------------------------------------------------------------
    {
        const restorer = makeSpyRestorer(() => lifecycleA);

        for (const badIds of [undefined, null, 'pub-a', 42, {}, { length: 2 }]) {
            const results = hydratePublicationDistributionLifecycles(restorer, badIds);
            assert(Array.isArray(results) && results.length === 0, '15. a non-array publicationIds degrades to an empty result');
        }
        assert(restorer.restoreCalls.length === 0, '16. a non-array publicationIds never reaches restore()');

        console.log('✓ Non-array publicationIds degrades silently to [], never throws, and never reaches restore()');
    }

    // ---------------------------------------------------------------
    // Section E — duplicate ids call restore() once per occurrence, with
    // no deduplication.
    // ---------------------------------------------------------------
    {
        const restorer = makeSpyRestorer(() => lifecycleA);
        const results = hydratePublicationDistributionLifecycles(restorer, ['pub-dup', 'pub-dup', 'pub-dup']);

        assert(results.length === 3, '17. a repeated id produces one result pair per occurrence, never collapsed');
        assert(restorer.restoreCalls.length === 3, '18. restore() is called once per occurrence of a repeated id — no dedup');
        assert(results.every((pair) => pair.publicationId === 'pub-dup' && pair.lifecycle === lifecycleA), '19. every occurrence carries the same id and the same restore() result');

        console.log('✓ Duplicate ids: restore() is called once per occurrence in the input list, with no deduplication');
    }

    // ---------------------------------------------------------------
    // Section F — a throwing restorer.restore() propagates immediately,
    // unchanged, and no id after the failing one is ever attempted.
    // ---------------------------------------------------------------
    {
        const restorer = makeSpyRestorer((id) => {
            if (id === 'pub-boom') {
                throw new Error('a deliberately broken restorer implementation');
            }
            return lifecycleA;
        });

        let threw = false;
        try {
            hydratePublicationDistributionLifecycles(restorer, ['pub-first', 'pub-boom', 'pub-never-attempted']);
        } catch (error) {
            threw = true;
            assert(error.message === 'a deliberately broken restorer implementation', '20. the original error propagates unchanged, with no new wrapper vocabulary');
        }
        assert(threw, '21. a genuinely throwing restore() call propagates straight out of hydratePublicationDistributionLifecycles()');
        assert(restorer.restoreCalls.length === 2 && restorer.restoreCalls[0] === 'pub-first' && restorer.restoreCalls[1] === 'pub-boom', '22. restore() was attempted for pub-first and pub-boom only — pub-never-attempted is never reached after the throw');

        console.log('✓ A throwing restore() call propagates immediately and unchanged; ids after the failing one are never attempted, with no partial-results object returned');
    }

    // ---------------------------------------------------------------
    // Section G — malformed individual ids are forwarded straight to
    // restore(), never separately validated by this file.
    // ---------------------------------------------------------------
    {
        const restorer = makeSpyRestorer((id) => (typeof id === 'string' && id.length > 0 ? lifecycleA : null));
        const badIds = [undefined, null, '', 42, {}, 'pub-good'];

        const results = hydratePublicationDistributionLifecycles(restorer, badIds);

        assert(results.length === badIds.length, '23. one result pair per input entry, malformed or not — this file performs no filtering of its own');
        assert(restorer.restoreCalls.length === badIds.length, '24. every entry, malformed or not, is forwarded straight into restore()');
        assert(results[5].publicationId === 'pub-good' && results[5].lifecycle === lifecycleA, '25. the one well-formed id among them restores normally');
        for (let i = 0; i < 5; i++) {
            assert(results[i].lifecycle === null, `26.${i} a malformed id degrades exactly as restore() itself already degrades it — this file adds no validation of its own`);
        }

        console.log('✓ Malformed individual ids are forwarded straight to restore() — this file performs no id validation of its own, relying entirely on restore()\'s own degradation');
    }

    // ---------------------------------------------------------------
    // Section H — constructor-style validation: a missing or
    // incompatible restorer throws immediately, before any restore()
    // call is attempted.
    // ---------------------------------------------------------------
    {
        let threwOnMissingRestorer = false;
        try {
            hydratePublicationDistributionLifecycles(undefined, ['pub-1']);
        } catch (error) {
            threwOnMissingRestorer = true;
        }
        assert(threwOnMissingRestorer, '27. calling without a restorer throws');

        let threwOnRestorerWithoutRestore = false;
        try {
            hydratePublicationDistributionLifecycles({}, ['pub-1']);
        } catch (error) {
            threwOnRestorerWithoutRestore = true;
        }
        assert(threwOnRestorerWithoutRestore, '28. calling with a restorer missing restore() throws');

        const restorer = makeSpyRestorer(() => lifecycleA);
        hydratePublicationDistributionLifecycles(restorer, ['pub-1']);
        assert(restorer.restoreCalls.length === 1, '29. a well-formed restorer is accepted and used normally');

        console.log('✓ Constructor-style validation: a missing or incompatible restorer throws immediately, before any restore() call is attempted');
    }

    // ---------------------------------------------------------------
    // Section I — no discovery: the restorer is duck-typed to restore()
    // only, and this file never calls anything resembling list()/
    // listPublicationIds() on it, even when such a method exists.
    // ---------------------------------------------------------------
    {
        let listCalled = false;
        const restorer = {
            restore(id) {
                return id === 'pub-known' ? lifecycleA : null;
            },
            list() {
                listCalled = true;
                return ['pub-known', 'pub-undiscovered'];
            },
            listPublicationIds() {
                listCalled = true;
                return ['pub-known', 'pub-undiscovered'];
            }
        };

        const results = hydratePublicationDistributionLifecycles(restorer, ['pub-known']);

        assert(listCalled === false, '30. neither list() nor listPublicationIds() is ever called, even when the injected restorer happens to expose one');
        assert(results.length === 1 && results[0].publicationId === 'pub-known', '31. only the explicitly supplied id is ever restored — pub-undiscovered is never touched');

        console.log('✓ No discovery: this file never calls list()/listPublicationIds() on the restorer, even when such a method is present — only the explicitly supplied ids are ever restored');
    }

    // ---------------------------------------------------------------
    // Section J — architectural regression: this file adds no forbidden
    // import or vocabulary — it remains a thin, stateless composition of
    // 0.9.56's own restore(), never a fourth restoration algorithm, a
    // class, or a discovery mechanism.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/PublicationDistributionLifecycleHydration.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes("from './PublicationDistributionLifecycleRestorer"), '32. never imports the 0.9.56 restorer module — it is duck-typed, received as this function\'s own first argument');
        assert(!codeOnly.includes("from './PublicationDistributionLifecycleStore"), '33. never imports the 0.9.52/0.9.53 memory store module');
        assert(!codeOnly.includes("from './PublicationDistributionLifecyclePersistence"), '34. never imports the 0.9.54 persistence module');
        assert(!codeOnly.includes("from './PublicationDistributionLifecyclePersistenceBridge"), '35. never imports the 0.9.55 bridge module');
        assert(!codeOnly.includes("from './PublicationDistributionLifecycle"), '36. never imports the 0.9.50 lifecycle module');
        assert(!codeOnly.includes("from './PublicationDistributionLifecycleTransition"), '37. never imports the 0.9.51 transition module');
        assert(!codeOnly.includes('class '), '38. defines no class of its own — a plain, stateless function, matching this file\'s own header, "The entire public surface"');
        assert(!codeOnly.includes('.list(') && !codeOnly.includes('.load(') && !codeOnly.includes('.save(') && !codeOnly.includes('.set(') && !codeOnly.includes('.get('), '39. never calls restorer.list()/persistence.load()/persistence.save()/store.set()/store.get() directly — it calls exactly restorer.restore(), nothing else');
        assert(!codeOnly.includes('try') && !codeOnly.includes('catch'), '40. contains no try/catch of its own — a throwing restore() call propagates unchanged, with no suppression layered on top');
        assert(!codeOnly.includes('Promise') && !codeOnly.includes('async ') && !codeOnly.includes('await '), '41. contains no Promise/async/await of its own — synchronous only, matching restore()\'s own contract');
        assert(!codeOnly.includes('setTimeout') && !codeOnly.includes('setInterval'), '42. no retry/scheduling/polling/background-worker machinery of its own');
        assert(!codeOnly.includes('new Date') && !codeOnly.includes('Date.now'), '43. no clock read, and no timestamp of any kind');
        assert(!codeOnly.includes('Object.freeze') && !codeOnly.includes('JSON.parse') && !codeOnly.includes('JSON.stringify'), '44. never freezes, clones, or serializes a value of its own — it forwards exactly what restore() returns');
        assert(!codeOnly.includes('.version') && !codeOnly.includes('.timestamp'), '45. never reads a version or timestamp field — this family has no such semantics yet');
        assert(!/\bSet\(/.test(codeOnly) && !/\bMap\(/.test(codeOnly), '46. holds no Map/Set of its own — no per-id cache, no dedup bookkeeping');

        const forbiddenTerms = ['pending', 'failed', 'failure', 'retrying', 'recovering', 'confirmed', 'withdrawn', 'rollback', 'compensation', 'transaction', 'queue', 'schedule', 'polling', 'history', 'undo', 'version', 'lock', 'merge', 'rank', 'dirty', 'stale', 'batch', 'dedup', 'authoritative', 'authority', 'progress', 'discover'];
        for (const term of forbiddenTerms) {
            const pattern = new RegExp(`\\b${term}`, 'i');
            assert(!pattern.test(codeOnly), `47. code must never use "${term}" — this composition invents no status, discovery, or authority vocabulary of its own`);
        }

        console.log('✓ Architectural regression: this file imports none of the lifecycle/store/persistence/bridge/transition/restorer modules, defines no class, calls exactly restorer.restore() and nothing else, contains no try/catch of its own, performs no async/I/O/clock reads, holds no Map/Set of its own, and uses no status/discovery/authority vocabulary anywhere in its own code');
    }

    console.log('\nAll PublicationDistributionLifecycleHydration tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
