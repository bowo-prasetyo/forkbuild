import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { assert } from './support/Assert.js';

// World View's publication panel opens for any Publication, including one a
// peer shared. Unpublish and Distribute act as the publisher, so they are
// offered only on the viewer's own Publication; everything else stays.

const isOwn = (ctx) => OwnPublicationPanel.computed.isOwnPublication.call(ctx);
const mine = 'did:key:zMine';
const signedBy = (id) => ({ id: 'pub-1', title: 'World', publisherIdentity: { id, algorithm: 'Ed25519', publicKey: 'ab' }, signature: {} });

// Who owns a Publication.
{
    assert(isOwn({ publication: null, sessionIdentityId: mine }) === false, 'no Publication is nobody\'s');
    assert(isOwn({ publication: signedBy(mine), sessionIdentityId: mine }) === true, 'a Publication the signed-in identity signed is its own');
    assert(isOwn({ publication: signedBy(mine), sessionIdentityId: mine, viewerIdentityId: null }) === true,
        'it stays its own while the identity is locked (the session still names it)');
    assert(isOwn({ publication: signedBy(mine), sessionIdentityId: null, viewerIdentityId: mine }) === true, 'the signing identity counts when there is no session id');
    assert(isOwn({ publication: signedBy('did:key:zSomeoneElse'), sessionIdentityId: mine }) === false, 'a Publication someone else signed is not');
    assert(isOwn({ publication: signedBy(mine), sessionIdentityId: null, viewerIdentityId: null }) === false, 'signed out, no signed Publication is yours');
    assert(isOwn({ publication: { id: 'legacy', title: 'Old', publisherIdentity: null }, sessionIdentityId: null }) === true,
        'an unsigned legacy Publication can only have been published on this device');
    console.log('✓ a Publication is the viewer\'s own when the signed-in identity signed it (or it is unsigned and local)');
}

// The owner-only actions refuse on someone else's Publication, even when
// called directly.
{
    const calls = [];
    const ctx = {
        publication: signedBy('did:key:zSomeoneElse'),
        isOwnPublication: false,
        unpublishCommand: () => calls.push('unpublish'),
        snapshotDistributionCommand: async () => { calls.push('snapshot'); return {}; },
        publicationDistributionCommand: async () => { calls.push('publication'); return null; },
        snapshotDistributionExecuting: false,
        publicationDistributionExecuting: false
    };
    OwnPublicationPanel.methods.unpublishOwnPublication.call(ctx);
    OwnPublicationPanel.methods.distributeOwnSnapshot.call(ctx);
    OwnPublicationPanel.methods.distributeOwnPublication.call(ctx);
    assert(calls.length === 0, `nothing is unpublished or distributed for someone else's Publication (got ${calls.join(', ')})`);

    ctx.isOwnPublication = true;
    OwnPublicationPanel.methods.unpublishOwnPublication.call(ctx);
    assert(calls.includes('unpublish'), 'the same action works on the viewer\'s own');
    console.log('✓ Unpublish and Distribute refuse someone else\'s Publication');
}

// The session identity is read from the injected IdentityUseCase.
{
    const ctx = { identityUseCase: { currentSession: () => ({ identityId: mine }) }, sessionIdentityId: null };
    OwnPublicationPanel.methods.readSessionIdentity.call(ctx);
    assert(ctx.sessionIdentityId === mine, 'the panel reads who is signed in from the session');
    const signedOut = { identityUseCase: { currentSession: () => ({ identityId: null }) }, sessionIdentityId: mine };
    OwnPublicationPanel.methods.readSessionIdentity.call(signedOut);
    assert(signedOut.sessionIdentityId === null, 'and forgets it on sign-out');
    console.log('✓ the panel follows the signed-in identity');
}

console.log('\n✅ All OwnPublicationPanelOwnership tests passed.');
