import { verifySignature } from '../server/rendezvous-worker/worker.js';
import worker from '../server/rendezvous-worker/worker.js';
import { handleBuildPreview, handleOEmbed } from '../server/rendezvous-worker/buildPreview.js';
import {
    BUILD_NOTE_D_PREFIX, DEFAULT_NOTE_RELAYS, MAX_NOTE_PAYLOAD_LENGTH, NOTE_CANDIDATE_LIMIT, noteFilter, notePayloads, noteRelaysOf,
    queryRelayOverWebSocket
} from '../server/rendezvous-worker/noteLink.js';
import {
    BUILD_NOTE_CANDIDATE_LIMIT, BUILD_NOTE_KIND, MAX_BUILD_NOTE_PAYLOAD_LENGTH, buildNoteFilterForPublication, buildNoteTemplate,
    buildNotesForPublication
} from '../core/BuildNote.js';
import { DEFAULT_NOSTR_RELAY_URLS } from '../core/NostrRelayConfiguration.js';
import {
    FORKBUILD_LINK_PREVIEW_URL, isNoteLinkPublicationId, noteLinkUrl, noteLinkViewPath, publicationIdFromNoteLinkUrl
} from '../core/ForkBuildAppLinks.js';
import { FindableBuildsStore } from '../application/buildNotes/FindableBuildsStore.js';
import { BuildNoteSendOutcome, PublishBuildNoteUseCase } from '../application/buildNotes/PublishBuildNoteUseCase.js';
import { BuildNoteDiscovery } from '../application/buildNotes/BuildNoteDiscovery.js';
import {
    ShareLinkKind, describePublicationShare, prepareLinkOnlyShare, readPublishedBuildText, shortShareUrl
} from '../application/publication/PublicationShareLink.js';
import { decodePublicationLinkPayload, encodePublicationLinkPayload } from '../application/publication/sharing/PublicationLinkPayload.js';
import { FunnelEventCounter } from '../application/settings/FunnelEventCounter.js';
import { FunnelEvent, VISITOR_COUNT_SITE_ORIGIN, funnelEventHitUrl } from '../core/VisitorCount.js';
import { BackupEntryGroup, backupEntryGroupOf } from '../application/backup/BackupEntryGroups.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { ShowcaseLibrary } from '../core/library/ShowcaseLibrary.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { displayText } from '../ui/i18n/i18n.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Short links (docs/reviews/Growth-2026-10-13.md, item 1): a build sent to
// everyone as a build note gets a link of about 90 characters,
// /n/<publication id> on the rendezvous worker, which names the note instead
// of carrying the build. The worker reads the note from the relays and
// previews it as /b/ does; the app reads it itself at #/n/<publication id>.
// Anyone can send a note under any build's id, so both try the notes newest
// first until one carries a build its builder signed.

const CASTLE = ShowcaseLibrary.structures.find((structure) => structure.id === 'showcase:castle');
const WORKER = 'https://forkbuild-rendezvous.example.workers.dev';

function publish({ title = 'Castle on the hill', author = 'alice', bricks = CASTLE.bricks } = {}) {
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    identity.login(author);
    const contentStore = new LocalContentStore(storage);
    const world = new World();
    const building = new Building({ creator: author });
    for (const brick of bricks) building.addBrick(new Brick({ definitionId: brick.definitionId, position: brick.position, rotation: brick.rotation, color: brick.color }));
    world.addBuilding(building);
    const manager = new DocumentManager();
    manager.load(new Document({ world, metadata: new DocumentMetadata({ title, author, license: new License({ id: LicenseId.CC_BY_4_0 }) }) }), `doc-${title}`);
    return { publication: new PublishDocumentUseCase(new LocalPublisherProvider(storage, contentStore), identity).execute(manager), contentStore };
}

async function payloadOf({ publication, contentStore }) {
    const claim = publication.toJSON();
    return encodePublicationLinkPayload({ claim, snapshotText: await readPublishedBuildText({ publication: claim, contentStore }) });
}

// A relay's event for a note, as core/BuildNote.js writes it.
function noteEvent(publicationId, payload, createdAt) {
    const template = buildNoteTemplate({ publicationId, payload });
    return { id: `e${createdAt}`, pubkey: 'carrier', created_at: createdAt, sig: 'x', ...template, tags: template.tags.map((tag) => [...tag]) };
}

