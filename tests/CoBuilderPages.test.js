import { HelpedBuildsStore } from '../application/buildTogether/HelpedBuildsStore.js';
import { builderProfile } from '../application/buildTogether/builderProfile.js';
import { helpedBuilds } from '../application/buildTogether/helpedBuilds.js';
import { BuildTogetherSession, BUILD_TOGETHER_SYNC_PROTOCOL } from '../application/buildTogether/BuildTogetherSession.js';
import { backupEntryGroupOf, BackupEntryGroup } from '../application/backup/BackupEntryGroups.js';
import { builtWithParts, builtWithNames, builderRoute } from '../ui/components/remix/builtWithText.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// The co-builder follow-ups: the builds someone helped make
// (application/buildTogether/HelpedBuildsStore.js, helpedBuilds.js), a
// builder's page by identity (builderProfile.js), credited names as links
// (ui/components/remix/builtWithText.js), and a guest's copy taking credits
// only from its host. Credits reaching every copy over real connections is
// tested in BuildWithMe; the pages in CoBuilderPagesBrowser.

const ME = 'did:key:z6MkMe';
const ANA = 'did:key:z6MkAna';
const KIM = 'did:key:z6MkKim';

// The device's list of builds helped make, per identity, newest first.
{
    const storage = new InMemoryStorageProvider();
    const store = new HelpedBuildsStore({ storageProvider: storage });
    assert(store.note(ME, { documentId: 'd1', title: 'Harbor', authorName: 'Ana', authorIdentityId: ANA, at: '2026-10-01T00:00:00Z' }), 'noted');
    store.note(ME, { documentId: 'd2', title: 'Mill', at: '2026-10-02T00:00:00Z' });
    store.note(ME, { documentId: 'd1', at: '2026-10-03T00:00:00Z' });
    const list = store.list(ME);
    assert(list.map((entry) => entry.documentId).join() === 'd1,d2', 'noted again, a build moves to the top');
    assert(list[0].title === 'Harbor' && list[0].authorName === 'Ana' && list[0].authorIdentityId === ANA, 'keeping what was known of it');
    assert(store.list(KIM).length === 0, 'each identity has its own list');
    assert(!store.note(null, { documentId: 'x' }) && !store.note(ME, {}), 'nothing for nobody, or no build');
    assert(new HelpedBuildsStore({ storageProvider: storage }).list(ME).length === 2, 'kept on the device');
    assert(storage.list().every((name) => backupEntryGroupOf(name) === BackupEntryGroup.DOCUMENTS), 'and backed up with the documents');
    console.log('✓ the device keeps the builds each identity helped make');
}

// A builder's page: their verified builds, and verified credits from others.
const signed = {
    'p-ana-1': ANA, 'p-ana-2': ANA, 'p-ana-3': ANA, 'p-kim': KIM
};
const signerOf = (publication) => signed[publication.id] || null;
const publications = [
    { id: 'p-ana-1', documentId: 'harbor', title: 'Harbor', author: 'ana', publishedAt: '2026-10-01T00:00:00Z', builtWith: [{ name: 'Me!', identityId: ME }], publisherIdentity: { id: ANA } },
    { id: 'p-ana-2', documentId: 'harbor', title: 'Harbor II', author: 'ana', publishedAt: '2026-10-05T00:00:00Z', builtWith: [{ name: 'Me', identityId: ME }, { name: 'Kim', identityId: KIM }], publisherIdentity: { id: ANA } },
    { id: 'p-ana-3', documentId: 'tower', title: 'Tower', author: 'ana', publishedAt: '2026-10-03T00:00:00Z', publisherIdentity: { id: ANA } },
    { id: 'p-kim', documentId: 'kims', title: 'Kim\'s', author: 'kim', publishedAt: '2026-10-04T00:00:00Z', publisherIdentity: { id: KIM } },
    { id: 'p-forged', documentId: 'forged', title: 'Forged', author: 'mallory', publishedAt: '2026-10-06T00:00:00Z', builtWith: [{ name: 'Me', identityId: ME }], publisherIdentity: { id: ANA } }
];
{
    const ana = builderProfile({ identityId: ANA, publications, signerOf });
    assert(ana.builds.map((p) => p.id).join() === 'p-ana-2,p-ana-3', `Ana's builds: newest of each, newest first (${ana.builds.map((p) => p.id)})`);
    assert(ana.name === 'ana', 'named as she publishes');
    const me = builderProfile({ identityId: ME, publications, signerOf });
    assert(me.builds.length === 0 && me.builtWith.map((p) => p.id).join() === 'p-ana-2', 'builds others credit me on, once each; a credit whose signature does not verify counts for nothing');
    assert(me.name === 'Me', 'named as the newest credit names me');
    const kim = builderProfile({ identityId: KIM, publications, signerOf });
    assert(kim.builds.length === 1 && kim.builtWith.length === 1, 'Kim built one and helped with one');
    assert(builderProfile({ identityId: null, publications, signerOf }).builds.length === 0, 'nobody, nothing');
    console.log('✓ a builder\'s page lists what their identity signed, and what others credit them on');
}

