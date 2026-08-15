import { Delegation, DelegationAction } from '../core/Delegation.js';
import { SigningIdentity } from '../core/SigningIdentity.js';
import { LocalDelegationResolver } from '../identity/LocalDelegationResolver.js';
import { AuthorizationVerifier } from '../identity/AuthorizationVerifier.js';
import { CreateDelegationUseCase } from '../application/CreateDelegationUseCase.js';
import { VerifyDelegationUseCase } from '../application/VerifyDelegationUseCase.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { StorageProvider } from '../storage/StorageProvider.js';

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    const storage = new InMemoryStorageProvider();
    const resolver = new LocalDelegationResolver(storage);
    const verifier = new AuthorizationVerifier();
    const createDelegation = new CreateDelegationUseCase(resolver);
    const verifyDelegation = new VerifyDelegationUseCase(resolver);

    const alice = new SigningIdentity({ id: 'alice-id', username: 'alice', providerId: 'local', privateKey: 'alice-key' });
    const bob = new SigningIdentity({ id: 'bob-id', username: 'bob', providerId: 'local', privateKey: 'bob-key' });
    const charlie = new SigningIdentity({ id: 'charlie-id', username: 'charlie', providerId: 'local', privateKey: 'charlie-key' });

    const pubSubject = { type: 'publication', id: 'pub-123' };
    const placementSubject = { type: 'placement', id: 'pl-123' };

    // 1-5: Delegation Creation & Integrity
    const del = await createDelegation.execute({
        issuerIdentity: alice, delegateIdentity: bob,
        action: DelegationAction.PLACE, subject: pubSubject
    });
    assert(del.signature !== null, '2. Issuer signed delegation');
    
    const validCheck = await verifyDelegation.execute(del.id);
    assert(validCheck.valid === true, '3. Delegation verifies');

    const tamperedDel = Delegation.fromJSON(del.toJSON());
    tamperedDel._action = DelegationAction.MOVE;
    const tamperedCheck = await verifyDelegation.execute(tamperedDel.id);
    // Note: Our local resolver stores by ID, so mutating the object in memory doesn't change storage, 
    // but if we verify the tampered object directly against its original signature, it fails.
    const tamperedSigValid = await alice.verify(tamperedDel.getCanonicalPayload(), del.signature);
    assert(tamperedSigValid === false, '4. Tampered delegation fails signature');

    const wrongIssuerSig = await bob.verify(del.getCanonicalPayload(), del.signature);
    assert(wrongIssuerSig === false, '5. Wrong issuer signature fails');

    // 6-7: Placement Authorization (Direct vs Delegated)
    const directRecord = new PlacementRecord({
        publicationId: 'pub-123', ownerIdentity: alice, position: new Position(0,0,0)
    });
    directRecord._signature = await alice.sign(directRecord.getCanonicalPayload());
    
    const directResult = await verifier.verify({
        signerIdentity: alice, ownerIdentity: alice, requiredAction: 'PLACE',
        subject: pubSubject, signature: directRecord.signature,
        payload: directRecord.getCanonicalPayload(), delegationId: null, delegationResolver: resolver
    });
    assert(directResult.authorized && directResult.mode === 'DIRECT', '6. Direct owner placement valid');

    const delegatedRecord = new PlacementRecord({
        publicationId: 'pub-123', ownerIdentity: alice,
        authorizedBy: { identity: bob, delegationId: del.id },
        position: new Position(10,0,0)
    });
    delegatedRecord._signature = await bob.sign(delegatedRecord.getCanonicalPayload());

    const delegatedResult = await verifier.verify({
        signerIdentity: bob, ownerIdentity: alice, requiredAction: 'PLACE',
        subject: pubSubject, signature: delegatedRecord.signature,
        payload: delegatedRecord.getCanonicalPayload(), delegationId: del.id, delegationResolver: resolver
    });
    assert(delegatedResult.authorized && delegatedResult.mode === 'DELEGATED', '7. Delegated placement valid');

    // 8-10: Rejection Paths
    const charlieRecord = new PlacementRecord({
        publicationId: 'pub-123', ownerIdentity: alice,
        authorizedBy: { identity: charlie, delegationId: del.id },
        position: new Position(20,0,0)
    });
    charlieRecord._signature = await charlie.sign(charlieRecord.getCanonicalPayload());
    
    const wrongDelegateResult = await verifier.verify({
        signerIdentity: charlie, ownerIdentity: alice, requiredAction: 'PLACE',
        subject: pubSubject, signature: charlieRecord.signature,
        payload: charlieRecord.getCanonicalPayload(), delegationId: del.id, delegationResolver: resolver
    });
    assert(!wrongDelegateResult.authorized && wrongDelegateResult.reason === 'DELEGATION_DELEGATE_MISMATCH', '8. Wrong delegate rejected');

    const moveResult = await verifier.verify({
        signerIdentity: bob, ownerIdentity: alice, requiredAction: 'MOVE',
        subject: pubSubject, signature: delegatedRecord.signature,
        payload: delegatedRecord.getCanonicalPayload(), delegationId: del.id, delegationResolver: resolver
    });
    assert(!moveResult.authorized && moveResult.reason === 'DELEGATION_ACTION_MISMATCH', '9. Wrong action rejected');

    const wrongSubjectResult = await verifier.verify({
        signerIdentity: bob, ownerIdentity: alice, requiredAction: 'PLACE',
        subject: { type: 'publication', id: 'pub-999' }, signature: delegatedRecord.signature,
        payload: delegatedRecord.getCanonicalPayload(), delegationId: del.id, delegationResolver: resolver
    });
    assert(!wrongSubjectResult.authorized && wrongSubjectResult.reason === 'DELEGATION_SUBJECT_MISMATCH', '10. Wrong subject rejected');

    // 11: Expiration
    const expiredDel = await createDelegation.execute({
        issuerIdentity: alice, delegateIdentity: bob, action: 'PLACE', subject: pubSubject,
        expiresAt: new Date(Date.now() - 10000)
    });
    const expiredResult = await verifier.verify({
        signerIdentity: bob, ownerIdentity: alice, requiredAction: 'PLACE',
        subject: pubSubject, signature: delegatedRecord.signature,
        payload: delegatedRecord.getCanonicalPayload(), delegationId: expiredDel.id, delegationResolver: resolver
    });
    assert(!expiredResult.authorized && expiredResult.reason === 'DELEGATION_EXPIRED', '11. Expired delegation rejected');

    // 12-13: Spatial Constraints
    const constrainedDel = await createDelegation.execute({
        issuerIdentity: alice, delegateIdentity: bob, action: 'PLACE', subject: pubSubject,
        constraints: { region: { min: {x:0,y:0,z:0}, max: {x:100,y:100,z:100} } }
    });
    
    const insidePos = new Position(50, 50, 50);
    const insideRecord = new PlacementRecord({
        publicationId: 'pub-123', ownerIdentity: alice,
        authorizedBy: { identity: bob, delegationId: constrainedDel.id }, position: insidePos
    });
    insideRecord._signature = await bob.sign(insideRecord.getCanonicalPayload());
    
    const insideResult = await verifier.verify({
        signerIdentity: bob, ownerIdentity: alice, requiredAction: 'PLACE',
        subject: pubSubject, signature: insideRecord.signature,
        payload: insideRecord.getCanonicalPayload(), delegationId: constrainedDel.id,
        delegationResolver: resolver, constraintsContext: { position: insidePos }
    });
    assert(insideResult.authorized, '12. Constrained delegation accepts valid position');

    const outsidePos = new Position(500, 500, 500);
    const outsideResult = await verifier.verify({
        signerIdentity: bob, ownerIdentity: alice, requiredAction: 'PLACE',
        subject: pubSubject, signature: insideRecord.signature, // Reusing sig for test
        payload: insideRecord.getCanonicalPayload(), delegationId: constrainedDel.id,
        delegationResolver: resolver, constraintsContext: { position: outsidePos }
    });
    assert(!outsideResult.authorized && outsideResult.reason === 'DELEGATION_CONSTRAINT_VIOLATION', '13. Constrained delegation rejects invalid position');

    // 14-15: MOVE capability separation
    const moveDel = await createDelegation.execute({
        issuerIdentity: alice, delegateIdentity: bob, action: 'MOVE', subject: placementSubject
    });

    const moveRecord = new PlacementRecord({
        publicationId: 'pub-123', ownerIdentity: alice,
        authorizedBy: { identity: bob, delegationId: moveDel.id },
        position: new Position(30, 0, 0)
    });
    moveRecord._signature = await bob.sign(moveRecord.getCanonicalPayload());

    const moveAuthResult = await verifier.verify({
        signerIdentity: bob, ownerIdentity: alice, requiredAction: 'MOVE',
        subject: placementSubject, signature: moveRecord.signature,
        payload: moveRecord.getCanonicalPayload(), delegationId: moveDel.id, delegationResolver: resolver
    });
    assert(moveAuthResult.authorized, '15. Valid MOVE delegation permits movement');
    
    // Re-using the PLACE delegation (del) for a MOVE attempt
    const placeDelForMove = await verifier.verify({
        signerIdentity: bob, ownerIdentity: alice, requiredAction: 'MOVE',
        subject: pubSubject, signature: delegatedRecord.signature,
        payload: delegatedRecord.getCanonicalPayload(), delegationId: del.id, delegationResolver: resolver
    });
    assert(!placeDelForMove.authorized, '14. Bob cannot move using PLACE-only delegation');

    console.log('✅ All Delegated Authorization tests passed.');
}

runTests().catch(console.error);