// A queryRelay that answers each relay with `byRelay[relayUrl]`, and records the filters.
function fakeRelays(byRelay) {
    const asked = [];
    const queryRelay = async (relayUrl, filter) => {
        asked.push({ relayUrl, filter });
        const answer = byRelay[relayUrl];
        if (answer instanceof Error) throw answer;
        return (answer || []).filter((event) => filter['#d'].includes(event.tags.find((tag) => tag[0] === 'd')?.[1]));
    };
    return { queryRelay, asked };
}

const meta = (html, name) => {
    const match = new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)"`).exec(html);
    return match ? match[1] : null;
};

const castle = publish();
const castleId = castle.publication.id;
const castlePayload = await payloadOf(castle);

// The link and its route.
{
    const url = noteLinkUrl(castleId);
    assert(url === `${FORKBUILD_LINK_PREVIEW_URL}n/${castleId}`, 'a short link is the worker\'s /n/<publication id>');
    assert(url.length < 100, `a short link is under 100 characters (${url.length})`);
    assert(castlePayload.length > 2000, `the castle's own link is long (${castlePayload.length} characters), which is why`);
    assert(noteLinkViewPath(castleId) === `/n/${castleId}`, 'the app\'s route is #/n/<publication id>');
    assert(publicationIdFromNoteLinkUrl(url) === castleId, 'the id is read back from the link');
    assert(publicationIdFromNoteLinkUrl(`${url}?utm=x`) === castleId, 'a query after it is ignored');
    assert(publicationIdFromNoteLinkUrl(`${WORKER}/b/1abc`) === null, 'a /b/ link names no id');
    for (const id of ['', 'a b', 'a/b', '<x>', 'x'.repeat(129), null, 42]) {
        assert(!isNoteLinkPublicationId(id), `${JSON.stringify(id)} is not an id a short link carries`);
        let threw = false;
        try { noteLinkUrl(id); } catch { threw = true; }
        assert(threw, `${JSON.stringify(id)} makes no short link`);
    }
    console.log('✓ the link and its route');
}

// The worker reads notes as the app writes them.
{
    assert(BUILD_NOTE_D_PREFIX + castleId === buildNoteTemplate({ publicationId: castleId, payload: '1x' }).tags[0][1], 'the same d tag');
    assert(JSON.stringify(noteFilter(castleId)) === JSON.stringify(buildNoteFilterForPublication(castleId)), 'the same relay filter');
    assert(noteFilter(castleId).kinds[0] === BUILD_NOTE_KIND, 'the same kind');
    assert(MAX_NOTE_PAYLOAD_LENGTH === MAX_BUILD_NOTE_PAYLOAD_LENGTH && NOTE_CANDIDATE_LIMIT === BUILD_NOTE_CANDIDATE_LIMIT, 'the same limits');
    assert(JSON.stringify(DEFAULT_NOTE_RELAYS) === JSON.stringify(DEFAULT_NOSTR_RELAY_URLS), 'the app\'s default relays');
    assert(buildNoteFilterForPublication('') === null, 'no filter for no id');

    const events = [
        noteEvent(castleId, '1older', 100),
        noteEvent(castleId, '1newest', 300),
        noteEvent(castleId, '1newest', 250),
        noteEvent(castleId, '1middle', 200),
        noteEvent('another-build', '1other', 400),
        { ...noteEvent(castleId, '1wrongkind', 500), kind: 1 },
        { ...noteEvent(castleId, '1bad', 600), content: 'not json' }
    ];
    const app = buildNotesForPublication(events, castleId).map((note) => note.payload);
    assert(JSON.stringify(app) === JSON.stringify(['1newest', '1middle', '1older']), `the app tries them newest first, each once: ${app}`);
    assert(JSON.stringify(notePayloads(events, castleId)) === JSON.stringify(app), 'the worker the same');
    const many = Array.from({ length: 15 }, (_, i) => noteEvent(castleId, `1p${i}`, i));
    assert(notePayloads(many, castleId).length === NOTE_CANDIDATE_LIMIT && buildNotesForPublication(many, castleId).length === NOTE_CANDIDATE_LIMIT, 'at most ten tried');

    assert(JSON.stringify(noteRelaysOf({})) === JSON.stringify(DEFAULT_NOTE_RELAYS), 'the default relays without NOSTR_RELAYS');
    assert(JSON.stringify(noteRelaysOf({ NOSTR_RELAYS: ' wss://a.example , http://no.example, wss://b.example/x ' })) === JSON.stringify(['wss://a.example', 'wss://b.example/x']), 'NOSTR_RELAYS, wss:// only');
    assert(noteRelaysOf({ NOSTR_RELAYS: '' }).length === 0, 'an empty NOSTR_RELAYS asks none');
    console.log('✓ the worker reads notes as the app writes them');
}

