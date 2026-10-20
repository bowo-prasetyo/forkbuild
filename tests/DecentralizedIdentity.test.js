import * as Ed25519 from '../identity/Ed25519.js';
import { SigningIdentity } from '../identity/SigningIdentity.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { Signature, SignatureType } from '../core/publication/Signature.js';
import { Position } from '../core/document/Position.js';
import { SpatialBounds } from '../core/world/SpatialBounds.js';
import { PlacementRecord } from '../core/publication/PlacementRecord.js';
import { Document } from '../core/document/Document.js';
import { DocumentMetadata } from '../core/document/DocumentMetadata.js';
import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { Brick } from '../core/building/Brick.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { PlacePublicationUseCase } from '../application/placement/PlacePublicationUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/publication/LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { Publication } from '../publisher/Publication.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

const stubIdentityProvider = {
    currentUser: () => ({ username: 'stub', displayName: 'stub', providerId: 'stub' }),
    sign: (data) => ({ signedBy: 'stub', providerId: 'stub', data })
};

function createIdentity(username) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(username);
    return provider;
}

function createTestDocument(title = 'Test World') {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author: 'tester' })
    });
}

function makeRecord({ placementId, publicationId, x = 0, y = 0, z = 0, revision = 1, owner = 'alice' }) {
    const record = new PlacementRecord({
        placementId,
        publicationId,
        owner,
        position: new Position(x, y, z),
        bounds: new SpatialBounds({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }),
        revision
    });
    return new PlacementRecord({ ...record.toJSON(), contentHash: record.computeContentHash() });
}

function signRecord(provider, record) {
    let prepared = record.contentHash
        ? record
        : new PlacementRecord({ ...record.toJSON(), contentHash: record.computeContentHash() });
    if (!prepared.ownerIdentity) {
        prepared = prepared.withOwnerIdentity(provider.getSigningIdentity().toJSON());
    }
    return prepared.withSignature(provider.signCanonical(prepared.getSigningDescriptor()));
}

