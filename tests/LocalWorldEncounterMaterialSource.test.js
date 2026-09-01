import { readFile } from 'node:fs/promises';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { WorldEncounterMaterialSource, loadWorldEncounterMaterial } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { Publication } from '../publisher/Publication.js';
import { AvatarProfile } from '../core/AvatarProfile.js';

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function selectionOf({ kind, objectId, origin = 'local' }) {
    return Object.freeze({ kind, objectId, origin });
}

function seedPublication(storageProvider, overrides = {}) {
    const publication = new Publication({ id: 'pub-1', documentId: 'doc-1', title: 'A Publication', author: 'alice', ...overrides });
    storageProvider.save('forkbuild-publications', [publication.toJSON()]);
    return publication;
}

function seedAvatarProfile(storageProvider, key, overrides = {}) {
    const profile = new AvatarProfile({ avatarId: 'avatar-1', ownerIdentity: 'alice', displayName: 'Alice', ...overrides });
    storageProvider.save(key, profile.toJSON());
    return profile;
}

// ---------------------------------------------------------------------
// 1. Flagship: an existing publication resolves; a missing one resolves
//    to null — the two-way split this milestone exists to hold, for the
//    kind the discovery record is already known to be incomplete for.
// ---------------------------------------------------------------------
{
    const storageProvider = new InMemoryStorageProvider();
    seedPublication(storageProvider);
    const source = new LocalWorldEncounterMaterialSource(storageProvider);

    const found = await source.load(selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1' }));
    assert(found instanceof Publication, '1. FLAGSHIP — an existing publication resolves to a Publication instance');
    assert(found.id === 'pub-1' && found.documentId === 'doc-1', '2. FLAGSHIP — the resolved publication is the actual underlying record, not the discovery summary');

    const missing = await source.load(selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-does-not-exist' }));
    assert(missing === null, '3. FLAGSHIP — a publicationId with no local record resolves to null');

    console.log('✓ Flagship: an existing publication resolves, a missing one resolves to null');
}

// ---------------------------------------------------------------------
// 2. Avatar material loading, keyed by avatarId — not by the storage
//    key's own owner-username, and not by the first record enumerated.
// ---------------------------------------------------------------------
{
    const storageProvider = new InMemoryStorageProvider();
    seedAvatarProfile(storageProvider, 'avatar-profile:alice', { avatarId: 'avatar-alice', ownerIdentity: 'alice', displayName: 'Alice' });
    seedAvatarProfile(storageProvider, 'avatar-profile:bob', { avatarId: 'avatar-bob', ownerIdentity: 'bob', displayName: 'Bob' });
    const source = new LocalWorldEncounterMaterialSource(storageProvider);

    const bob = await source.load(selectionOf({ kind: WorldEncounterKind.AVATAR, objectId: 'avatar-bob' }));
    assert(bob instanceof AvatarProfile, '4. an existing avatar profile resolves to an AvatarProfile instance');
    assert(bob.avatarId === 'avatar-bob' && bob.displayName === 'Bob', '5. the correct avatar is matched by avatarId, not by storage enumeration order');

    const missing = await source.load(selectionOf({ kind: WorldEncounterKind.AVATAR, objectId: 'avatar-carol' }));
    assert(missing === null, '6. an avatarId never persisted locally (e.g. only ever encountered via presence) resolves to null, never throws');

    console.log('✓ Avatar material is looked up by avatarId, missing avatars resolve to null');
}

// ---------------------------------------------------------------------
// 3. objectId is the only match key — a publication and an avatar that
//    happen to share an id are never confused with one another.
// ---------------------------------------------------------------------
{
    const storageProvider = new InMemoryStorageProvider();
    seedPublication(storageProvider, { id: 'shared-id', title: 'Shared Id Publication' });
    seedAvatarProfile(storageProvider, 'avatar-profile:dave', { avatarId: 'shared-id', displayName: 'Shared Id Avatar' });
    const source = new LocalWorldEncounterMaterialSource(storageProvider);

    const publication = await source.load(selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'shared-id' }));
    const avatar = await source.load(selectionOf({ kind: WorldEncounterKind.AVATAR, objectId: 'shared-id' }));
    assert(publication instanceof Publication && publication.title === 'Shared Id Publication', '7. kind decides which repository is consulted, even with a colliding objectId');
    assert(avatar instanceof AvatarProfile && avatar.displayName === 'Shared Id Avatar', '8. the AVATAR-kind lookup never returns the PUBLICATION material for the same objectId');

    console.log('✓ kind, not just objectId, decides which local repository is consulted');
}

// ---------------------------------------------------------------------
// 4. Malformed / missing selections degrade to null, never throw.
// ---------------------------------------------------------------------
{
    const storageProvider = new InMemoryStorageProvider();
    seedPublication(storageProvider);
    const source = new LocalWorldEncounterMaterialSource(storageProvider);

    for (const resolvedSelection of [undefined, null, {}, { kind: WorldEncounterKind.PUBLICATION }, { kind: 'NOT_A_KIND', objectId: 'pub-1' }]) {
        const result = await source.load(resolvedSelection);
        assert(result === null, `9. a malformed selection ${JSON.stringify(resolvedSelection)} degrades to null, never throws`);
    }

    console.log('✓ Malformed or missing selections degrade to null, never throw');
}