// The worker's relay client.
{
    // A WebSocket as a Cloudflare Worker's fetch() hands one over.
    function fakeSocket(onRequest) {
        const listeners = {};
        const sent = [];
        const socket = {
            accepted: false, closed: false, sent,
            accept() { this.accepted = true; },
            addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
            send(text) { sent.push(JSON.parse(text)); if (sent.length === 1) queueMicrotask(() => onRequest(sent[0], (frame) => listeners.message?.forEach((l) => l({ data: JSON.stringify(frame) })))); },
            close() { this.closed = true; }
        };
        return socket;
    }
    const event = noteEvent(castleId, castlePayload, 1);
    let requested = null;
    const socket = fakeSocket(([type, id, filter], reply) => {
        requested = { type, filter };
        reply(['EVENT', 'someone-else', { kind: 1 }]);
        reply(['EVENT', id, event]);
        reply(['EOSE', id]);
    });
    let fetched = null;
    const events = await queryRelayOverWebSocket('wss://relay.example', noteFilter(castleId), {
        fetchImpl: async (url, init) => { fetched = { url, init }; return { webSocket: socket }; }
    });
    assert(fetched.url === 'https://relay.example' && fetched.init.headers.Upgrade === 'websocket', 'it opens the relay with an Upgrade');
    assert(socket.accepted && requested.type === 'REQ' && requested.filter['#d'][0] === BUILD_NOTE_D_PREFIX + castleId, 'it asks for the build\'s notes');
    assert(events.length === 1 && events[0].id === event.id, 'it keeps only its own subscription\'s events');
    assert(socket.closed && socket.sent.at(-1)[0] === 'CLOSE', 'it closes the subscription and the socket at EOSE');

    const silent = fakeSocket(() => {});
    const started = Date.now();
    const none = await queryRelayOverWebSocket('wss://slow.example', noteFilter(castleId), { timeoutMs: 50, fetchImpl: async () => ({ webSocket: silent }) });
    assert(none.length === 0 && Date.now() - started < 1000 && silent.closed, 'a silent relay gives nothing once the wait is over');
    let refused = false;
    try {
        await queryRelayOverWebSocket('wss://no.example', noteFilter(castleId), { fetchImpl: async () => ({ webSocket: null }) });
    } catch {
        refused = true;
    }
    assert(refused, 'a relay that refuses the WebSocket fails, and the caller counts it as answering nothing');
    console.log('✓ the worker\'s relay client');
}

