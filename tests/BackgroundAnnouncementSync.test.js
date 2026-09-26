import { BackgroundAnnouncementSync } from '../application/announcementIndex/BackgroundAnnouncementSync.js';
import { AnnouncementIndex } from '../application/announcementIndex/AnnouncementIndex.js';
import { AnnouncementKind } from '../application/announcementIndex/AnnouncementKinds.js';
import { RecordingDiscoverySource } from '../application/announcementIndex/IndexedDiscoverySources.js';
import { PlaceNamingDiscoveryMonitor } from '../application/placeNaming/PlaceNamingDiscoveryMonitor.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Announcement Index, Phase 4 (docs/AnnouncementIndex.md): the background
// sync runs on a timer, sooner while behind, only while active, and rotates
// through the Place Naming tags this device has searched.

function fakeTimers() {
    const pending = [];
    return {
        pending,
        setTimer: (callback, ms) => { const handle = { callback, ms }; pending.push(handle); return handle; },
        clearTimer: (handle) => { const i = pending.indexOf(handle); if (i >= 0) pending.splice(i, 1); },
        async fire() {
            const handle = pending.shift();
            handle.callback();
            // Let the run and its listeners finish.
            for (let i = 0; i < 10; i++) await Promise.resolve();
            await new Promise((resolve) => setTimeout(resolve, 0));
            return handle.ms;
        }
    };
}

function fakeSync({ behind = () => false } = {}) {
    const synced = [];
    return {
        synced,
        sync: async (target) => {
            synced.push(target.id);
            const late = behind(target);
            return { target: target.id, substrates: [{ substrate: 'nostr', ok: true, caughtUp: !late, backfillDone: true }] };
        }
    };
}

const target = (id) => ({ id });

