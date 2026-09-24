import { readFile } from 'node:fs/promises';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { PublicationCommentaryDistributionExchange } from '../application/publication/commentary/PublicationCommentaryDistributionExchange.js';
import { DiscoverPublicationCommentaryFromNostrUseCase } from '../application/publication/commentary/DiscoverPublicationCommentaryFromNostrUseCase.js';
import { DiscoverPublicationCommentaryFromArweaveUseCase } from '../application/publication/commentary/DiscoverPublicationCommentaryFromArweaveUseCase.js';
import { composeRefreshPublicationCommentaryCommand } from '../application/publication/commentary/RefreshPublicationCommentaryCommandComposition.js';
import PublicationCommentaryRemoteCheck from '../ui/components/PublicationCommentaryRemoteCheck.js';
import { ownPublicationPanelSource, worldEncounterCanvasSource, mainFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';

const SPLIT_COMPONENT_SOURCES = {
    'ui/components/OwnPublicationPanel.js': ownPublicationPanelSource,
    'ui/components/WorldEncounterCanvas.js': worldEncounterCanvasSource
};

// Publication Commentary — fetch-on-open and "Check for new comments".
//
// Before: ui/main.js provided the Nostr and Arweave Commentary discovery
// commands but nothing called them, so a Commentary posted while the
// viewer was offline (or from another device) never reached them — only
// live WebRTC peers ever delivered one.
//
// Now: application/publication/commentary/RefreshPublicationCommentaryCommandComposition.js
// checks both networks for one Publication, and
// ui/components/PublicationCommentaryRemoteCheck.js — mounted in every
// Commentary section — runs it when the section opens and when the viewer
// presses "Check for new comments".
//
// Section A: the command counts only new Commentary, once, across sources.
// Section B: a failing network is named, never thrown; the other still counts.
// Section C: one request per Publication at a time; bad ids never hit the network.
// Section D: END TO END — a real signed Commentary is fetched, verified and
//            stored through the real discovery use cases; a forgery is not.
// Section E: component — checks on mount, emits `refreshed` only for new
//            Commentary, and re-checks on demand.
// Section F: component — stale answers (publication changed, unmounted)
//            are dropped; no command or no publication means no request.
// Section G: component — status wording for every outcome.
// Section H: production wiring — main.js composes both networks; all five
//            Commentary sections mount the component and re-read on refresh.

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeExchange(identityProvider) {
    const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
    const exchange = new PublicationCommentaryDistributionExchange(store, identityProvider, new LocalAuthorizationVerifier());
    return { store, exchange };
}

function entry(commentaryId, isNew) {
    return { commentary: { commentaryId }, isNew };
}

function source(name, discover) {
    const calls = [];
    return {
        name,
        calls,
        discover: (publicationId) => {
            calls.push(publicationId);
            return discover(publicationId);
        }
    };
}

// A plain-object stand-in for the mounted component, built from its own
// real methods/computeds — the technique the other *UI tests use.
function checkCtx(overrides = {}) {
    const emitted = [];
    const ctx = {
        refreshPublicationCommentaryCommand: null,
        publicationId: 'pub-1',
        ...PublicationCommentaryRemoteCheck.data(),
        $emit: (name, payload) => emitted.push({ name, payload }),
        ...overrides
    };
    ctx.check = PublicationCommentaryRemoteCheck.methods.check;
    Object.defineProperty(ctx, 'statusText', {
        get() {
            return PublicationCommentaryRemoteCheck.computed.statusText.call(ctx);
        }
    });
    return { ctx, emitted };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — counts only new Commentary, once, across sources.
    // ---------------------------------------------------------------
    {
        const nostr = source('Nostr', async () => [entry('c-1', true), entry('c-2', false)]);
        const arweave = source('Arweave', async () => [entry('c-1', true), entry('c-3', true)]);
        const refresh = composeRefreshPublicationCommentaryCommand({ sources: [nostr, arweave] });

        const outcome = await refresh('pub-1');
        assert(outcome.newCount === 2, '1. new Commentary is counted once even when both networks return it (c-1), already-known Commentary (c-2) is not counted');
        assert(outcome.checked.join(',') === 'Nostr,Arweave' && outcome.failed.length === 0, '2. both networks are reported as checked, none failed');
        assert(nostr.calls[0] === 'pub-1' && arweave.calls[0] === 'pub-1', '3. every source is asked about exactly the requested Publication');

        const empty = await composeRefreshPublicationCommentaryCommand({ sources: [source('Nostr', async () => [])] })('pub-1');
        assert(empty.newCount === 0 && empty.failed.length === 0, '4. nothing found is a normal, non-failing outcome');

        const malformed = composeRefreshPublicationCommentaryCommand({ sources: [null, { name: 'NoDiscover' }, nostr] });
        assert((await malformed('pub-1')).checked.join(',') === 'Nostr', '5. malformed sources are ignored, never called');

        console.log('✓ Section A: the command counts only new Commentary, once, across both networks');
    }

    // ---------------------------------------------------------------
    // Section B — a failing network is named, never thrown.
    // ---------------------------------------------------------------
    {
        const refresh = composeRefreshPublicationCommentaryCommand({
            sources: [
                source('Nostr', async () => [entry('c-1', true)]),
                source('Arweave', async () => { throw new Error('gateway down'); })
            ]
        });
        const partial = await refresh('pub-1');
        assert(partial.newCount === 1, '6. the reachable network\'s new Commentary still counts');
        assert(partial.failed.join(',') === 'Arweave', '7. the unreachable network is named in `failed`');

        const allDown = await composeRefreshPublicationCommentaryCommand({
            sources: [
                source('Nostr', () => { throw new Error('synchronous failure'); }),
                source('Arweave', async () => { throw new Error('gateway down'); })
            ]
        })('pub-1');
        assert(allDown.newCount === 0 && allDown.failed.join(',') === 'Nostr,Arweave',
            '8. even a source that throws synchronously is caught — the command resolves, never rejects');

        console.log('✓ Section B: a failing network is named, never thrown');
    }

    // ---------------------------------------------------------------
    // Section C — one request per Publication at a time.
    // ---------------------------------------------------------------
    {
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const nostr = source('Nostr', async () => { await gate; return [entry('c-1', true)]; });
        const refresh = composeRefreshPublicationCommentaryCommand({ sources: [nostr] });

        const first = refresh('pub-1');
        const second = refresh('pub-1');
        const other = refresh('pub-2');
        assert(first === second, '9. a second request for the same Publication while one is in flight shares it');
        await flush();
        assert(nostr.calls.length === 2, '10. ...so the network is asked once for pub-1 (and once for the different pub-2)');
        release();
        await Promise.all([first, other]);

        await refresh('pub-1');
        assert(nostr.calls.length === 3, '11. once the first request settles, a new check asks the network again');

        const before = nostr.calls.length;
        const blank = await refresh('');
        const missing = await refresh(null);
        assert(blank.newCount === 0 && missing.checked.length === 0 && nostr.calls.length === before,
            '12. an empty or missing publicationId resolves immediately without touching any network');

        console.log('✓ Section C: one request per Publication at a time');
    }

    // ---------------------------------------------------------------
    // Section D — END TO END through the real discovery use cases.
    // ---------------------------------------------------------------
    {
        const aliceProvider = makeIdentity('commentary-remote-check-alice');
        const { store: aliceStore, exchange: aliceExchange } = makeExchange(aliceProvider);
        const commentary = new PublicationCommentary({
            publicationId: 'pub-bobs-world',
            authorIdentityId: aliceProvider.getSigningIdentity().id,
            content: 'Posted while Bob was offline'
        });
        aliceStore.save(commentary);
        const envelope = aliceExchange.exportCommentary(commentary);

        const malloryProvider = makeIdentity('commentary-remote-check-mallory');
        const { store: malloryStore, exchange: malloryExchange } = makeExchange(malloryProvider);
        const forged = new PublicationCommentary({
            publicationId: 'pub-bobs-world',
            authorIdentityId: malloryProvider.getSigningIdentity().id,
            content: 'Pretending to be Alice'
        });
        malloryStore.save(forged);
        const forgedEnvelope = { ...malloryExchange.exportCommentary(forged), authorIdentityId: aliceProvider.getSigningIdentity().id };

        const bobProvider = makeIdentity('commentary-remote-check-bob');
        const { store: bobStore, exchange: bobExchange } = makeExchange(bobProvider);
        const nostrUseCase = new DiscoverPublicationCommentaryFromNostrUseCase({ discover: async () => [envelope, forgedEnvelope] }, bobExchange);
        const arweaveUseCase = new DiscoverPublicationCommentaryFromArweaveUseCase({ discover: async () => [envelope] }, bobExchange);
        const refresh = composeRefreshPublicationCommentaryCommand({
            sources: [
                { name: 'Nostr', discover: (publicationId) => nostrUseCase.execute({ publicationId }) },
                { name: 'Arweave', discover: (publicationId) => arweaveUseCase.execute({ publicationId }) }
            ]
        });

        assert(bobStore.getForPublication('pub-bobs-world').length === 0, '13. before the check, Bob has none of Alice\'s Commentary');
        const outcome = await refresh('pub-bobs-world');
        const stored = bobStore.getForPublication('pub-bobs-world');
        assert(outcome.newCount === 1, '14. Alice\'s signed Commentary is found once, although both networks carry it');
        assert(stored.length === 1 && stored[0].commentaryId === commentary.commentaryId && stored[0].content === 'Posted while Bob was offline',
            '15. it is now in Bob\'s local store — exactly where every Commentary section reads from');
        assert(!stored.some((c) => c.content === 'Pretending to be Alice'), '16. the forged envelope fails verification and is never stored');

        const again = await refresh('pub-bobs-world');
        assert(again.newCount === 0 && bobStore.getForPublication('pub-bobs-world').length === 1,
            '17. checking again finds nothing new and stores nothing twice');

        console.log('✓ Section D: END TO END — a signed Commentary is fetched, verified and stored; a forgery is not');
    }

    // ---------------------------------------------------------------
    // Section E — component: checks on mount, emits only for new.
    // ---------------------------------------------------------------
    {
        const calls = [];
        let nextOutcome = { newCount: 2, checked: ['Nostr', 'Arweave'], failed: [] };
        const { ctx, emitted } = checkCtx({
            refreshPublicationCommentaryCommand: async (publicationId) => { calls.push(publicationId); return nextOutcome; }
        });

        PublicationCommentaryRemoteCheck.mounted.call(ctx);
        assert(ctx.checking === true, '18. opening the section (mounting) starts a check straight away');
        await flush();
        assert(calls.length === 1 && calls[0] === 'pub-1', '19. the check is for this section\'s Publication');
        assert(ctx.checking === false && ctx.outcome.newCount === 2, '20. the outcome is recorded once it settles');
        assert(emitted.length === 1 && emitted[0].name === 'refreshed' && emitted[0].payload.newCount === 2,
            '21. new Commentary emits `refreshed`, so the host section re-reads its local list');

        nextOutcome = { newCount: 0, checked: ['Nostr', 'Arweave'], failed: [] };
        ctx.check();
        await flush();
        assert(calls.length === 2, '22. "Check for new comments" runs the check again on demand');
        assert(emitted.length === 1, '23. nothing new means no `refreshed` — the host is not asked to re-read for nothing');

        console.log('✓ Section E: the component checks on open, re-checks on demand, and emits only for new Commentary');
    }

    // ---------------------------------------------------------------
    // Section F — stale answers dropped; no command/publication, no request.
    // ---------------------------------------------------------------
    {
        let release;
        const { ctx, emitted } = checkCtx({
            refreshPublicationCommentaryCommand: () => new Promise((resolve) => { release = resolve; })
        });
        ctx.check();
        await flush();
        const staleRelease = release;
        ctx.publicationId = 'pub-2';
        PublicationCommentaryRemoteCheck.watch.publicationId.call(ctx);
        await flush();
        staleRelease({ newCount: 5, checked: ['Nostr'], failed: [] });
        await flush();
        assert(emitted.length === 0 && ctx.outcome === null && ctx.checking === true,
            '24. an answer for the previous Publication is discarded after the section switches to another');

        release({ newCount: 1, checked: ['Nostr'], failed: [] });
        await flush();
        assert(emitted.length === 1 && emitted[0].payload.publicationId === 'pub-2', '25. the current Publication\'s answer is applied');

        const unmounting = checkCtx({ refreshPublicationCommentaryCommand: () => new Promise((resolve) => { release = resolve; }) });
        unmounting.ctx.check();
        await flush();
        PublicationCommentaryRemoteCheck.beforeUnmount.call(unmounting.ctx);
        release({ newCount: 3, checked: ['Nostr'], failed: [] });
        await flush();
        assert(unmounting.emitted.length === 0 && unmounting.ctx.outcome === null, '26. an answer arriving after the section closed is dropped');

        const noCommand = checkCtx();
        noCommand.ctx.check();
        assert(noCommand.ctx.checking === false && noCommand.ctx.outcome === null, '27. without the app-wide command (outside the running app) nothing happens');

        let called = false;
        const noPublication = checkCtx({ publicationId: null, refreshPublicationCommentaryCommand: async () => { called = true; } });
        noPublication.ctx.check();
        await flush();
        assert(!called, '28. without a publicationId no request is made');

        const rejecting = checkCtx({ refreshPublicationCommentaryCommand: async () => { throw new Error('unexpected'); } });
        rejecting.ctx.check();
        await flush();
        assert(rejecting.ctx.checking === false && rejecting.ctx.statusText.startsWith('Couldn\'t reach'),
            '29. even an unexpected rejection ends the check with an honest "couldn\'t reach" status');

        console.log('✓ Section F: stale answers are dropped, and no command or publication means no request');
    }

    // ---------------------------------------------------------------
    // Section G — status wording.
    // ---------------------------------------------------------------
    {
        const status = (outcome, checking = false) => checkCtx({ outcome, checking }).ctx.statusText;
        assert(status(null) === '', '30. before any check there is no status line');
        assert(status(null, true) === 'Checking the network for new comments…', '31. a check in progress says so');
        assert(status({ newCount: 1, checked: ['Nostr', 'Arweave'], failed: [] }) === 'Found 1 new comment.', '32. one new comment, singular');
        assert(status({ newCount: 3, checked: ['Nostr', 'Arweave'], failed: [] }) === 'Found 3 new comments.', '33. several new comments, plural');
        assert(status({ newCount: 0, checked: ['Nostr', 'Arweave'], failed: [] }) === 'No new comments found.', '34. nothing new is stated modestly — "found", never "there are none"');
        assert(status({ newCount: 0, checked: ['Nostr', 'Arweave'], failed: ['Arweave'] }) === 'No new comments found · Arweave unavailable.',
            '35. an unreachable network is named alongside the result from the other');
        assert(status({ newCount: 0, checked: ['Nostr', 'Arweave'], failed: ['Nostr', 'Arweave'] }) === 'Couldn\'t reach Nostr or Arweave — showing comments stored on this device.',
            '36. when no network answers, the status says so and points at the local comments still shown');

        console.log('✓ Section G: the status line describes every outcome honestly');
    }

    // ---------------------------------------------------------------
    // Section H — production wiring.
    // ---------------------------------------------------------------
    {
        const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
        const mainSource = (await Promise.all(mainFiles().map((file) => read(file)))).join('\n');
        assert(/composeRefreshPublicationCommentaryCommand\(\{\s*sources: \[\s*\{ name: 'Nostr', discover: discoverPublicationCommentaryFromNostrCommand \},\s*\{ name: 'Arweave', discover: discoverPublicationCommentaryFromArweaveCommand \}\s*\]\s*\}\)/.test(mainSource),
            '37. main.js composes the refresh command from BOTH existing discovery commands — they are no longer unreached');
        assert(mainSource.includes("app.provide('refreshPublicationCommentaryCommand', refreshPublicationCommentaryCommand);"), '38. main.js provides it app-wide');

        const sections = [
            // The Repository card and list views both mount this through
            // their one shared PublicationCommentarySection.js.
            ['ui/components/PublicationCommentarySection.js', ':publication-id="publication.id" @refreshed="refreshCommentaries"'],
            ['ui/components/OwnPublicationPanel.js', ':publication-id="publication.id"\n                    @refreshed="refreshPublicationCommentaries"'],
            ['ui/components/WorldEncounterCanvas.js', ':publication-id="encounterCommentaryPublicationId" @refreshed="refreshEncounterCommentaries"'],
            ['ui/components/WorldEncounterCanvas.js', ':publication-id="observerLocalEncounterCommentaryPublicationId" @refreshed="refreshObserverLocalEncounterCommentaries"']
        ];
        for (const [path, binding] of sections) {
            // The two split components are read whole, template expanded.
            const componentSource = SPLIT_COMPONENT_SOURCES[path] ? SPLIT_COMPONENT_SOURCES[path]() : await read(path);
            assert(componentSource.includes("import PublicationCommentaryRemoteCheck from './PublicationCommentaryRemoteCheck.js';")
                && /components: \{[^}]*PublicationCommentaryRemoteCheck[^}]*\}/.test(componentSource),
                `39. ${path} imports and registers the component`);
            assert(componentSource.includes(binding), `40. ${path} mounts it for its own Publication and re-reads its local list on \`refreshed\``);
        }

        const checkSource = await read('ui/components/PublicationCommentaryRemoteCheck.js');
        assert(PublicationCommentaryRemoteCheck.inject.refreshPublicationCommentaryCommand.default === null,
            '41. the component injects the command with a null default, so it renders nothing outside the running app');
        assert(!/getPublicationCommentariesCommand|addPublicationCommentaryCommand/.test(checkSource.replace(/^\s*\/\/.*$/gm, '')),
            '42. the component only fetches — it never reads or writes Commentary itself');

        console.log('✓ Section H: production wiring reaches all five Commentary sections');
    }
}

run().then(() => {
    console.log('PublicationCommentaryRemoteCheck tests passed');
}).catch((error) => {
    console.error('✗ PublicationCommentaryRemoteCheck tests failed:', error.message);
    console.error(error);
    process.exitCode = 1;
});