// The worker's /n/ page and picture.
{
    const env = { APP_URL: 'https://bowo-prasetyo.github.io/forkbuild/', NOSTR_RELAYS: 'wss://a.example,wss://b.example' };
    const forger = publish({ title: 'Not the castle', author: 'mallory', bricks: CASTLE.bricks.slice(0, 5) });
    const forgedPayload = await payloadOf(forger);
    const { queryRelay, asked } = fakeRelays({
        'wss://a.example': [noteEvent(castleId, castlePayload, 100)],
        // A newer note under the castle's id that carries another build: tried
        // first, and passed over, since its claim names another Publication.
        'wss://b.example': [noteEvent(castleId, forgedPayload, 900), noteEvent(castleId, '1damaged', 950)]
    });
    const get = (path, deps = { verifySignature, queryRelay }) => handleBuildPreview(new Request(`${WORKER}${path}`), env, deps);

    const page = await get(`/n/${castleId}`);
    const html = await page.text();
    assert(page.status === 200, 'the page answers');
    assert(asked.length === 2 && asked.every((q) => q.filter['#d'][0] === BUILD_NOTE_D_PREFIX + castleId), 'both relays were asked for the build\'s notes');
    assert(meta(html, 'og:title') === 'Castle on the hill', `the title comes from the signed build: ${meta(html, 'og:title')}`);
    assert(meta(html, 'og:description').includes('alice') && meta(html, 'og:description').includes(`${CASTLE.bricks.length} bricks`), 'its author and size');
    assert(meta(html, 'og:image') === `${WORKER}/n/${castleId}/preview.png`, 'its picture is the short link\'s own');
    assert(meta(html, 'og:url') === `${WORKER}/n/${castleId}`, 'the page names the short link');
    assert(html.includes(`url=${env.APP_URL}#/n/${castleId}`), 'it sends people on to the app\'s #/n/, which reads the note itself');
    assert(!html.includes(castlePayload.slice(1, 40)), 'the page doesn\'t carry the build');
    assert(page.headers.get('cache-control') === 'public, max-age=86400', 'a found build is kept a day');
    assert(html.includes('/oembed?url='), 'it names its oEmbed');

    const png = await get(`/n/${castleId}/preview.png`);
    const bytes = new Uint8Array(await png.arrayBuffer());
    assert(png.headers.get('content-type') === 'image/png' && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47, 'the picture is a PNG');

    // Newer still: the castle's own claim, retitled, so its signature fails.
    const tampered = await encodePublicationLinkPayload({
        claim: { ...castle.publication.toJSON(), title: 'Free prizes' },
        snapshotText: await readPublishedBuildText({ publication: castle.publication.toJSON(), contentStore: castle.contentStore })
    });
    const withTampered = fakeRelays({ 'wss://a.example': [noteEvent(castleId, tampered, 999), noteEvent(castleId, castlePayload, 100)] });
    const tamperedPage = await (await get(`/n/${castleId}`, { verifySignature, queryRelay: withTampered.queryRelay })).text();
    assert(meta(tamperedPage, 'og:title') === 'Castle on the hill', 'a newer note whose claim was changed is passed over for the one its builder signed');

    const forgedOnly = fakeRelays({ 'wss://a.example': [noteEvent(castleId, forgedPayload, 900)] });
    const forgedPage = await (await get(`/n/${castleId}`, { verifySignature, queryRelay: forgedOnly.queryRelay })).text();
    assert(meta(forgedPage, 'og:title') === 'A shared build', 'a note carrying another build gets the plain card');

    const empty = fakeRelays({ 'wss://a.example': new Error('down') });
    const missing = await get(`/n/${castleId}`, { verifySignature, queryRelay: empty.queryRelay });
    const missingHtml = await missing.text();
    assert(meta(missingHtml, 'og:title') === 'A shared build' && missingHtml.includes(`#/n/${castleId}`), 'with no note found, the plain card, still sending people on to the app');
    assert(missing.headers.get('cache-control') === 'public, max-age=60', 'and kept only a minute, in case the note turns up');
    const missingPicture = await get(`/n/${castleId}/preview.png`, { verifySignature, queryRelay: empty.queryRelay });
    assert(missingPicture.status === 302 && missingPicture.headers.get('location').endsWith('assets/social/forkbuild-card.png'), 'and the site\'s own picture');

    for (const path of ['/n/', '/n/a%20b', `/n/${'x'.repeat(129)}`, `/n/${castleId}/other`]) {
        const response = await get(path);
        assert(response.status === 404, `${path} is not found`);
    }

    // A build too large for a /b/ link still has a short link.
    const big = publish({
        title: 'A long wall',
        bricks: Array.from({ length: 1500 }, (_, i) => ({ definitionId: 'core:cube', position: new Position(i % 50, Math.floor(i / 50), (i * 7) % 13), rotation: 0, color: (i * 2654435761) & 0xffffff }))
    });
    const bigPayload = await payloadOf(big);
    assert(bigPayload.length > 16000 && bigPayload.length <= MAX_NOTE_PAYLOAD_LENGTH, `a build past a /b/ link's limit but within a note's (${bigPayload.length})`);
    const bigRelays = fakeRelays({ 'wss://a.example': [noteEvent(big.publication.id, bigPayload, 1)] });
    const bigPage = await (await get(`/n/${big.publication.id}`, { verifySignature, queryRelay: bigRelays.queryRelay })).text();
    assert(meta(bigPage, 'og:title') === 'A long wall', 'is previewed by its short link');

    const oembed = await handleOEmbed(new Request(`${WORKER}/oembed?url=${encodeURIComponent(`${WORKER}/n/${castleId}`)}&format=json`), env, { verifySignature, queryRelay });
    const answer = await oembed.json();
    assert(answer.type === 'rich' && answer.title === 'Castle on the hill', 'oEmbed answers for a short link');
    assert(answer.html.includes(`embed.html#${castlePayload}`) && answer.thumbnail_url === `${WORKER}/n/${castleId}/preview.png`, 'with the build\'s embed and the short link\'s picture');
    const noOembed = await handleOEmbed(new Request(`${WORKER}/oembed?url=${encodeURIComponent(`${WORKER}/n/${castleId}`)}`), env, { verifySignature, queryRelay: empty.queryRelay });
    assert(noOembed.status === 404, 'and not for one no relay has');

    // Through the worker's own fetch: routed, and with no relay to ask, the plain card.
    const routed = await worker.fetch(new Request(`${WORKER}/n/${castleId}`), { ...env, NOSTR_RELAYS: '' });
    assert(routed.status === 200 && meta(await routed.text(), 'og:title') === 'A shared build', 'the worker routes /n/');
    const old = await worker.fetch(new Request(`${WORKER}/b/${castlePayload}`), env);
    assert(meta(await old.text(), 'og:title') === 'Castle on the hill', '/b/ links work as before');
    console.log('✓ the worker\'s /n/ page and picture');
}

