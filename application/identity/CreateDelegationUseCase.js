import { Delegation } from '../../core/Delegation.js';
import { SigningIdentity } from '../../identity/SigningIdentity.js';
import { UserFacingError } from '../../core/UserFacingError.js';
import { message } from '../../core/Message.js';

// Issues a Delegation signed by the identity provider's own identity, through
// the same canonical-envelope Ed25519 signing as every other record. The
// issuer is always the signing identity: a caller can't name someone else.
export class CreateDelegationUseCase {
    constructor(delegationResolver, identityProvider) {
        if (!identityProvider || typeof identityProvider.signCanonical !== 'function'
            || typeof identityProvider.getSigningIdentity !== 'function') {
            throw new Error('CreateDelegationUseCase: an identity provider that can sign is required');
        }
        this._resolver = delegationResolver;
        this._identityProvider = identityProvider;
    }

    async execute({ delegateIdentity, action, subject, constraints = null, expiresAt = null }) {
        const issuer = this._identityProvider.getSigningIdentity();
        if (!issuer) {
            throw new UserFacingError(message('refusal.signInToIssueA'), { detail: 'CreateDelegationUseCase: sign in to issue a delegation' });
        }
        const delegate = delegateIdentity instanceof SigningIdentity
            ? delegateIdentity
            : SigningIdentity.fromJSON(delegateIdentity && typeof delegateIdentity.toJSON === 'function' ? delegateIdentity.toJSON() : delegateIdentity);
        if (!delegate) {
            throw new Error('CreateDelegationUseCase: a delegate identity with a public key is required');
        }
        const unsigned = new Delegation({
            issuerIdentity: SigningIdentity.fromJSON(issuer.toJSON()),
            delegateIdentity: delegate,
            action,
            subject,
            constraints,
            expiresAt
        });
        const delegation = unsigned.withSignature(this._identityProvider.signCanonical(unsigned.getSigningDescriptor()));
        await this._resolver.save(delegation);
        return delegation;
    }
}