// ---------------------------------------------------------------------
// 5. Material is retrieved unverified — a Publication with a signature
//    field is forwarded as-is; this source never inspects or verifies it.
// ---------------------------------------------------------------------
{
    const storageProvider = new InMemoryStorageProvider();
    const signed = new Publication({
        id: 'pub-signed',
        documentId: 'doc-signed',
        title: 'Signed Publication',
        publisherIdentity: { publicKey: 'not-a-real-key' },
        signature: {
            algorithm: 'Ed25519',
            signer: 'not-a-real-signer',
            signature: 'not-a-real-signature',
            signedHash: 'not-a-real-hash',
            domain: 'forkbuild'
        }
    });
    storageProvider.save('forkbuild-publications', [signed.toJSON()]);
    const source = new LocalWorldEncounterMaterialSource(storageProvider);

    const result = await source.load(selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-signed' }));
    assert(result instanceof Publication, '10. a signed publication still loads successfully');
    assert(result.signature !== null && result.signature !== undefined, '11. the signature field is carried through unchanged');

    console.log('✓ A signed publication loads with its signature intact, unverified — retrieval only');
}

// ---------------------------------------------------------------------
// 6. Integration with the 0.9.21 loading boundary: a resolved local-
//    origin selection routes through loadWorldEncounterMaterial() into
//    this source and comes back AVAILABLE, unmodified contract.
// ---------------------------------------------------------------------
{
    const storageProvider = new InMemoryStorageProvider();
    seedPublication(storageProvider);
    const resolvedSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', origin: 'local' });

    const result = await loadWorldEncounterMaterial({
        resolvedSelection,
        materialSources: { local: new LocalWorldEncounterMaterialSource(storageProvider) }
    });
    assert(result.status === 'AVAILABLE', '12. a resolved local-origin selection loads through the unmodified 0.9.21 boundary');
    assert(result.material instanceof Publication && result.material.id === 'pub-1', '13. the 0.9.21 boundary forwards this source\'s own material unchanged');
    assert(result.resolvedSelection === resolvedSelection, '14. resolvedSelection is still forwarded by reference through the full chain');

    const peerOriginNeverRoutesHere = await loadWorldEncounterMaterial({
        resolvedSelection: selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', origin: 'peer:did:key:zPeerA' }),
        materialSources: { local: new LocalWorldEncounterMaterialSource(storageProvider) }
    });
    assert(peerOriginNeverRoutesHere.status === 'UNAVAILABLE', '15. a peer-origin selection never routes into materialSources.local, even with matching local data');

    console.log('✓ Integrates with the unmodified 0.9.21 loading boundary; peer origins never fall back to local');
}

// ---------------------------------------------------------------------
// 7. Implements the 0.9.21 WorldEncounterMaterialSource contract.
// ---------------------------------------------------------------------
{
    const source = new LocalWorldEncounterMaterialSource(new InMemoryStorageProvider());
    assert(source instanceof WorldEncounterMaterialSource, '16. LocalWorldEncounterMaterialSource extends the 0.9.21 WorldEncounterMaterialSource contract');

    console.log('✓ LocalWorldEncounterMaterialSource is a real WorldEncounterMaterialSource');
}

// ---------------------------------------------------------------------
// 8. Architectural regression: no peer transport, no signature
//    verification vocabulary, no modification of the 0.9.21 file itself.
// ---------------------------------------------------------------------
{
    const path = '../application/LocalWorldEncounterMaterialSource.js';
    const sourceUrl = new URL(path, import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

    assert(!codeOnly.includes('PeerMessageBus'), '17. never imports PeerMessageBus');
    assert(!codeOnly.includes('PeerConnection'), '18. never references PeerConnection');
    assert(!/fetch\(/.test(codeOnly), '19. never calls fetch(...)');
    assert(!codeOnly.includes('WebSocket'), '20. never references WebSocket');

    const forbiddenTerms = ['trusted', 'trust(', 'reputation', 'verify(', 'authority', 'weight', 'confidence', 'ranking', 'scoring'];
    for (const term of forbiddenTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `21. code must never use "${term}" — retrieval only, no trust/verification vocabulary`);
    }

    const loadingBoundarySource = await readFile(new URL('../application/WorldEncounterMaterialLoading.js', import.meta.url), 'utf8');
    assert(!loadingBoundarySource.includes('LocalWorldEncounterMaterialSource'), '22. the 0.9.21 loading boundary itself is never modified to know about this source');

    console.log('✓ Architectural regression: no peer transport or trust vocabulary; 0.9.21 boundary untouched');
}

console.log('\nAll LocalWorldEncounterMaterialSource tests passed.');
