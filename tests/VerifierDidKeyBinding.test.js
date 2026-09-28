// A did:key names its public key, so a signed record whose identity pairs one
// person's did:key with another key is a forgery. LocalAuthorizationVerifier
// #verifyDescriptor() refuses it, which covers every verifier that checks a
// record against the identity it carries (Publications, placements,
// decentralized Publications, anchors, snapshot locators).
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { publicKeyMatchesDidKey } from '../identity/Ed25519.js';
import { Publication } from '../publisher/Publication.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

function createIdentity(username) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(username);
    provider.getSigningIdentity();
    return provider;
}

const victim = createIdentity('victim');
const attacker = createIdentity('attacker');
const victimIdentity = victim.getSigningIdentity().toJSON();
const attackerIdentity = attacker.getSigningIdentity().toJSON();
// The attacker's own key, labelled with the victim's did:key.
const forgedIdentity = { ...attackerIdentity, id: victimIdentity.id };
const verifier = new LocalAuthorizationVerifier();

// The attacker signs with their own key and names the victim as signer.
function forgedSignature(descriptor) {
    return { ...attacker.signCanonical(descriptor).toJSON(), signer: victimIdentity.id };
}

// Section A — the binding itself.
{
    assert(publicKeyMatchesDidKey(victimIdentity.id, victimIdentity.publicKey), 'A1. a did:key matches the key it encodes');
    assert(publicKeyMatchesDidKey(victimIdentity.id, victimIdentity.publicKey.toUpperCase()), 'A2. hex case doesn\'t matter');
    assert(!publicKeyMatchesDidKey(victimIdentity.id, attackerIdentity.publicKey), 'A3. another key does not match');
    assert(!publicKeyMatchesDidKey('did:key:zNotReal', victimIdentity.publicKey) && !publicKeyMatchesDidKey(victimIdentity.id, 'zz')
        && !publicKeyMatchesDidKey(victimIdentity.id, null), 'A4. malformed input never matches, and never throws');
    console.log('✓ Section A: a did:key matches only the key it encodes');
}

// Section B — a forged Publication is refused.
{
    const genuine = new Publication({ id: 'p1', documentId: 'd', title: 't', author: 'victim', publisherIdentity: victimIdentity });
    const signed = genuine.withSignature(victim.signCanonical(genuine.getSigningDescriptor()));
    assert(verifier.verifyPublication(signed).valid, 'B1. a genuine Publication still verifies');

    const forged = new Publication({ id: 'p2', documentId: 'd', title: 't', author: 'victim', publisherIdentity: forgedIdentity });
    const result = verifier.verifyPublication(forged.withSignature(forgedSignature(forged.getSigningDescriptor())));
    assert(!result.valid && result.reason === 'public key does not match identity',
        `B2. a Publication claiming the victim's did:key with the attacker's key is refused — got ${JSON.stringify(result)}`);
    console.log('✓ Section B: a Publication can\'t be passed off as someone else\'s');
}

// Section C — a forged PlacementRecord is refused.
{
    const make = (identity) => {
        let record = new PlacementRecord({
            placementId: 'pl', publicationId: 'p1', revision: 1, position: new Position(1, 0, 1),
            bounds: new SpatialBounds({ min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 1, z: 0.5 } })
        }).withOwnerIdentity(identity);
        return record.withContentHash(record.computeContentHash());
    };
    const genuine = make(victimIdentity);
    assert(verifier.verifyPlacement(genuine.withSignature(victim.signCanonical(genuine.getSigningDescriptor()))).valid,
        'C1. a genuine placement still verifies');
    const forged = make(forgedIdentity);
    assert(!verifier.verifyPlacement(forged.withSignature(forgedSignature(forged.getSigningDescriptor()))).valid,
        'C2. a placement claiming the victim\'s did:key with the attacker\'s key is refused');
    console.log('✓ Section C: a placement can\'t be passed off as someone else\'s');
}

// Section D — verifyDescriptor, which every carried-identity verifier uses.
{
    const descriptor = { type: 'publication', id: 'x', revision: 1, payload: { a: 1 } };
    assert(verifier.verifyDescriptor(descriptor, victim.signCanonical(descriptor), victimIdentity).valid, 'D1. a genuine signature verifies');
    assert(!verifier.verifyDescriptor(descriptor, forgedSignature(descriptor), forgedIdentity).valid, 'D2. a mislabelled key is refused');
    assert(verifier.verifyDescriptor(descriptor, attacker.signCanonical(descriptor), attackerIdentity).valid,
        'D3. the attacker signing honestly as themselves is still valid — only impersonation is refused');
    console.log('✓ Section D: verifyDescriptor binds the key to the did:key');
}
