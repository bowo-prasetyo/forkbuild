import { createHash } from 'node:crypto';
import { createAppNostrSigner, generateNostrSecretKey, isNostrSecretKey, nostrEventId, verifyNostrEvent } from '../nostr/AppNostrSigner.js';
import { createNostrInjectedProviderPublisher } from '../nostr/NostrInjectedProviderPublisher.js';
import {
    BUILD_NOTE_KIND, BUILD_NOTE_TAG, MAX_BUILD_NOTE_PAYLOAD_LENGTH, buildNoteFilter, buildNoteTemplate, latestBuildNotes, readBuildNote
} from '../core/publication/BuildNote.js';
import { BuildNoteSendOutcome, PublishBuildNoteUseCase } from '../application/buildNotes/PublishBuildNoteUseCase.js';
import { BuildNoteDiscovery } from '../application/buildNotes/BuildNoteDiscovery.js';
import { CarrierKeyStore } from '../application/buildNotes/CarrierKeyStore.js';
import { challengeDiscoveryWithBuildNotes, repositoryDiscoveryWithBuildNotes } from '../application/buildNotes/WithBuildNotes.js';
import { Findability, FindabilityStore } from '../application/settings/FindabilityStore.js';
import { ChallengeEntryLog } from '../application/challenge/ChallengeEntryLog.js';
import { decodePublicationLinkPayload, encodePublicationLinkPayload } from '../application/publication/sharing/PublicationLinkPayload.js';
import { readPublishedBuildText } from '../application/publication/PublicationShareLink.js';
import { openPublicationLink, OpenPublicationLinkOutcome } from '../application/publication/OpenPublicationLink.js';
import { composeWorldEncounterMaterialVerifier } from '../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { StoreSnapshotContentUseCase } from '../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { LocalWorldEncounterPublicationAdmissionLog } from '../application/worldEncounter/LocalWorldEncounterPublicationAdmissionLog.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { Document } from '../core/document/Document.js';
import { DocumentMetadata } from '../core/document/DocumentMetadata.js';
import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { Brick } from '../core/building/Brick.js';
import { License, LicenseId } from '../core/document/License.js';
import { FunnelEvent } from '../core/app/VisitorCount.js';
import { BackupEntryGroup, backupEntryGroupOf } from '../application/backup/BackupEntryGroups.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Find each other (docs/reviews/CreativeDirection-2026-10-12.md, finding 1):
// a published build is sent to everyone as a build note, signed with a
// carrier key this device holds, and anyone's ForkBuild finds it and opens it
// as it opens a shared link, checking the builder's signature and the
// build's content hash. No wallet, extension or account is involved.

const HOUSE = VillageLibrary.structures.find((structure) => structure.id === 'village:house');

