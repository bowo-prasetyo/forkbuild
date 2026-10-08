// A week's challenge entries: the tags a Publication's announcement carries
// for its build (core/NarrowDiscoveryTags.js, the Nostr and Arweave
// announcement publishers), finding entries under a week's tag
// (application/challenge/ChallengeEntryDiscovery.js), the per-tag log of
// what was found, and the list the challenge page shows
// (application/challenge/ChallengeEntries.js).
import { buildTagDiscoveryTag, buildTagDiscoveryTags, announcedBuildTagDiscoveryTags } from '../core/NarrowDiscoveryTags.js';
import { NostrPublicationDiscoveryPublisher } from '../application/nostr/NostrPublicationDiscoveryPublisher.js';
import { NostrMultiRelayPublicationDiscoveryPublisher } from '../application/nostr/NostrMultiRelayPublicationDiscoveryPublisher.js';
import { ArweaveAnnouncementPublisher } from '../application/arweave/ArweaveAnnouncementPublisher.js';
import { RepositoryNetworkDiscovery } from '../application/publication/RepositoryNetworkDiscovery.js';
import { ChallengeEntryDiscovery } from '../application/challenge/ChallengeEntryDiscovery.js';
import { ChallengeEntryLog, MAX_LOGGED_ENTRIES } from '../application/challenge/ChallengeEntryLog.js';
import { listChallengeEntries } from '../application/challenge/ChallengeEntries.js';
import { publishedBuildTags } from '../application/challenge/PublishedBuildTags.js';
import { composeWorldEncounterMaterialVerifier } from '../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Document } from '../core/Document.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

