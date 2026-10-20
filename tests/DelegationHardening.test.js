import { Delegation, DelegationAction } from '../core/publication/Delegation.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { AuthorizationVerifier } from '../identity/AuthorizationVerifier.js';
import { LocalDelegationResolver } from '../identity/LocalDelegationResolver.js';
import { ReplayGuard } from '../replication/ReplayGuard.js';
import { CreateDelegationUseCase } from '../application/identity/CreateDelegationUseCase.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Delegations: replay detection, canonical capability scope, and
// explicitly rejected chains.

function createIdentity(username) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(username);
    provider.getSigningIdentity();
    return provider;
}

async function runTests() {
    const alice = createIdentity('alice');
    const bob = createIdentity('bob');
    const aliceIdentity = alice.getSigningIdentity();
    const bobIdentity = bob.getSigningIdentity();

    // -------------------------------------------------------------
    // 13. Delegation replay is detectable via ReplayGuard, decoupled
    //     from whether the delegation remains otherwise valid.
    // -------------------------------------------------------------
    {
        const resolver = new LocalDelegationResolver(new InMemoryStorageProvider());
        const createDelegation = new CreateDelegationUseCase(resolver, alice);
        const del = await createDelegation.execute({
            delegateIdentity: bobIdentity,
            action: DelegationAction.PLACE, subject: { type: 'publication', id: 'pub-1' }
        });
        assert(typeof del.nonce === 'string' && del.nonce.length > 0, '13a. Every delegation carries a nonce');
        assert(del.issuedFor === bobIdentity.id, '13b. issuedFor names the delegate flatly');

        const guard = new ReplayGuard();
        const hash = del.computeHash();
        assert(!guard.hasAccepted(hash, 'delegation'), '13c. A fresh delegation has not been seen before');
        guard.recordAccepted(hash, 'delegation');
        assert(guard.hasAccepted(hash, 'delegation'), '13. Replaying the identical delegation object is now detectable');

        // A second, semantically-similar-but-freshly-issued delegation
        // is NOT a replay — different nonce, different hash.
        const del2 = await createDelegation.execute({
            delegateIdentity: bobIdentity,
            action: DelegationAction.PLACE, subject: { type: 'publication', id: 'pub-1' }
        });
        assert(del2.nonce !== del.nonce, '13d. Two issuances of the same terms carry different nonces');
        assert(!guard.hasAccepted(del2.computeHash(), 'delegation'), '13e. A fresh issuance is not flagged as a replay');
    }

    // -------------------------------------------------------------
    // 14-16. Canonical capability scope: independent of incidental
    //        JSON shape, comparable by hash across replicas.
    // -------------------------------------------------------------
    {
        const region = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
        const delA = new Delegation({
            issuerIdentity: aliceIdentity, delegateIdentity: bobIdentity,
            action: DelegationAction.PLACE, subject: { type: 'publication', id: 'pub-1' },
            constraints: { region }
        });
        const delB = new Delegation({
            issuerIdentity: aliceIdentity, delegateIdentity: bobIdentity,
            action: DelegationAction.PLACE, subject: { type: 'publication', id: 'pub-1' },
            constraints: { region: { min: { ...region.min }, max: { ...region.max } } } // independently constructed, same meaning
        });
        assert(delA.scopeHash === delB.scopeHash, '14. Two independently-serialized delegations with the same capability hash identically');

        const delDifferentAction = new Delegation({
            issuerIdentity: aliceIdentity, delegateIdentity: bobIdentity,
            action: DelegationAction.MOVE, subject: { type: 'publication', id: 'pub-1' },
            constraints: { region }
        });
        assert(delA.scopeHash !== delDifferentAction.scopeHash,
            '15. A PLACE capability and a MOVE capability hash differently even over the same subject/region');
        assert(delA.scope.action === DelegationAction.PLACE && delA.scope.spatialScope.max.x === 10,
            '16. scope exposes the normalized action + spatial region directly');
    }

    // -------------------------------------------------------------
    // 17. Delegation chains are explicitly rejected, not silently
    //     mis-authorized.
    // -------------------------------------------------------------
    {
        const carol = createIdentity('carol');
        const carolIdentity = carol.getSigningIdentity();

        const resolver = new LocalDelegationResolver(new InMemoryStorageProvider());
        const createDelegation = new CreateDelegationUseCase(resolver, alice);
        const verifier = new AuthorizationVerifier();
        const grant = await createDelegation.execute({
            delegateIdentity: bobIdentity,
            action: DelegationAction.PLACE, subject: { type: 'publication', id: 'pub-chain' }
        });
        assert(grant.parentDelegationId === null, 'sanity: a direct-from-owner delegation has no parent');

        // Bob attempts to re-delegate to Carol under his OWN delegation
        // (rather than Alice, the actual owner, issuing directly).
        const unsignedChain = new Delegation({
            issuerIdentity: bobIdentity, delegateIdentity: carolIdentity,
            action: DelegationAction.PLACE, subject: { type: 'publication', id: 'pub-chain' },
            parentDelegationId: grant.id
        });
        const chained = unsignedChain.withSignature(bob.signCanonical(unsignedChain.getSigningDescriptor()));
        await resolver.save(chained);

        const action = { type: 'placement-record', id: 'chain-placement', revision: 1, payload: { publicationId: 'pub-chain' } };
        const result = await verifier.verify({
            signerIdentity: carolIdentity, ownerIdentity: aliceIdentity,
            requiredAction: DelegationAction.PLACE,
            subject: { type: 'publication', id: 'pub-chain' },
            descriptor: action, signature: carol.signCanonical(action),
            delegationId: chained.id, delegationResolver: resolver
        });
        assert(result.authorized === false && result.reason === 'UNSUPPORTED_DELEGATION_CHAIN',
            '17. A delegation chain (parentDelegationId set) is rejected with a named, explicit reason');
    }

    console.log('✅ All delegation hardening tests passed.');
}

await runTests().catch((e) => { console.error(e); throw e; });