function publishBuild({ title = 'My house', tags = [], signedIn = true, bricks = HOUSE.bricks } = {}) {
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    if (signedIn) identity.login('note-alice');
    const contentStore = new LocalContentStore(storage);
    const world = new World();
    const building = new Building({ creator: 'alice' });
    for (const brick of bricks) {
        building.addBrick(new Brick({ definitionId: brick.definitionId, position: brick.position, rotation: brick.rotation, color: brick.color }));
    }
    world.addBuilding(building);
    const manager = new DocumentManager();
    manager.load(new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice', tags, license: new License({ id: LicenseId.CC_BY_4_0 }) }) }), `doc-${title}`);
    const publication = new PublishDocumentUseCase(new LocalPublisherProvider(storage, contentStore), identity).execute(manager);
    return { publication, contentStore };
}

// A relay held in memory: keeps what it is sent (a newer note replacing an
// older one with the same key and `d` tag, as NIP-01 says) and answers
// filters by kind and `#t`.
function memoryRelay({ refuse = false } = {}) {
    const events = [];
    return {
        events,
        accept(event) {
            if (refuse) return false;
            const d = event.tags.find((tag) => tag[0] === 'd')?.[1];
            const old = events.findIndex((e) => e.pubkey === event.pubkey && e.kind === event.kind && e.tags.find((tag) => tag[0] === 'd')?.[1] === d);
            if (old >= 0) events.splice(old, 1);
            events.push(event);
            return true;
        },
        query(filter) {
            return events
                .filter((event) => filter.kinds.includes(event.kind))
                .filter((event) => event.tags.some((tag) => tag[0] === 't' && filter['#t'].includes(tag[1])))
                .slice(0, filter.limit);
        }
    };
}

function relayNetwork(relays) {
    return {
        urls: Object.keys(relays),
        publish: (signer) => {
            const publisher = createNostrInjectedProviderPublisher({ injectedProvider: signer, webSocketImpl: socketTo(relays) });
            return (relayUrl, template) => publisher(relayUrl, template);
        },
        query: async (relayUrl, filter) => {
            if (!relays[relayUrl]) throw new Error('unreachable');
            return relays[relayUrl].query(filter);
        }
    };
}

// A WebSocket that speaks NIP-01's EVENT/OK exchange to memory relays.
function socketTo(relays) {
    return class FakeSocket {
        constructor(url) {
            this.url = url;
            setTimeout(() => {
                if (!relays[url]) {
                    this.onerror?.(new Error('unreachable'));
                    return;
                }
                this.onopen?.();
            }, 0);
        }

        send(text) {
            const [, event] = JSON.parse(text);
            const ok = relays[this.url].accept(event);
            setTimeout(() => this.onmessage?.({ data: JSON.stringify(['OK', event.id, ok, ok ? '' : 'blocked']) }), 0);
        }

        close() {}
    };
}

function sender({ network, contentStore, secretKey = generateNostrSecretKey(), placementClaimFor = () => ({}) }) {
    return new PublishBuildNoteUseCase({
        readBuildText: (claim) => readPublishedBuildText({ publication: claim, contentStore }),
        encodePayload: encodePublicationLinkPayload,
        publishToRelay: network.publish(createAppNostrSigner({ secretKey })),
        relayUrls: () => network.urls,
        placementClaimFor
    });
}

// Someone who has never seen the build, reading the same relays.
function reader(network, { adopted = [] } = {}) {
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const discoveryProvider = new DecentralizedPublicationDiscoveryProvider();
    const admissionLog = new LocalWorldEncounterPublicationAdmissionLog(storage);
    const entryLog = new ChallengeEntryLog(storage);
    const verifier = composeWorldEncounterMaterialVerifier().verifier;
    const discovery = new BuildNoteDiscovery({
        queryRelay: network.query,
        relayUrls: () => network.urls,
        verifyEvent: verifyNostrEvent,
        decodePayload: decodePublicationLinkPayload,
        openLinkOnly: (linkOnly) => openPublicationLink({
            linkOnly,
            verifier,
            hasLocalContent: async (reference) => contentStore.has(reference),
            storeSnapshotContent: (request) => new StoreSnapshotContentUseCase(contentStore).execute(request),
            discoveryProvider,
            admissionLog
        }),
        openedOutcome: OpenPublicationLinkOutcome.OPENED,
        adoptPlacement: async (record) => { adopted.push(record); },
        isKnown: (id) => Boolean(discoveryProvider.findById(id)),
        entryLog
    });
    return { discovery, discoveryProvider, contentStore, entryLog, adopted };
}

// The carrier key: NIP-01 ids, BIP-340 signatures, and only a valid key kept.
{
    const secretKey = generateNostrSecretKey();
    assert(isNostrSecretKey(secretKey) && !isNostrSecretKey('00'.repeat(32)) && !isNostrSecretKey('nope') && !isNostrSecretKey(null), 'only a real key is a key');
    const signer = createAppNostrSigner({ secretKey });
    const pubkey = await signer.getPublicKey();
    assert(/^[0-9a-f]{64}$/.test(pubkey), 'an x-only public key, as hex');
    const event = await signer.signEvent({ kind: 1, tags: [['t', 'x']], content: 'hello', created_at: 1700000000 });
    const expectedId = createHash('sha256').update(JSON.stringify([0, pubkey, 1700000000, 1, [['t', 'x']], 'hello'])).digest('hex');
    assert(event.id === expectedId && nostrEventId(event) === expectedId, 'the id is NIP-01\'s hash of the serialized event');
    assert(verifyNostrEvent(event), 'its signature checks out');
    assert(!verifyNostrEvent({ ...event, content: 'changed' }), 'a changed note fails');
    assert(!verifyNostrEvent({ ...event, pubkey: 'ab'.repeat(32) }), 'a note claiming another key fails');
    assert(!verifyNostrEvent(null) && !verifyNostrEvent({}), 'junk fails');
    let refused = false;
    try {
        createAppNostrSigner({ secretKey: 'zz' });
    } catch {
        refused = true;
    }
    assert(refused, 'a signer needs a real key');

    const storage = new InMemoryStorageProvider();
    const store = new CarrierKeyStore({ storageProvider: storage, generate: generateNostrSecretKey, isValid: isNostrSecretKey });
    const kept = store.secretKey();
    assert(isNostrSecretKey(kept) && store.secretKey() === kept, 'made once, then kept');
    storage.save('nostr-carrier-key', { secretKey: 'damaged' });
    assert(store.secretKey() !== 'damaged' && isNostrSecretKey(store.secretKey()), 'a damaged key is replaced');
    console.log('✓ the carrier key signs NIP-01 notes this device keeps sending with');
}

// The note itself.
{
    const template = buildNoteTemplate({ publicationId: 'pub-1', payload: '1abc', tags: ['lighthouse-20261012', 'Old Mill'], placementRecord: { id: 'p' } });
    assert(template.kind === BUILD_NOTE_KIND, 'NIP-78 application data');
    assert(template.tags.some((tag) => tag[0] === 't' && tag[1] === BUILD_NOTE_TAG), 'tagged as a build note');
    assert(template.tags.some((tag) => tag[0] === 't' && tag[1] === 'forkbuild-tag:lighthouse-20261012'), 'each build tag announced');
    const event = { ...template, created_at: 10 };
    const note = readBuildNote(event);
    assert(note.publicationId === 'pub-1' && note.payload === '1abc' && note.placementRecord.id === 'p', 'reads back');
    assert(note.tags.join() === 'lighthouse-20261012,old-mill', `with its build tags (${note.tags})`);
    assert(buildNoteTemplate({ publicationId: 'p', payload: 'x'.repeat(MAX_BUILD_NOTE_PAYLOAD_LENGTH + 1) }) === null, 'too large is no note');
    assert(buildNoteTemplate({ publicationId: '', payload: '1a' }) === null, 'a note names its Publication');
    for (const bad of [null, { kind: 1, tags: [], content: '' }, { ...event, content: '{' }, { ...event, content: '{"v":2,"payload":"1"}' }, { ...event, tags: [['d', 'other:1']] }]) {
        assert(readBuildNote(bad) === null, `not a note: ${JSON.stringify(bad)?.slice(0, 40)}`);
    }
    const older = { ...event, created_at: 5, content: JSON.stringify({ v: 1, payload: 'old' }) };
    const latest = latestBuildNotes([older, event, event, { kind: 1 }]);
    assert(latest.length === 1 && latest[0].payload === '1abc', 'the newest note per Publication');
    assert(buildNoteFilter().kinds[0] === BUILD_NOTE_KIND && buildNoteFilter()['#t'][0] === BUILD_NOTE_TAG, 'every note');
    assert(buildNoteFilter({ tag: 'lighthouse-20261012' })['#t'][0] === 'forkbuild-tag:lighthouse-20261012', 'or one tag\'s');
    assert(buildNoteFilter({ tag: 'Not A Tag' }) === null, 'never a malformed tag');
    console.log('✓ a build note carries its Publication, its tags and its placement');
}

// Alice publishes and sends her build to everyone; Bob, who never had her
// link, finds it, and it opens checked, as a link would.
{
    const relays = { 'wss://a': memoryRelay(), 'wss://b': memoryRelay(), 'wss://down': null };
    delete relays['wss://down'];
    const network = relayNetwork({ ...relays });
    network.urls.push('wss://down');
    const { publication, contentStore } = publishBuild({ tags: ['lighthouse-20261012'] });
    const placementRecord = { publicationId: publication.id, placementId: 'pl-1', position: { x: 1, y: 0, z: 2 } };
    const sent = await sender({ network, contentStore, placementClaimFor: () => ({ placementRecord }) }).execute(publication);
    assert(sent.outcome === BuildNoteSendOutcome.SENT && sent.sent === 2 && sent.relays === 3, `sent to the two relays that answer (${JSON.stringify(sent)})`);
    assert(relays['wss://a'].events.length === 1, 'one note per relay');

    const bob = reader(network);
    const found = await bob.discovery.run();
    assert(found.admitted.length === 1 && found.admitted[0].id === publication.id, `Bob finds Alice's build (${JSON.stringify(found)})`);
    assert(bob.discoveryProvider.findById(publication.id), 'admitted where the Repository and the World look');
    assert(await bob.contentStore.has(publication.contentReference), 'the build itself is kept, checked by its hash');
    assert(bob.adopted.length === 1 && bob.adopted[0].placementId === 'pl-1', 'its publisher\'s placement is offered for adoption');
    const again = await bob.discovery.run();
    assert(again.admitted.length === 0 && again.known.includes(publication.id), 'found once, then known');

    const carol = reader(network);
    const week = await carol.discovery.run({ tag: 'lighthouse-20261012' });
    assert(week.found === 1 && carol.entryLog.list('lighthouse-20261012').includes(publication.id), 'a challenge entry is logged under its week');
    const other = await reader(network).discovery.run({ tag: 'bridge-20261019' });
    assert(other.admitted.length === 0, 'and not under another');

    // Publishing the same build again replaces the note rather than adding one.
    await sender({ network, contentStore, secretKey: generateNostrSecretKey() }).execute(publication);
    const latest = latestBuildNotes(relays['wss://a'].events);
    assert(latest.length === 1, 'readers see one note per Publication, whoever sent it');
    console.log('✓ a build sent to everyone is found, checked and admitted, and its challenge entry logged');
}

// Nothing in a note is trusted.
{
    const relay = memoryRelay();
    const network = relayNetwork({ 'wss://a': relay });
    const { publication, contentStore } = publishBuild({ title: 'Tampered' });
    await sender({ network, contentStore }).execute(publication);
    const original = relay.events[0];

    // A note whose payload has a changed build: its hash no longer matches.
    const linkOnly = await decodePublicationLinkPayload(JSON.parse(original.content).payload);
    const changedBuild = linkOnly.snapshotText.replace('My', 'Their');
    const forgedPayload = await encodePublicationLinkPayload({ claim: linkOnly.claim, snapshotText: changedBuild.length ? changedBuild + ' ' : changedBuild });
    const forger = createAppNostrSigner({ secretKey: generateNostrSecretKey() });
    const forged = await forger.signEvent({ kind: original.kind, tags: original.tags, content: JSON.stringify({ v: 1, payload: forgedPayload }) });
    // A note naming one Publication and carrying another.
    const { publication: other, contentStore: otherStore } = publishBuild({ title: 'Other' });
    const otherText = await readPublishedBuildText({ publication: other, contentStore: otherStore });
    const swapped = await forger.signEvent({
        kind: original.kind,
        tags: [['d', `forkbuild-build:${publication.id}-x`], ['t', BUILD_NOTE_TAG]],
        content: JSON.stringify({ v: 1, payload: await encodePublicationLinkPayload({ claim: other.toJSON(), snapshotText: otherText }) })
    });
    // A note whose Nostr signature doesn't match.
    const unsignedNote = { ...original, id: original.id, content: original.content.replace('"v":1', '"v":1 ') };

    const forgedNetwork = relayNetwork({ 'wss://a': { query: () => [forged, swapped, unsignedNote] } });
    const bob = reader(forgedNetwork);
    const found = await bob.discovery.run();
    assert(found.admitted.length === 0, `no forged, swapped or broken note opens (${found.admitted.map((p) => p.title)})`);
    assert(!bob.discoveryProvider.findById(publication.id) && !bob.discoveryProvider.findById(other.id), 'nothing admitted');
    console.log('✓ a changed build, a swapped Publication and a broken signature are all refused');
}

// What can't be sent.
{
    const network = relayNetwork({ 'wss://a': memoryRelay() });
    const unsigned = publishBuild({ title: 'Anonymous', signedIn: false });
    const result = await sender({ network, contentStore: unsigned.contentStore }).execute(unsigned.publication);
    assert(result.outcome === BuildNoteSendOutcome.UNSIGNED, 'an unsigned build stays with its link');
    const { publication } = publishBuild({ title: 'Elsewhere' });
    const missing = await sender({ network, contentStore: new LocalContentStore(new InMemoryStorageProvider()) }).execute(publication);
    assert(missing.outcome === BuildNoteSendOutcome.NO_BUILD, 'a build this device doesn\'t hold');
    const big = await new PublishBuildNoteUseCase({
        readBuildText: async () => 'x',
        encodePayload: async () => 'y'.repeat(MAX_BUILD_NOTE_PAYLOAD_LENGTH + 1),
        publishToRelay: async () => { throw new Error('never sent'); },
        relayUrls: () => ['wss://a']
    }).execute(publication);
    assert(big.outcome === BuildNoteSendOutcome.TOO_LARGE, 'a build too big for a note');
    const refused = await sender({ network: relayNetwork({ 'wss://a': memoryRelay({ refuse: true }) }), contentStore: publishBuild({ title: 'R' }).contentStore }).execute(publishBuild({ title: 'R' }).publication);
    assert(refused.outcome !== BuildNoteSendOutcome.SENT, 'refused by every relay is not sent');
    console.log('✓ unsigned, missing, too large and refused builds are reported, not sent');
}

// The Repository's and the challenge's searches run beside build notes; one
// failing never stops the other.
{
    const failing = { run: async () => { throw new Error('down'); } };
    const notes = { run: async ({ tag } = {}) => ({ admitted: tag ? [] : [{ id: 'n' }], known: [], found: tag ? 2 : 0, pending: 1 }) };
    const repository = await repositoryDiscoveryWithBuildNotes(failing, notes).run();
    assert(repository.admitted.length === 1 && repository.pending === 1, 'the Repository still finds notes');
    const both = await repositoryDiscoveryWithBuildNotes({ run: async () => ({ admitted: [{ id: 'a' }], known: ['k'], pending: 2 }) }, notes).run();
    assert(both.admitted.length === 2 && both.known.length === 1 && both.pending === 3, 'results add together');
    const challenge = await challengeDiscoveryWithBuildNotes({ run: async () => ({ found: 1, pending: 0 }) }, notes).run('week');
    assert(challenge.found === 3 && challenge.pending === 1, 'challenge entries add together');
    const alone = await challengeDiscoveryWithBuildNotes(null, failing).run('week');
    assert(alone.found === 0, 'nothing composed is nothing found');
    // ui/main/composeBuildNotes.js names the opened outcome without loading its module.
    assert(OpenPublicationLinkOutcome.OPENED === 'opened', 'the composition\'s "opened" is the link opener\'s');
    console.log('✓ build notes are searched beside the other networks');
}

// Who can find it: asked once, remembered, nothing else accepted.
{
    const store = new FindabilityStore({ storageProvider: new InMemoryStorageProvider() });
    assert(store.get() === null, 'not asked yet');
    assert(store.set('nobody') === null && store.get() === null, 'only a real choice');
    assert(store.set(Findability.EVERYONE) === Findability.EVERYONE && store.get() === Findability.EVERYONE, 'remembered');
    assert(store.set(Findability.LINK) === Findability.LINK && store.get() === Findability.LINK, 'and changed');
    assert(FunnelEvent.PUBLISH_FOUND === 'publish-found' && FunnelEvent.PUBLISH_LINK_ONLY === 'publish-link-only', 'counted as found or kept to a link');
    assert(backupEntryGroupOf('publish-findability') === BackupEntryGroup.SETTINGS && backupEntryGroupOf('nostr-carrier-key') === BackupEntryGroup.SETTINGS,
        'the choice and the carrier key travel in Your Data\'s backup');
    console.log('✓ who can find it is asked once and remembered, and backed up');
}
