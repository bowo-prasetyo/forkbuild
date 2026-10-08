import { FunnelEvent, VISITOR_COUNT_SITE_ORIGIN, funnelEventHitUrl, isFunnelEvent } from '../core/VisitorCount.js';
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
    assert(counter({ privacySignals: { globalPrivacyControl: true } }).instance.embedViewed() === false, 'under the same rules');
    console.log('✓ embeds');
}