// The builds that get a short link.
{
    const storage = new InMemoryStorageProvider();
    const store = new FindableBuildsStore({ storageProvider: storage, maxEntries: 3 });
    const heard = [];
    const unsubscribe = store.subscribe((id) => heard.push(id));
    assert(!store.has('a') && store.add('a') && store.has('a'), 'a build is noted');
    assert(!store.add('a') && heard.length === 1, 'once');
    store.add('b'); store.add('c'); store.add('d');
    assert(!store.has('a') && store.has('d'), 'the oldest is forgotten past the limit');
    unsubscribe();
    store.add('e');
    assert(heard.join() === 'a,b,c,d', 'listeners hear of new ones until they leave');
    assert(new FindableBuildsStore({ storageProvider: storage }).has('e'), 'kept on the device');
    assert(!store.add('') && !store.add(null), 'nothing for no id');
    assert(backupEntryGroupOf('findable-builds') === BackupEntryGroup.PUBLICATIONS, 'backed up with publications');

    const sentIds = [];
    const sending = (answers) => new PublishBuildNoteUseCase({
        readBuildText: (claim) => readPublishedBuildText({ publication: claim, contentStore: castle.contentStore }),
        encodePayload: encodePublicationLinkPayload,
        publishToRelay: async (relayUrl) => ({ published: answers[relayUrl] }),
        relayUrls: () => Object.keys(answers),
        onSent: (id) => sentIds.push(id)
    });
    assert((await sending({ 'wss://a': false, 'wss://b': false }).execute(castle.publication)).outcome === BuildNoteSendOutcome.FAILED && sentIds.length === 0, 'a note no relay took is not noted');
    assert((await sending({ 'wss://a': false, 'wss://b': true }).execute(castle.publication)).outcome === BuildNoteSendOutcome.SENT && sentIds.join() === castleId, 'one relay taking it is enough');
    console.log('✓ the builds that get a short link');
}

