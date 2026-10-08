// Challenge entries distributed to Steem: a publication's announcement reply
// carries its build's tags in `json_metadata.forkbuild.tags`
// (core/SteemDiscoveryAnnouncement.js), the publisher reads them from the
// published snapshot, and the Steem publication query answers a build-tag
// discovery tag (`forkbuild-tag:<tag>`) with the replies that list it, so the
// weekly challenge finds Steem entries among the replies it already reads.
import { steemDiscoveryAnnouncementOperations, parseSteemDiscoveryAnnouncement } from '../core/SteemDiscoveryAnnouncement.js';
import { SteemPublicationDiscoveryPublisher } from '../application/steem/SteemPublicationDiscoveryPublisher.js';
import { SteemPublicationDiscoveryQueryService } from '../application/steem/SteemPublicationDiscoveryQueryService.js';
import { buildTagDiscoveryTag } from '../core/NarrowDiscoveryTags.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { assert } from './support/Assert.js';

const TAG = 'chapel-20261005';
const THREAD = { threadAccount: 'forkbuild', threadPermlink: 'forkbuild-publications-2026-10' };
const envelopeOf = (objectId) => ({ protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId, uri: `steem://alice/${objectId}-claim` });

function reply({ objectId, tags, permlink = `forkbuild-${objectId}` }) {
    const [[, comment]] = steemDiscoveryAnnouncementOperations({
        author: 'alice', ...THREAD, family: 'publication', envelope: envelopeOf(objectId), permlink, tags
    });
    return { ...comment, created: '2026-10-08T10:00:00' };
}

// Section A — the reply carries the build's tags in ForkBuild's own metadata, and they read back.
{
    const tagged = reply({ objectId: 'pub-a', tags: [TAG, 'Garden', 'forkbuild-x', 'garden'] });
    const metadata = JSON.parse(tagged.json_metadata);
    assert(metadata.forkbuild.tags.join() === `${TAG},garden`, `A1. normalized, each once, ForkBuild's own left out (got ${metadata.forkbuild.tags})`);
    assert(!('tags' in metadata), 'A2. not as Steem\'s own tags, which mean nothing on a reply');
    const parsed = parseSteemDiscoveryAnnouncement(tagged, { ...THREAD, family: 'publication' });
    assert(parsed.tags.join() === `${TAG},garden`, 'A3. the reader gets them back');
    const untagged = reply({ objectId: 'pub-b', tags: [] });
    assert(!('tags' in JSON.parse(untagged.json_metadata).forkbuild), 'A4. no tags, no field: the reply is as before');
    assert(parseSteemDiscoveryAnnouncement(untagged, { ...THREAD, family: 'publication' }).tags.length === 0, 'A5. and reads back with none');
    console.log('✓ A. a Steem announcement reply carries its build\'s tags');
}

// Section B — the publisher announces a publication with its build's tags.
{
    const announced = [];
    const announcer = { announce: async (family, envelope, options) => { announced.push({ family, envelope, options }); return { threadUrl: 'https://steemit.com/x', id: 'tx', url: 'https://steemit.com/y' }; } };
    await new SteemPublicationDiscoveryPublisher({ announcer, buildTagsFor: (id) => (id === 'pub-a' ? [TAG, 'garden'] : []) }).publish(envelopeOf('pub-a'));
    assert(announced[0].family === 'publication' && announced[0].options.tags.join() === `${TAG},garden`, 'B1. the build\'s tags go with the announcement');
    await new SteemPublicationDiscoveryPublisher({ announcer, buildTagsFor: () => { throw new Error('no snapshot'); } }).publish(envelopeOf('pub-c'));
    assert(announced[1].options.tags.length === 0, 'B2. tags that can\'t be read are left out, never refusing the announcement');
    await new SteemPublicationDiscoveryPublisher({ announcer }).publish(envelopeOf('pub-d'));
    assert(announced[2].options.tags.length === 0, 'B3. without a tag reader, none');
    console.log('✓ B. the publisher announces the build\'s tags');
}

// Section C — the Steem publication query answers the week's tag with the replies that list it.
{
    const announcements = [reply({ objectId: 'pub-entry', tags: [TAG] }), reply({ objectId: 'pub-other', tags: ['castle'] }), reply({ objectId: 'pub-old', tags: [] })]
        .map((r) => parseSteemDiscoveryAnnouncement(r, { ...THREAD, family: 'publication' }));
    const reader = { threadAccounts: ['forkbuild'], read: async (family) => ({ announcements: family === 'publication' ? announcements : [] }) };
    const service = new SteemPublicationDiscoveryQueryService({ reader });
    const all = await service.searchEnvelopes('forkbuild-publication');
    assert(all.length === 3, 'C1. the shared tag still finds every publication');
    const entries = await service.searchEnvelopes(buildTagDiscoveryTag(TAG));
    assert(entries.length === 1 && entries[0].objectId === 'pub-entry', `C2. the week's tag finds only the reply that lists it (got ${entries.map((e) => e.objectId)})`);
    assert((await service.searchEnvelopes(buildTagDiscoveryTag('lighthouse-20261012'))).length === 0, 'C3. a tag no reply lists finds nothing');
    assert((await service.searchEnvelopes('forkbuild-snapshot')).length === 0, 'C4. any other tag finds nothing, as before');
    console.log('✓ C. Steem answers the week\'s tag with the announcements that list it');
}