async function run() {
    // Section A: timing.
    {
        const timers = fakeTimers();
        let isBehind = true;
        const sync = fakeSync({ behind: () => isBehind });
        const scheduler = new BackgroundAnnouncementSync({
            sync, targets: () => ({ core: [target('snapshot'), target('commentary')], rotating: [] }),
            firstDelayMs: 10, intervalMs: 1000, catchUpIntervalMs: 50,
            setTimer: timers.setTimer, clearTimer: timers.clearTimer
        });
        const summaries = [];
        scheduler.onSynced((summary) => summaries.push(summary));
        scheduler.onSynced(() => { throw new Error('a broken listener'); });
        scheduler.start();
        scheduler.start();
        assert(timers.pending.length === 1 && timers.pending[0].ms === 10, 'A1. start() schedules one first run after the short delay, once');

        await timers.fire();
        assert(JSON.stringify(sync.synced) === JSON.stringify(['snapshot', 'commentary']), 'A2. a run syncs every core target, one after another');
        assert(summaries.length === 1 && summaries[0].behind === true, 'A3. listeners hear each run, and a broken one does not stop them');
        assert(timers.pending.length === 1 && timers.pending[0].ms === 50, 'A4. while an endpoint is behind, the next run comes sooner');

        isBehind = false;
        await timers.fire();
        assert(timers.pending[0].ms === 1000, 'A5. once caught up, runs fall back to the regular interval');

        scheduler.stop();
        assert(timers.pending.length === 0, 'A6. stop() cancels the next run');
        console.log('✓ Section A: first run, catch-up and regular intervals, stop');
    }

    // Section B: inactive tabs skip runs; runNow joins a run in progress.
    {
        const timers = fakeTimers();
        const sync = fakeSync();
        let active = false;
        const scheduler = new BackgroundAnnouncementSync({
            sync, targets: () => ({ core: [target('snapshot')], rotating: [] }),
            firstDelayMs: 10, intervalMs: 1000, isActive: () => active,
            setTimer: timers.setTimer, clearTimer: timers.clearTimer
        });
        scheduler.start();
        await timers.fire();
        assert(sync.synced.length === 0 && timers.pending[0].ms === 1000, 'B1. nothing runs while inactive; it checks again later');
        active = true;
        const [a, b] = [scheduler.runNow(), scheduler.runNow()];
        assert(a === b, 'B2. runNow() joins the run already in progress');
        await a;
        assert(sync.synced.length === 1, 'B3. one run, not two');
        scheduler.stop();
        console.log('✓ Section B: inactive tabs and concurrent runNow()');
    }

    // Section C: rotating targets are spread over runs.
    {
        const timers = fakeTimers();
        const sync = fakeSync();
        const rotating = ['r1', 'r2', 'r3', 'r4', 'r5'].map(target);
        const scheduler = new BackgroundAnnouncementSync({
            sync, targets: () => ({ core: [target('core')], rotating }),
            maxRotatingTargetsPerRun: 2, setTimer: timers.setTimer, clearTimer: timers.clearTimer
        });
        await scheduler.runNow();
        await scheduler.runNow();
        await scheduler.runNow();
        assert(JSON.stringify(sync.synced) === JSON.stringify(['core', 'r1', 'r2', 'core', 'r3', 'r4', 'core', 'r5', 'r1']),
            'C1. core targets run every time; rotating ones take turns, a few per run');
        console.log('✓ Section C: rotation over many Place Naming tags');
    }

    // Section D: a failing sync ends the run, not the schedule.
    {
        const timers = fakeTimers();
        const scheduler = new BackgroundAnnouncementSync({
            sync: { sync: async () => { throw new Error('unexpected'); } },
            targets: () => ({ core: [target('core')], rotating: [] }),
            intervalMs: 1000, setTimer: timers.setTimer, clearTimer: timers.clearTimer
        });
        scheduler.start();
        await timers.fire();
        assert(timers.pending.length === 1 && timers.pending[0].ms === 1000, 'D1. the next run is still scheduled');
        scheduler.stop();
        console.log('✓ Section D: failures never stop the schedule');
    }

    // Section E: the tags a search asked about are watched, found or not.
    {
        let clock = 0;
        const storage = new InMemoryStorageProvider();
        const index = new AnnouncementIndex({ storage, now: () => clock, maxWatchedTags: 2 });
        const source = new RecordingDiscoverySource({ search: async () => [] }, { index, kind: AnnouncementKind.PLACE_NAMING, origin: 'nostr' });
        await source.search('tag-a');
        clock += 120000;
        await source.search('tag-b');
        assert(JSON.stringify(index.watchedTags(AnnouncementKind.PLACE_NAMING)) === JSON.stringify(['tag-b', 'tag-a']), 'E1. searched tags are watched, most recent first, even with nothing found');
        clock += 120000;
        await source.search('tag-c');
        assert(JSON.stringify(index.watchedTags(AnnouncementKind.PLACE_NAMING)) === JSON.stringify(['tag-c', 'tag-b']), 'E2. past the cap, the least recently searched tag is dropped');

        let saves = 0;
        const counting = new InMemoryStorageProvider();
        const save = counting.save.bind(counting);
        counting.save = (name, data) => { saves += 1; save(name, data); };
        const throttled = new AnnouncementIndex({ storage: counting, now: () => 0 });
        for (let i = 0; i < 5; i++) throttled.watch(AnnouncementKind.PLACE_NAMING, 'tag');
        assert(saves === 1, 'E3. repeated searches of one tag within a minute write once');
        console.log('✓ Section E: watched tags');
    }

    // Section F: after a background sync, World View shows everything the index holds.
    {
        const envelope = (id) => ({
            protocol: 'forkbuild-place-naming-discovery', version: 1, worldId: 'w', regionId: 'r',
            claim: { id, worldId: 'w', regionId: 'r', name: 'N', authorIdentityId: 'did:key:z', createdAt: '2026-01-01T00:00:00.000Z',
                signature: { algorithm: 'ed25519', signer: 'did:key:z', signature: 's', signedHash: 'h', domain: 'forkbuild.place-naming-claim' } }
        });
        const monitor = new PlaceNamingDiscoveryMonitor({ resolveClaimPosition: () => ({ x: 0, z: 0 }) });
        monitor.seed({ x: 0, z: 0 }, [envelope('first')]);
        assert(monitor.seed({ x: 0, z: 0 }, [envelope('first'), envelope('synced')]) === false, 'F1. a plain seed never replaces a result');
        assert(monitor.seed({ x: 0, z: 0 }, [envelope('first'), envelope('synced')], { replace: true }) === true, 'F2. replace does');
        assert(monitor.lastResult.length === 2, 'F3. the synced claim now shows');
        console.log('✓ Section F: a background sync refreshes the claims on screen');
    }

    console.log('\nAll BackgroundAnnouncementSync tests passed.');
}

run().catch((error) => {
    console.error('BackgroundAnnouncementSync.test.js FAILED:', error);
    process.exitCode = 1;
});
