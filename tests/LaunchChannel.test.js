// Counting which launch post a visit came through (core/LaunchChannel.js,
// application/settings/CountLaunchChannel.js): only a listed `?ref=` value,
// only under the visitor count's rules, as its own fixed path; and the
// parameter taken out of the address.
import { LAUNCH_CHANNELS, addressWithoutLaunchChannel, launchChannelHitUrl, launchChannelOf } from '../core/LaunchChannel.js';
import { VISITOR_COUNT_SITE_ORIGIN } from '../core/VisitorCount.js';
import { countLaunchChannel } from '../application/settings/CountLaunchChannel.js';
import { assert } from './support/Assert.js';

// Only a listed channel, named once, counts.
{
    assert(launchChannelOf('?ref=hn') === 'hn', 'a listed channel is read');
    assert(launchChannelOf('?utm=x&ref=producthunt') === 'producthunt', 'beside other parameters');
    for (const search of ['', '?', '?ref=', '?ref=HN', '?ref=hn&ref=reddit', '?ref=evil.example', '?ref=hn%2Fx', '?source=hn', null, 42]) {
        assert(launchChannelOf(search) === null, `${JSON.stringify(search)} names no channel`);
    }
    for (const channel of LAUNCH_CHANNELS) {
        assert(/^[a-z]+$/.test(channel), `${channel} is a plain path segment`);
        assert(launchChannelHitUrl(channel, '123') === `https://forkbuild.goatcounter.com/count?p=%2Fr%2F${channel}&rnd=123`, `${channel} is counted as /r/${channel}`);
    }
    let threw = false;
    try { launchChannelHitUrl('evil', '1'); } catch { threw = true; }
    assert(threw, 'an unlisted channel can never be sent');
    console.log('✓ only a listed channel, named once, is counted as its own fixed path');
}

// Under the visitor count's rules.
{
    const run = ({ search = '?ref=hn', enabled = true, origin = VISITOR_COUNT_SITE_ORIGIN, privacySignals = {}, broken = false } = {}) => {
        const hits = [];
        const result = countLaunchChannel({
            search,
            settingsStore: { get: () => { if (broken) throw new Error('storage'); return { enabled }; } },
            origin,
            privacySignals,
            random: () => 0.5,
            sendHit: (url) => hits.push(url)
        });
        return { result, hits };
    };
    const counted = run();
    assert(counted.result === 'hn' && counted.hits.length === 1 && counted.hits[0].includes('p=%2Fr%2Fhn&'), 'a visit through a launch link is counted once');
    assert(run({ search: '' }).hits.length === 0, 'an ordinary visit sends nothing more');
    assert(run({ enabled: false }).hits.length === 0, 'not when Count this browser is off');
    assert(run({ origin: 'http://localhost:8000' }).hits.length === 0, 'not from another copy of the site');
    assert(run({ privacySignals: { globalPrivacyControl: true } }).hits.length === 0, 'not with Global Privacy Control');
    assert(run({ privacySignals: { doNotTrack: '1' } }).hits.length === 0, 'not with Do Not Track');
    assert(run({ broken: true }).result === null, 'never throws');
    console.log('✓ counted under the visitor count\'s own rules');
}

// The parameter leaves the address; everything else stays.
{
    assert(addressWithoutLaunchChannel('https://bowo-prasetyo.github.io/forkbuild/?ref=hn#/challenge') === 'https://bowo-prasetyo.github.io/forkbuild/#/challenge', 'the hash route is kept');
    assert(addressWithoutLaunchChannel('https://example.com/?a=1&ref=nope') === 'https://example.com/?a=1', 'other parameters are kept, and an unlisted ref is taken out too');
    assert(addressWithoutLaunchChannel('https://example.com/#/editor?ref=hn') === null, 'a ref inside the hash route is not the launch parameter');
    assert(addressWithoutLaunchChannel('https://example.com/') === null && addressWithoutLaunchChannel('not a url') === null, 'nothing to change');
    console.log('✓ the parameter is taken out of the address');
}