// Builds helped make: the device's own notes and published credits, merged.
{
    const list = helpedBuilds({
        identityId: ME,
        publications,
        signerOf,
        noted: [
            { documentId: 'harbor', title: 'Old title', at: '2026-10-09T00:00:00Z' },
            { documentId: 'draft', title: 'Draft', authorName: 'Ana', authorIdentityId: ANA, at: '2026-10-07T00:00:00Z' }
        ]
    });
    assert(list.map((entry) => entry.documentId).join() === 'harbor,draft', `merged, newest first (${list.map((entry) => entry.documentId)})`);
    assert(list[0].publication.id === 'p-ana-2' && list[0].title === 'Harbor II' && list[0].authorIdentityId === ANA, 'a published one with its Publication');
    assert(list[1].publication === null && list[1].title === 'Draft' && list[1].authorName === 'Ana', 'an unpublished one from the device\'s note');
    assert(!list.some((entry) => entry.documentId === 'forged'), 'never a forged credit');
    console.log('✓ the builds you helped make merge what this device noted with what was published crediting you');
}

// Credited names as pieces, each to its person's page.
{
    const parts = builtWithParts([{ name: 'Kim', identityId: KIM }, { name: 'Sam' }]);
    assert(parts.map((part) => part.text).join('') === builtWithNames([{ name: 'Kim' }, { name: 'Sam' }]), 'the same phrase');
    assert(parts[0].entry.identityId === KIM && !parts[1].entry && parts[2].entry.name === 'Sam', 'names and the words between');
    const route = builderRoute(KIM, 'Kim');
    assert(route.path === `/builder/${encodeURIComponent(KIM)}` && route.query.name === 'Kim', 'a page by identity, with the name to show');
    assert(builderRoute(null, 'Sam') === null && !('query' in builderRoute(KIM)), 'no identity, no page; no name, no query');
    console.log('✓ credited names link to their person\'s page');
}

// A guest's copy takes credits only from its host, for the build it opened.
{
    const listeners = [];
    const bus = { send() {}, subscribe(protocol, callback) { if (protocol === BUILD_TOGETHER_SYNC_PROTOCOL) listeners.push(callback); return () => {}; } };
    const peer = (identityId) => ({ connectionId: identityId, remoteIdentity: { identityId }, getLifecycleState: () => PeerLifecycleState.AUTHENTICATED });
    const host = peer(ANA);
    const other = peer(KIM);
    const adopted = [];
    const noted = [];
    const document = { world: { id: 'harbor' }, metadata: { title: 'Harbor', authorIdentityId: ANA } };
    const session = new BuildTogetherSession({
        peerMessageBus: bus,
        connectedPeerRegistry: { list: () => [host, other] },
        ownIdentityIds: () => [ME],
        editor: { openDocument: () => document, openShared() {}, adoptCredits: (list) => adopted.push(list), notedHelped: (entry) => noted.push(entry) }
    });
    session._joined = Object.freeze({ documentId: 'harbor', hostIdentityId: ANA, hostName: 'Ana', ended: false, opened: true });
    const send = (from, payload) => listeners.forEach((listener) => listener(payload, { connectedPeer: from }));
    send(other, { type: 'credits', documentId: 'harbor', builtWith: [{ name: 'Kim', identityId: KIM }] });
    send(host, { type: 'credits', documentId: 'elsewhere', builtWith: [{ name: 'Kim', identityId: KIM }] });
    assert(adopted.length === 0, 'credits from anyone but the host, or for another build, are ignored');
    send(host, { type: 'credits', documentId: 'harbor', builtWith: [{ name: 'Kim', identityId: KIM }] });
    assert(adopted.length === 1 && noted.length === 0, 'the host\'s are taken; not naming me, nothing is noted');
    send(host, { type: 'credits', documentId: 'harbor', builtWith: [{ name: 'Kim', identityId: KIM }, { name: 'Me', identityId: ME }] });
    assert(noted.length === 1 && noted[0].documentId === 'harbor' && noted[0].authorName === 'Ana' && noted[0].authorIdentityId === ANA, 'naming me, the build is noted as one I helped make');
    session.dispose();
    console.log('✓ a guest\'s copy follows only its host\'s credits');
}
