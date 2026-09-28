// Delegated authorization: an owner signs a Delegation letting another
// identity PLACE or MOVE on their behalf. Every signature here is a real
// Ed25519 signature over a canonical envelope, checked with the key the
// signer's did:key encodes; nothing a caller can write by hand passes.
import { Delegation, DelegationAction } from '../core/Delegation.js';
import { Signature } from '../core/Signature.js';
import { LocalDelegationResolver } from '../identity/LocalDelegationResolver.js';
import { AuthorizationVerifier } from '../identity/AuthorizationVerifier.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { CreateDelegationUseCase } from '../application/identity/CreateDelegationUseCase.js';
import { VerifyDelegationUseCase } from '../application/identity/VerifyDelegationUseCase.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';
import { assert } from './support/Assert.js';

const storage = new InMemoryStorageProvider();
const resolver = new LocalDelegationResolver(storage);
const verifier = new AuthorizationVerifier();
const verifyDelegation = new VerifyDelegationUseCase(resolver);

const aliceProvider = makeIdentity('Alice');
const bobProvider = makeIdentity('Bob');
const charlieProvider = makeIdentity('Charlie');
const alice = aliceProvider.getSigningIdentity();
const bob = bobProvider.getSigningIdentity();
const charlie = charlieProvider.getSigningIdentity();
const createDelegation = new CreateDelegationUseCase(resolver, aliceProvider);

const pubSubject = { type: 'publication', id: 'pub-123' };
const placementSubject = { type: 'placement', id: 'pl-123' };

// A placement record for Alice's publication, signed by `signerProvider`.
function signedPlacement(signerProvider, { delegationId = null, position }) {
    const signer = signerProvider.getSigningIdentity();
    const record = new PlacementRecord({
        publicationId: 'pub-123',
        owner: 'alice',
        ownerIdentity: alice.toJSON(),
        authorizedBy: delegationId ? { identity: signer.toJSON(), delegationId } : null,
        position
    });
    return record.withSignature(signerProvider.signCanonical(record.getSigningDescriptor()));
}

function authorize(signerIdentity, record, { requiredAction = 'PLACE', subject = pubSubject, delegationId = null, constraintsContext = null } = {}) {
    return verifier.verify({
        signerIdentity, ownerIdentity: alice, requiredAction, subject,
        descriptor: record.getSigningDescriptor(), signature: record.signature,
        delegationId, delegationResolver: resolver, constraintsContext
    });
}

// 1-5: Delegation creation and integrity
const del = await createDelegation.execute({ delegateIdentity: bob, action: DelegationAction.PLACE, subject: pubSubject });
assert(del.issuerIdentity.id === alice.id, '1. the issuer is always the signing identity');
assert(del.signature && Signature.fromJSON(del.signature).signer === alice.id, '2. Issuer signed delegation');
assert((await verifyDelegation.execute(del.id)).valid === true, '3. Delegation verifies');

const local = new LocalAuthorizationVerifier();
const tampered = Delegation.fromJSON({ ...del.toJSON(), action: DelegationAction.MOVE });
assert(!local.verifyDelegation(tampered).valid, '4. Tampered delegation fails signature');

const signedByBob = new Delegation({ ...Delegation.fromJSON(del.toJSON())._fields(), signature: null });
const bobSigned = signedByBob.withSignature(bobProvider.signCanonical(signedByBob.getSigningDescriptor()));
assert(!local.verifyDelegation(bobSigned).valid, '5. A delegation naming Alice as issuer but signed by Bob fails');

// 6-7: Placement authorization, direct and delegated
const directRecord = signedPlacement(aliceProvider, { position: new Position(0, 0, 0) });
const directResult = await authorize(alice, directRecord);
assert(directResult.authorized && directResult.mode === 'DIRECT', '6. Direct owner placement valid');

const delegatedRecord = signedPlacement(bobProvider, { delegationId: del.id, position: new Position(10, 0, 0) });
const delegatedResult = await authorize(bob, delegatedRecord, { delegationId: del.id });
assert(delegatedResult.authorized && delegatedResult.mode === 'DELEGATED', '7. Delegated placement valid');

// 8-10: Rejection paths
const charlieRecord = signedPlacement(charlieProvider, { delegationId: del.id, position: new Position(20, 0, 0) });
const wrongDelegate = await authorize(charlie, charlieRecord, { delegationId: del.id });
assert(!wrongDelegate.authorized && wrongDelegate.reason === 'DELEGATION_DELEGATE_MISMATCH', '8. Wrong delegate rejected');

const wrongAction = await authorize(bob, delegatedRecord, { requiredAction: 'MOVE', delegationId: del.id });
assert(!wrongAction.authorized && wrongAction.reason === 'DELEGATION_ACTION_MISMATCH', '9. Wrong action rejected');