const ENTRY_TAG = 'lighthouse-20261012';
const ENVELOPE = Object.freeze({ protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', uri: `ar://${'m'.repeat(43)}` });

// Section A — a build's tags become narrow discovery tags; nothing else does.
{
    assert(buildTagDiscoveryTag(ENTRY_TAG) === `forkbuild-tag:${ENTRY_TAG}`, 'A1. a build tag gets the forkbuild-tag: prefix');
    for (const tag of ['Lighthouse', 'x', 'forkbuild-x', '', null, 'two words']) {
        assert(buildTagDiscoveryTag(tag) === null, `A2. ${JSON.stringify(tag)} is not announced`);
    }
    const tags = buildTagDiscoveryTags(['a1', 'a1', 'bad tag', 'b2', 'c3', 'd4', 'e5', 'f6']);
    assert(tags.length === 5 && tags[0] === 'forkbuild-tag:a1' && !tags.includes('forkbuild-tag:f6'), 'A3. each once, invalid ones left out, at most five');
    assert(announcedBuildTagDiscoveryTags(() => { throw new Error('no snapshot'); }, 'pub-1').length === 0, 'A4. unreadable tags announce nothing');
    assert(announcedBuildTagDiscoveryTags(null, 'pub-1').length === 0, 'A5. no reader, no build tags');
    console.log('✓ A. build tags become narrow discovery tags');
}

// Section B — Nostr and Arweave announcements of a Publication carry its build's tags.
{
    const events = [];
    const publishImpl = async (relayUrl, template) => {
        events.push({ relayUrl, template });
        return { published: true, id: 'f'.repeat(64) };
    };
    const buildTagsFor = (publicationId) => (publicationId === 'pub-1' ? [ENTRY_TAG, 'harbor'] : []);
    const nostr = new NostrPublicationDiscoveryPublisher({ discoveryTag: 'forkbuild-publication', publishImpl, buildTagsFor });
    await nostr.publish(ENVELOPE);
    const nostrTags = events[0].template.tags.map(([, value]) => value);
    assert(nostrTags[0] === 'forkbuild-publication', 'B1. the global tag stays first');
    assert(nostrTags.includes('forkbuild-publication:pub-1'), 'B2. the record tag is kept');
    assert(nostrTags.includes(`forkbuild-tag:${ENTRY_TAG}`) && nostrTags.includes('forkbuild-tag:harbor'), 'B3. each build tag is announced');
    assert(events[0].template.tags.every(([name]) => name === 't'), 'B4. all as Nostr topic tags');

    events.length = 0;
    await new NostrPublicationDiscoveryPublisher({ discoveryTag: 'forkbuild-publication', publishImpl }).publish(ENVELOPE);
    assert(events[0].template.tags.length === 2, 'B5. without a tag reader the announcement is as before');

    events.length = 0;
    const multi = new NostrMultiRelayPublicationDiscoveryPublisher({ relayUrls: ['wss://a.example', 'wss://b.example'], discoveryTag: 'forkbuild-publication', publishImpl, buildTagsFor });
    await multi.publish(ENVELOPE);
    assert(events.length === 2 && events.every(({ template }) => template.tags.some(([, value]) => value === `forkbuild-tag:${ENTRY_TAG}`)), 'B6. every relay gets the build tags');

    const uploads = [];
    const arweave = new ArweaveAnnouncementPublisher({
        discoveryTag: 'forkbuild-publication',
        uploadTaggedTransaction: async (material, tag, extraTags) => { uploads.push({ tag, extraTags }); return { id: 'tx1' }; },
        buildTagsFor
    });
    await arweave.publish(ENVELOPE);
    const arweaveValues = uploads[0].extraTags.map(({ value }) => value);
    assert(arweaveValues.includes('forkbuild-publication:pub-1') && arweaveValues.includes(`forkbuild-tag:${ENTRY_TAG}`), 'B7. Arweave carries the record tag and the build tags');
    assert(uploads[0].extraTags.every(({ name }) => name === ArweaveAnnouncementPublisher.DEFAULT_TAG_NAME), 'B8. under the discovery tag name its reader asks for');
    console.log('✓ B. announcements carry the build\'s tags');
}

// Section C — a published build's tags are read from its snapshot.
{
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(new InMemoryStorageProvider());
    identity.login('alice');
    const document = new Document();
    document.metadata.title = 'Lighthouse';
    document.metadata.tags = [ENTRY_TAG, 'harbor'];
    const publication = new LocalPublisherProvider(storage).publish(document, identity);
    document.metadata.tags = ['changed-later'];
    assert(publishedBuildTags(storage, publication.id).join() === `${ENTRY_TAG},harbor`, 'C1. the tags it was published with');
    assert(publishedBuildTags(storage, 'pub-unknown').length === 0, 'C2. none for a build this device has no snapshot of');
    assert(publishedBuildTags({ load() { throw new Error('broken'); } }, publication.id).length === 0, 'C3. none when storage fails');
    console.log('✓ C. a published build\'s tags come from its snapshot');
}

// Section D — the per-tag log of entries found on the networks.
{
    const log = new ChallengeEntryLog(new InMemoryStorageProvider());
    assert(log.list(ENTRY_TAG).length === 0, 'D1. empty at first');
    assert(log.add(ENTRY_TAG, ['p1', 'p2', 'p1', '', null]) === 2, 'D2. each id once, empty ones skipped');
    assert(log.add(ENTRY_TAG, ['p2', 'p3']) === 1, 'D3. only new ids are added');
    assert(log.list(ENTRY_TAG).join() === 'p1,p2,p3', 'D4. oldest first');
    assert(log.list('castle-20261019').length === 0, 'D5. each tag has its own');
    log.add(ENTRY_TAG, Array.from({ length: MAX_LOGGED_ENTRIES }, (_, i) => `n${i}`));
    const kept = log.list(ENTRY_TAG);
    assert(kept.length === MAX_LOGGED_ENTRIES && kept[kept.length - 1] === `n${MAX_LOGGED_ENTRIES - 1}` && !kept.includes('p1'), 'D6. the newest are kept');
    console.log('✓ D. the entry log keeps what was found per tag');
}

// Section E — finding entries on the networks under the week's tag.
{
    const identity = new LocalIdentityProvider(new InMemoryStorageProvider());
    identity.login('bob');
    const signed = (id) => {
        const publication = new Publication({
            id, documentId: `doc-${id}`, title: id, author: 'bob',
            contentReference: new ContentReference({ hash: `hash-${id}` }),
            publisherIdentity: identity.getSigningIdentity().toJSON()
        });
        return publication.withSignature(identity.signCanonical(publication.getSigningDescriptor()));
    };
    const AR_NEW = `ar://${'n'.repeat(43)}`;
    const AR_KNOWN = `ar://${'k'.repeat(43)}`;
    const asked = [];
    const service = {
        searchEnvelopes: async (tag) => {
            asked.push(tag);
            return tag === `forkbuild-tag:${ENTRY_TAG}`
                ? [{ origin: 'dweb:nostr:wss://relay.example', kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-new', uri: AR_NEW },
                    { origin: 'dweb:nostr:wss://relay.example', kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-known', uri: AR_KNOWN }]
                : [];
        }
    };
    const fetched = [];
    const materialSources = {
        decentralized: {
            load: async (selection, lead) => {
                fetched.push(lead.uri);
                return lead.uri === AR_NEW ? JSON.parse(JSON.stringify(signed('pub-new').toJSON())) : null;
            }
        }
    };
    const admitted = [];
    const entryLog = new ChallengeEntryLog(new InMemoryStorageProvider());
    const discovery = new ChallengeEntryDiscovery({
        services: [service],
        materialSources,
        verifier: composeWorldEncounterMaterialVerifier().verifier,
        isKnown: (id) => id === 'pub-known',
        admit: (publication) => admitted.push(publication.id),
        entryLog
    });
    const result = await discovery.run(ENTRY_TAG);
    assert(asked[0] === `forkbuild-tag:${ENTRY_TAG}`, 'E1. it asks for the week\'s narrow tag');
    assert(admitted.join() === 'pub-new', 'E2. a new, verified entry is admitted to the Repository');
    assert(!fetched.includes(AR_KNOWN), 'E3. a build this device already lists is not fetched');
    assert(entryLog.list(ENTRY_TAG).sort().join() === 'pub-known,pub-new', 'E4. both are logged as entries');
    assert(result.found === 2 && result.pending === 0, 'E5. it says how many entries were new');
    assert((await discovery.run('Not A Tag')).found === 0, 'E6. an invalid tag searches nothing');
    console.log('✓ E. entries are found under the week\'s tag and logged');
}

// Section F — RepositoryNetworkDiscovery reports the known ids it skipped.
{
    const discovery = new RepositoryNetworkDiscovery({
        services: [{ searchEnvelopes: async () => [{ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-a', uri: 'ar://a' }, { kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-a', uri: 'ar://a2' }] }],
        discoveryTag: 'forkbuild-publication',
        materialSources: {},
        verifier: null,
        isKnown: () => true,
        admit: () => {}
    });
    const result = await discovery.run();
    assert(result.known.join() === 'pub-a' && result.admitted.length === 0, 'F1. a known id is reported once and never fetched');
    console.log('✓ F. known ids are reported');
}

// Section G — the list the challenge page shows.
{
    const publication = (id, documentId, publishedAt, extra = {}) => ({ id, documentId, publishedAt: new Date(publishedAt), ...extra });
    const publications = [
        publication('p1', 'd1', '2026-10-13T10:00:00Z'),
        publication('p1b', 'd1', '2026-10-14T10:00:00Z'),
        publication('p2', 'd2', '2026-10-15T10:00:00Z'),
        publication('p3', 'd3', '2026-10-16T10:00:00Z'),
        publication('p4', 'd4', '2026-10-17T10:00:00Z'),
        { id: 'broken' }
    ];
    const tags = { p1: [ENTRY_TAG], p1b: [ENTRY_TAG], p2: ['harbor'], p3: [] };
    const entries = listChallengeEntries({
        publications,
        tag: ENTRY_TAG,
        tagsOf: (p) => { if (p.id === 'p4') throw new Error('unreadable'); return tags[p.id] || []; },
        loggedIds: ['p3']
    });
    assert(entries.map((p) => p.id).join() === 'p3,p1b', `G1. tagged or found under the tag, one per build, newest first (got ${entries.map((p) => p.id)})`);
    assert(listChallengeEntries({ publications, tag: '' }).length === 0, 'G2. no tag, no entries');
    assert(listChallengeEntries({ publications: null, tag: ENTRY_TAG }).length === 0, 'G3. no publications, no entries');
    console.log('✓ G. the challenge page lists each entry once, newest first');
}
