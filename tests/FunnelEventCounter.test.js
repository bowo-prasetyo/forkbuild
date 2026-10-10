import { FunnelEvent, VISITOR_COUNT_SITE_ORIGIN, funnelEventHitUrl, isFunnelEvent, publishedBrickRangeEvent, publishedBuildEvents } from '../core/VisitorCount.js';
import { worldBrickCount } from '../core/BuilderStamps.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { FunnelEventCounter } from '../application/settings/FunnelEventCounter.js';
import { VisitorCountSettingsStore } from '../application/settings/VisitorCountSettingsStore.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// The share funnel's three events (docs/Privacy.md, "Visitor count"): each a
// fixed path, sent under the daily count's own rules and setting.

function counter({ origin = VISITOR_COUNT_SITE_ORIGIN, privacySignals = {}, enabled = true, sendHit = null } = {}) {
    const store = new VisitorCountSettingsStore({ storageProvider: new InMemoryStorageProvider() });
    store.setEnabled(enabled);
    const hits = [];
    const instance = new FunnelEventCounter({ settingsStore: store, origin, privacySignals, random: () => 0.5, sendHit: sendHit ?? ((url) => hits.push(url)) });
    return { instance, hits, store };
}

// Each event is one fixed path; nothing else can be sent.
{
    assert(funnelEventHitUrl(FunnelEvent.SHARE_LINK, '5') === 'https://forkbuild.goatcounter.com/count?p=%2Fe%2Fshare-link&rnd=5', 'a share link is /e/share-link');
    assert(funnelEventHitUrl(FunnelEvent.OPENED_SHARED_LINK, '5').includes('p=%2Fe%2Fopened-shared-link&'), 'an opened link is /e/opened-shared-link');
    assert(funnelEventHitUrl(FunnelEvent.REMIX_FROM_LINK, '5').includes('p=%2Fe%2Fremix-from-link&'), 'a remix is /e/remix-from-link');
    assert(funnelEventHitUrl(FunnelEvent.INSTALLED, '5').includes('p=%2Fe%2Finstalled&'), 'installing ForkBuild is /e/installed');
    let refused = false;
    try {
        funnelEventHitUrl('../anything', '5');
    } catch {
        refused = true;
    }
    assert(refused && !isFunnelEvent('page-view') && !isFunnelEvent(undefined), 'any other path is refused');
    const { instance, hits } = counter();
    assert(instance.count('my-build-title') === false && hits.length === 0, 'the counter sends nothing for an unknown event');
    console.log('✓ fixed paths only');
}

// Under the daily count's rules: the official site, the setting, GPC and DNT.
{
    const sent = counter();
    assert(sent.instance.sharedLink() === true && sent.instance.sharedLink() === true && sent.hits.length === 2, 'every share is counted, not once a day');
    assert(counter({ origin: 'http://localhost:8000' }).instance.sharedLink() === false, 'not from a copy elsewhere');
    assert(counter({ enabled: false }).instance.sharedLink() === false, 'not when the visitor count is turned off');
    assert(counter({ privacySignals: { globalPrivacyControl: true } }).instance.sharedLink() === false, 'not with Global Privacy Control');
    assert(counter({ privacySignals: { doNotTrack: '1' } }).instance.sharedLink() === false, 'not with Do Not Track');
    const turnedOff = counter();
    turnedOff.store.setEnabled(false);
    assert(turnedOff.instance.sharedLink() === false, 'turning it off takes effect at once');
    const failing = counter({ sendHit: () => { throw new Error('blocked'); } });
    assert(failing.instance.sharedLink() === false, 'a hit that fails never throws');
    console.log('✓ the same rules as the daily count');
}

// A remix counts only for a build opened from a link, once.
{
    const { instance, hits } = counter();
    assert(instance.forked('doc-1') === false, 'a fork of something not opened from a link is not counted');
    instance.openedSharedLink('doc-1');
    assert(instance.forked('doc-2') === false, 'nor a fork of another build');
    assert(instance.forked('doc-1') === true && hits.at(-1).includes('remix-from-link'), 'copying a build opened from a link is a remix from a link');
    assert(instance.forked('doc-1') === false, 'counted once');
    assert(hits.filter((url) => url.includes('opened-shared-link')).length === 1, 'opening the link was counted');
    console.log('✓ remixes from a link');
}