const wrongSubject = await authorize(bob, delegatedRecord, { subject: { type: 'publication', id: 'pub-999' }, delegationId: del.id });
assert(!wrongSubject.authorized && wrongSubject.reason === 'DELEGATION_SUBJECT_MISMATCH', '10. Wrong subject rejected');

// 11: Expiration
const expiredDel = await createDelegation.execute({
    delegateIdentity: bob, action: 'PLACE', subject: pubSubject, expiresAt: new Date(Date.now() - 10000)
});
const expired = await authorize(bob, delegatedRecord, { delegationId: expiredDel.id });
assert(!expired.authorized && expired.reason === 'DELEGATION_EXPIRED', '11. Expired delegation rejected');
assert((await verifyDelegation.execute(expiredDel.id)).reason === 'EXPIRED', '11b. and reported as expired');

// 12-13: Spatial constraints
const constrainedDel = await createDelegation.execute({
    delegateIdentity: bob, action: 'PLACE', subject: pubSubject,
    constraints: { region: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } } }
});
const insidePos = new Position(50, 50, 50);
const insideRecord = signedPlacement(bobProvider, { delegationId: constrainedDel.id, position: insidePos });
const inside = await authorize(bob, insideRecord, { delegationId: constrainedDel.id, constraintsContext: { position: insidePos } });
assert(inside.authorized, '12. Constrained delegation accepts valid position');
const outside = await authorize(bob, insideRecord, { delegationId: constrainedDel.id, constraintsContext: { position: new Position(500, 500, 500) } });
assert(!outside.authorized && outside.reason === 'DELEGATION_CONSTRAINT_VIOLATION', '13. Constrained delegation rejects invalid position');

// 14-15: MOVE capability separation
const moveDel = await createDelegation.execute({ delegateIdentity: bob, action: 'MOVE', subject: placementSubject });
const moveRecord = signedPlacement(bobProvider, { delegationId: moveDel.id, position: new Position(30, 0, 0) });
assert(!(await authorize(bob, delegatedRecord, { requiredAction: 'MOVE', delegationId: del.id })).authorized,
    '14. Bob cannot move using PLACE-only delegation');
assert((await authorize(bob, moveRecord, { requiredAction: 'MOVE', subject: placementSubject, delegationId: moveDel.id })).authorized,
    '15. Valid MOVE delegation permits movement');

// 16-21: Forgeries a hand-written or borrowed signature can't get past
const mockSigned = Delegation.fromJSON({
    ...del.toJSON(), id: 'forged-1', signature: { signerId: alice.id, payloadHash: 'x', signature: `mock-sig-${alice.publicKey}-x` }
});
await resolver.save(mockSigned);
assert((await verifyDelegation.execute('forged-1')).reason === 'INVALID_SIGNATURE', '16. the old mock signature format is refused');
assert((await authorize(bob, delegatedRecord, { delegationId: 'forged-1' })).reason === 'INVALID_DELEGATION_SIGNATURE',
    '17. and never authorizes an action');

const bobIssued = Delegation.fromJSON({ ...del.toJSON(), id: 'forged-2', signature: null });
await resolver.save(bobIssued.withSignature(bobProvider.signCanonical(bobIssued.getSigningDescriptor())));
assert((await authorize(bob, delegatedRecord, { delegationId: 'forged-2' })).reason === 'INVALID_DELEGATION_SIGNATURE',
    '18. Bob can\'t grant himself Alice\'s authority by signing a delegation in her name');

const swappedKey = Delegation.fromJSON({
    ...bobIssued.withSignature(bobProvider.signCanonical(bobIssued.getSigningDescriptor())).toJSON(),
    id: 'forged-3', issuerIdentity: { ...alice.toJSON(), publicKey: bob.publicKey }
});
assert(!local.verifyDelegation(swappedKey).valid, '19. a record carrying Alice\'s did:key with Bob\'s key is refused');

const storedTampered = { ...del.toJSON(), id: del.id };
storage.save('forkbuild-delegations', [...storage.load('forkbuild-delegations'), { ...storedTampered, id: 'forged-4', action: 'MOVE' }]);
assert((await verifyDelegation.execute('forged-4')).reason === 'INVALID_SIGNATURE', '20. a stored delegation changed after signing is refused');

const replayed = await verifier.verify({
    signerIdentity: alice, ownerIdentity: alice, requiredAction: 'PLACE', subject: pubSubject,
    descriptor: directRecord.getSigningDescriptor(), signature: del.signature,
    delegationId: null, delegationResolver: resolver
});
assert(!replayed.authorized && replayed.reason === 'INVALID_SIGNATURE', '21. a delegation signature can\'t be replayed as an action\'s signature');

let threw = false;
try { new CreateDelegationUseCase(resolver, { getSigningIdentity: () => alice }); } catch { threw = true; }
assert(threw, '22. issuing needs an identity provider that can sign');

console.log('✅ All Delegated Authorization tests passed.');