// ---------------------------------------------------------------------
// 0. Cryptographic primitives against published vectors
// ---------------------------------------------------------------------
{
    const abcHash = Ed25519.bytesToHex(Ed25519.sha512(Ed25519.utf8ToBytes('abc')));
    assert(abcHash === 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a'
        + '2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
        'SHA-512("abc") matches FIPS 180-4 vector');

    // RFC 8032 TEST 1 (empty message).
    const seed1 = Ed25519.hexToBytes('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
    const kp1 = Ed25519.seedToKeyPair(seed1);
    assert(Ed25519.bytesToHex(kp1.publicKey) === 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
        'RFC 8032 test 1 public key');
    const sig1 = Ed25519.sign(seed1, new Uint8Array(0));
    assert(Ed25519.bytesToHex(sig1) === 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155'
        + '5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
        'RFC 8032 test 1 signature');
    assert(Ed25519.verify(kp1.publicKey, new Uint8Array(0), sig1) === true, 'RFC 8032 test 1 verifies');

    // RFC 8032 TEST 2 (single byte 0x72).
    const seed2 = Ed25519.hexToBytes('4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb');
    const kp2 = Ed25519.seedToKeyPair(seed2);
    assert(Ed25519.bytesToHex(kp2.publicKey) === '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
        'RFC 8032 test 2 public key');
    const sig2 = Ed25519.sign(seed2, new Uint8Array([0x72]));
    assert(Ed25519.bytesToHex(sig2) === '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da'
        + '085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00',
        'RFC 8032 test 2 signature');
    assert(Ed25519.verify(kp2.publicKey, new Uint8Array([0x72]), sig2) === true, 'RFC 8032 test 2 verifies');
    assert(Ed25519.verify(kp2.publicKey, new Uint8Array([0x73]), sig2) === false, 'tampered message fails');
    console.log('✓ cryptographic primitives (FIPS 180-4 + RFC 8032 vectors)');
}

// ---------------------------------------------------------------------
// 1. Identity generation
// ---------------------------------------------------------------------
const aliceProvider = createIdentity('alice');
const bobProvider = createIdentity('bob');
const aliceIdentity = aliceProvider.getSigningIdentity();
{
    assert(aliceIdentity.id.startsWith('did:key:z'), 'identity id is a did:key');
    assert(aliceIdentity.algorithm === 'Ed25519', 'algorithm is Ed25519');
    assert(/^[0-9a-f]{64}$/.test(aliceIdentity.publicKey), 'public key is 32-byte hex');
    const again = aliceProvider.getSigningIdentity();
    assert(again.id === aliceIdentity.id && again.publicKey === aliceIdentity.publicKey,
        'keypair is stable across calls');
    assert(bobProvider.getSigningIdentity().id !== aliceIdentity.id, 'distinct users get distinct identities');
    assert(aliceIdentity.metadata.username === 'alice', 'identity metadata links to the login user');
    console.log('✓ identity generation');
}

// ---------------------------------------------------------------------
// 2. Public-key serialization
// ---------------------------------------------------------------------
{
    const json = aliceIdentity.toJSON();
    const restored = SigningIdentity.fromJSON(json);
    assert(restored.id === json.id && restored.publicKey === json.publicKey, 'SigningIdentity round-trips');
    const embedded = Ed25519.didKeyToPublicKey(aliceIdentity.id);
    assert(Ed25519.bytesToHex(embedded) === aliceIdentity.publicKey, 'did:key embeds the public key');
    assert(Ed25519.didKeyToPublicKey('did:key:zInvalid') === null, 'invalid did:key rejected');
    console.log('✓ public-key serialization');
}

// ---------------------------------------------------------------------
// 3. Sign + verify canonical payload
// ---------------------------------------------------------------------
const verifier = new LocalAuthorizationVerifier();
const descriptor = {
    type: SignatureType.PLACEMENT_RECORD,
    id: 'placement-test',
    revision: 1,
    payload: { hello: 'world', n: 42 }
};
const signature = aliceProvider.signCanonical(descriptor);
{
    assert(signature.signer === aliceIdentity.id, 'signature names the signer');
    assert(signature.domain === 'forkbuild/placement-record', 'domain separation recorded');
    assert(signature.signedHash.length > 0, 'signed hash recorded');
    const check = verifier.verifyDescriptor(descriptor, signature, aliceIdentity.toJSON());
    assert(check.valid === true && check.signed === true, 'canonical signature verifies');
    console.log('✓ sign + verify canonical payload');
}

// ---------------------------------------------------------------------
// 4. Modified payload fails verification (incl. tampered signature bytes)
// ---------------------------------------------------------------------
{
    const modifiedPayload = { ...descriptor, payload: { ...descriptor.payload, n: 43 } };
    assert(verifier.verifyDescriptor(modifiedPayload, signature, aliceIdentity.toJSON()).valid === false,
        'modified payload rejected');
    const modifiedRevision = { ...descriptor, revision: 2 };
    assert(verifier.verifyDescriptor(modifiedRevision, signature, aliceIdentity.toJSON()).valid === false,
        'modified revision rejected');
    const modifiedType = { ...descriptor, type: SignatureType.PUBLICATION };
    assert(verifier.verifyDescriptor(modifiedType, signature, aliceIdentity.toJSON()).valid === false,
        'cross-domain replay rejected');
    const flipped = signature.signature[0] === '0' ? '1' : '0';
    const tamperedSig = Signature.fromJSON({ ...signature.toJSON(), signature: flipped + signature.signature.slice(1) });
    assert(verifier.verifyDescriptor(descriptor, tamperedSig, aliceIdentity.toJSON()).valid === false,
        'tampered signature bytes rejected');
    console.log('✓ modified payload / tampered signature fails verification');
}

// ---------------------------------------------------------------------
// 5. Wrong identity fails verification
// ---------------------------------------------------------------------
{
    const check = verifier.verifyDescriptor(descriptor, signature, bobProvider.getSigningIdentity().toJSON());
    assert(check.valid === false, 'signature does not verify against the wrong identity');
    assert(check.reason === 'signer identity mismatch', 'mismatch is named');
    console.log('✓ wrong identity fails verification');
}

// ---------------------------------------------------------------------
// 6. Publication signature verifies (and legacy publications still work)
// ---------------------------------------------------------------------
let signedPublication;
{
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const doc = createTestDocument('Signed Castle');
    const manager = new DocumentManager();
    manager.load(doc, doc.world.id);
    signedPublication = new PublishDocumentUseCase(publisher, aliceProvider).execute(manager);

    assert(signedPublication.signature !== null, 'publication carries a signature');
    assert(signedPublication.publisherIdentity !== null, 'publication carries the publisher identity');
    assert(signedPublication.signature.signer === aliceIdentity.id, 'publisher signed it');

    const result = verifier.verifyPublication(signedPublication);
    assert(result.valid === true && result.signed === true, 'publication signature verifies');

    // Reloaded through discovery, still verifiable.
    const discovery = new LocalDiscoveryProvider(storage);
    const reloaded = discovery.findById(signedPublication.id);
    assert(verifier.verifyPublication(reloaded).valid === true, 'reloaded publication verifies');

    // Legacy / non-cryptographic publisher: unsigned but tolerated.
    const legacyManager = new DocumentManager();
    legacyManager.load(createTestDocument('Legacy Hut'), 'legacy-doc');
    const legacyPublication = new PublishDocumentUseCase(publisher, stubIdentityProvider).execute(legacyManager);
    const legacyResult = verifier.verifyPublication(legacyPublication);
    assert(legacyResult.valid === true && legacyResult.signed === false, 'unsigned legacy publication tolerated');
    console.log('✓ publication signature verifies');
}

// ---------------------------------------------------------------------
// 7. Tampered Publication rejected
// ---------------------------------------------------------------------
{
    const tampered = Publication.fromJSON({ ...signedPublication.toJSON(), title: 'Tampered Castle' });
    const result = verifier.verifyPublication(tampered);
    assert(result.valid === false && result.signed === true, 'tampered publication rejected');
    console.log('✓ tampered publication rejected');
}

// ---------------------------------------------------------------------
// 8. Placement revision signature verifies (+ legacy tolerance)
// ---------------------------------------------------------------------
const signedRecord = signRecord(aliceProvider, makeRecord({ placementId: 'p-1', publicationId: 'pub-1', x: 10 }));
{
    const check = verifier.verifyPlacement(signedRecord);
    assert(check.valid === true && check.signed === true, 'placement signature verifies');
    const legacy = makeRecord({ placementId: 'p-legacy', publicationId: 'pub-1', x: 20 });
    const legacyCheck = verifier.verifyPlacement(legacy);
    assert(legacyCheck.valid === true && legacyCheck.signed === false, 'unsigned legacy placement tolerated');
    console.log('✓ placement revision signature verifies');
}

// ---------------------------------------------------------------------
// 9. Unauthorized placement revision rejected
// ---------------------------------------------------------------------
{
    // Bob forges revision 2 of Alice's placement, keeping her ownerIdentity.
    const forged = signedRecord.withPosition(new Position(50, 0, 0));
    assert(forged.revision === 2, 'forged revision incremented');
    assert(forged.signature === null, 'withPosition clears the previous signature');
    const forgedSigned = forged.withSignature(bobProvider.signCanonical(forged.getSigningDescriptor()));
    const check = verifier.verifyPlacement(forgedSigned);
    assert(check.valid === false, 'revision signed by a non-owner is rejected');
    assert(check.reason === 'signer identity mismatch', 'authorization failure is named');
    console.log('✓ unauthorized placement revision rejected');
}

// ---------------------------------------------------------------------
// 10. FLAGSHIP: identity -> publish -> sign -> place -> sign -> verify
// ---------------------------------------------------------------------
{
    const alice = createIdentity('alice');
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const trustVerifier = new LocalAuthorizationVerifier();

    const castleManager = new DocumentManager();
    castleManager.load(createTestDocument('Castle'), 'castle-doc');
    const castlePub = new PublishDocumentUseCase(publisher, alice).execute(castleManager);
    assert(trustVerifier.verifyPublication(castlePub).valid === true, 'castle publication signed & valid');

    const placeUseCase = new PlacePublicationUseCase(
        spatialIndexProvider, discoveryProvider,
        new LoadPublicationDocumentUseCase(storage),
        new CreateBrickRegistryUseCase().execute(),
        placementRegistry, alice
    );
    placeUseCase.execute(castlePub.id, new Position(50, 0, 50));
    const castleRecord = placementRegistry.findByPublicationId(castlePub.id)[0];
    assert(castleRecord.signature !== null && castleRecord.ownerIdentity !== null, 'placement revision signed');
    assert(trustVerifier.verifyPlacement(castleRecord).valid === true, 'placement signature valid');
    assert(publisher.verifySnapshot(castlePub.id, castlePub.contentHash) === true, 'content hash verified');
    console.log('✓ FLAGSHIP: identity -> publish -> sign -> place -> sign -> verify');
}

console.log('\nAll decentralized identity tests passed.');