// Installing ForkBuild as an app.
{
    const { instance, hits } = counter();
    assert(instance.installed() === true && hits.at(-1).includes('p=%2Fe%2Finstalled&'), 'installing is counted');
    console.log('✓ installing');
}

// Embeds: the code copied, an embed shown on another site, and opened from
// there in ForkBuild, each its own fixed path.
{
    const { instance, hits } = counter();
    assert(instance.copiedEmbedCode() === true && hits.at(-1).includes('p=%2Fe%2Fembed-code&'), 'copying embed code is /e/embed-code');
    assert(instance.embedViewed() === true && hits.at(-1).includes('p=%2Fe%2Fembed-view&'), 'an embed shown is /e/embed-view');
    assert(instance.openedFromEmbed() === true && hits.at(-1).includes('p=%2Fe%2Fembed-open&'), 'opening it in ForkBuild is /e/embed-open');
    assert(instance.joinedChallenge() === true && hits.at(-1).includes('p=%2Fe%2Fchallenge-join&'), 'joining the weekly challenge is /e/challenge-join');
    assert(counter({ privacySignals: { globalPrivacyControl: true } }).instance.embedViewed() === false, 'under the same rules');
    console.log('✓ embeds');
}

// A build's first publish from this device: its brick range, this device's
// second build, a remix of someone else's. Published for real, so the
// counter reads the same records the app does.
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage, new LocalContentStore(storage));
    const discovery = new LocalDiscoveryProvider(storage);
    const store = new VisitorCountSettingsStore({ storageProvider: new InMemoryStorageProvider() });
    const hits = [];
    const instance = new FunnelEventCounter({
        settingsStore: store, origin: VISITOR_COUNT_SITE_ORIGIN, random: () => 0.5,
        sendHit: (url) => hits.push(url), listOwnPublications: () => discovery.list()
    });
    const build = (title, bricks, parentDocumentId = null) => {
        const world = new World();
        const building = new Building({ creator: 'alice' });
        for (let i = 0; i < bricks; i++) building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(i, 0.5, 0) }));
        world.addBuilding(building);
        return new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice', parentDocumentId }) });
    };
    const publish = (document) => instance.publishedBuild(publisher.publish(document, null), worldBrickCount(document.world));

    const first = build('First', 12);
    assert(worldBrickCount(first.world) === 12, 'an open build\'s bricks are counted');
    assert(publish(first).join() === 'publish-bricks-10', 'a first build: only its brick range');
    assert(hits.at(-1) === 'https://forkbuild.goatcounter.com/count?p=%2Fe%2Fpublish-bricks-10&rnd=5', 'a fixed path, with no count, title or id');
    assert(publish(first).length === 0, 'publishing the same build again adds nothing');

    const second = build('Second', 250);
    assert(publish(second).join() === 'publish-bricks-200,second-build', 'the second build is counted once, as such');
    const ownRemix = build('Mine again', 3, first.world.id);
    assert(publish(ownRemix).join() === 'publish-bricks-1', 'a third build is not a second, and a copy of one\'s own build is not a remix');
    const remix = build('Remix', 60, 'someone-elses-build');
    assert(publish(remix).join() === 'publish-bricks-50,remix-published', 'a copy of someone else\'s build is a remix');
    assert(hits.every((url) => !url.includes('someone') && !url.includes('Remix')), 'nothing about the build is sent');

    assert(publishedBrickRangeEvent(0) === 'publish-bricks-0' && publishedBrickRangeEvent(9) === 'publish-bricks-1'
        && publishedBrickRangeEvent(49) === 'publish-bricks-10' && publishedBrickRangeEvent(199) === 'publish-bricks-50'
        && publishedBrickRangeEvent(undefined) === 'publish-bricks-0', 'five ranges, by their lowest count');
    assert(publishedBuildEvents({ publication: null, brickCount: 5 }).length === 0, 'no build, nothing');

    store.setEnabled(false);
    assert(publish(build('Uncounted', 5)).length === 0, 'under the daily count\'s setting');
    const failing = new FunnelEventCounter({ settingsStore: store, origin: VISITOR_COUNT_SITE_ORIGIN, sendHit: () => {}, listOwnPublications: () => { throw new Error('broken'); } });
    assert(failing.publishedBuild({ id: 'p', documentId: 'd' }, 5).length === 0, 'records that can\'t be read never throw');
    console.log('✓ published builds');
}