// The app's own reading of a short link.
{
    const forger = publish({ title: 'Not the castle', author: 'mallory', bricks: CASTLE.bricks.slice(0, 5) });
    const { queryRelay } = fakeRelays({
        'wss://a.example': [noteEvent(castleId, castlePayload, 100)],
        'wss://b.example': [noteEvent(castleId, await payloadOf(forger), 900), noteEvent(castleId, '1damaged', 950)],
        'wss://c.example': new Error('down')
    });
    const opened = [];
    const discovery = new BuildNoteDiscovery({
        queryRelay,
        relayUrls: () => ['wss://a.example', 'wss://b.example', 'wss://c.example'],
        verifyEvent: (event) => event.sig === 'x',
        decodePayload: decodePublicationLinkPayload,
        openLinkOnly: async () => ({ outcome: 'opened', publication: castle.publication }),
        openedOutcome: 'opened',
        onOpened: (id) => opened.push(id)
    });
    const candidates = await discovery.findLinkOnly(castleId);
    assert(candidates.length === 1 && candidates[0].claim.id === castleId, 'only notes whose claim names the build are offered, the damaged and the forged passed over');
    assert((await discovery.findLinkOnly('no-such-build')).length === 0 && (await discovery.findLinkOnly('')).length === 0, 'none for a build no relay has');

    const unsigned = new BuildNoteDiscovery({
        queryRelay, relayUrls: () => ['wss://a.example'], verifyEvent: () => false,
        decodePayload: decodePublicationLinkPayload, openLinkOnly: async () => null, openedOutcome: 'opened'
    });
    assert((await unsigned.findLinkOnly(castleId)).length === 0, 'a note whose Nostr signature fails is not offered');

    // Builds opened from notes in Explore are noted too.
    const everyone = new BuildNoteDiscovery({
        queryRelay: async () => [noteEvent(castleId, castlePayload, 100)].map((event) => ({ ...event, tags: [...event.tags, ['t', 'forkbuild-build']] })),
        relayUrls: () => ['wss://a.example'],
        decodePayload: decodePublicationLinkPayload,
        openLinkOnly: async () => ({ outcome: 'opened', publication: castle.publication }),
        openedOutcome: 'opened',
        onOpened: (id) => opened.push(id)
    });
    await everyone.run();
    assert(opened.join() === castleId, 'a build opened from a note in Explore gets a short link');
    console.log('✓ the app\'s own reading of a short link');
}

// What the share offers.
{
    const linkOnly = await prepareLinkOnlyShare({ publication: castle.publication, contentStore: castle.contentStore });
    const shortUrl = shortShareUrl({ publicationId: castleId, findable: true });
    assert(shortUrl === noteLinkUrl(castleId), 'a build on the relays has a short link');
    assert(shortShareUrl({ publicationId: castleId, findable: false }) === null, 'one kept to its link has none');
    assert(shortShareUrl({ publicationId: 'not an id', findable: true }) === null, 'nor one whose id a link can\'t carry');

    const short = describePublicationShare({ lifecycle: null, title: 'Castle', linkOnly, shortUrl });
    assert(short.kind === ShareLinkKind.SHORT && short.url === shortUrl, 'the short link comes before the long one');
    assert(displayText(short.hint).includes('short link'), `its hint says so: ${displayText(short.hint)}`);
    const long = describePublicationShare({ lifecycle: null, title: 'Castle', linkOnly, shortUrl: null });
    assert(long.kind === ShareLinkKind.LINK_ONLY && long.url === linkOnly.url, 'without it, the link that carries the build');
    const tooLarge = describePublicationShare({ lifecycle: null, title: 'Castle', linkOnly: { reason: 'share.linkOnlyTooLarge' }, shortUrl });
    assert(tooLarge.available && tooLarge.kind === ShareLinkKind.SHORT, 'a build too large for its own link is still shared by a short one');
    const onSteem = { material: { state: 'PRESENT', uri: 'steem://forkbuild/forkbuild-c-muiesncy-wkg6k1nb', storage: 'steem' }, discovery: { state: 'PRESENT' } };
    assert(describePublicationShare({ lifecycle: onSteem, title: 'Castle', linkOnly, shortUrl }).kind === ShareLinkKind.NETWORK, 'a distributed build\'s network link still comes first');
    console.log('✓ what the share offers');
}

// Counting it.
{
    assert(funnelEventHitUrl(FunnelEvent.SHARE_LINK_SHORT, '5') === 'https://forkbuild.goatcounter.com/count?p=%2Fe%2Fshare-link-short&rnd=5', 'a short link shared is /e/share-link-short');
    const hits = [];
    const counter = new FunnelEventCounter({
        settingsStore: { get: () => ({ enabled: true }) }, origin: VISITOR_COUNT_SITE_ORIGIN, privacySignals: {},
        sendHit: (url) => hits.push(url), random: () => 0.5
    });
    counter.sharedLink();
    counter.sharedShortLink();
    assert(hits.length === 2 && hits[0].includes('%2Fe%2Fshare-link&') && hits[1].includes('%2Fe%2Fshare-link-short&'), 'beside share-link, never instead of it');
    console.log('✓ counting it');
}

console.log('\n✅ All ShortLinks tests passed.');
