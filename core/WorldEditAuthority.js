// 0.2.98 — Shared World Membership & Collaborative Presence.
//
// "What has THIS replica learned and independently verified about which
// OTHER identities a World's owner has granted EDIT authority to?" —
// deliberately the same THIRD-concept shape core/DeviceAuthority.js
// already established for device authorization, applied one layer over:
//
//   application/WorldMembershipUseCase.js  "Given a live signed grant/
//   #grantEdit()/#revokeEdit()              revocation THIS replica's
//                                            own owner produced, record
//                                            it" — local, first-person,
//                                            the authoring side.
//   WorldEditAuthority (THIS)               "What have I, a completely
//                                            different replica, learned
//                                            and independently verified
//                                            about SOME World's granted
//                                            editors?" — never enforced
//                                            anywhere on its own; only
//                                            ever consulted THROUGH
//                                            application/
//                                            WorldAuthorizationService.js.
//
// One record per (worldDocumentId, subjectIdentityId) PAIR — never
// merely per subjectIdentityId — because the whole point is that Bob
// being editable on Alice's World A says nothing about World B (see
// docs/Roadmap.md, 0.2.97's own named gap this milestone closes: "Alice
// can edit World A / Alice cannot therefore edit World B," now extended
// to a SECOND identity rather than only Alice's own devices).
//
// `grant`/`revocation` are each either null or the EXACT signed record
// (core/WorldEditAuthorizationEnvelope.js's own JSON shape, including
// its `signature`) this replica received and independently verified —
// this class is its own evidence, never a re-derived summary of one,
// mirroring core/DeviceAuthority.js's own discipline exactly.
//
// Like a device authorization and UNLIKE an identity's own permanent,
// one-way revocation, `isAuthorized` is a TIMESTAMP COMPARISON, not a
// one-way latch: an owner can re-grant an identity it previously
// revoked, because losing World EDIT authority is not the irreversible
// act identity revocation itself is.
export class WorldEditAuthority {
    constructor({
        worldDocumentId,
        subjectIdentityId,
        grantingIdentityId = null,
        grant = null,
        revocation = null,
        updatedAt = new Date()
    } = {}) {
        if (!worldDocumentId || typeof worldDocumentId !== 'string') {
            throw new Error('WorldEditAuthority: worldDocumentId is required');
        }
        if (!subjectIdentityId || typeof subjectIdentityId !== 'string') {
            throw new Error('WorldEditAuthority: subjectIdentityId is required');
        }
        this._worldDocumentId = worldDocumentId;
        this._subjectIdentityId = subjectIdentityId;
        this._grantingIdentityId = grantingIdentityId || null;
        this._grant = grant || null;
        this._revocation = revocation || null;
        this._updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
    }

    get worldDocumentId() { return this._worldDocumentId; }
    get subjectIdentityId() { return this._subjectIdentityId; }
    get grantingIdentityId() { return this._grantingIdentityId; }
    get grant() { return this._grant; }
    get revocation() { return this._revocation; }
    get updatedAt() { return this._updatedAt; }

    // Authorized right now iff a grant is on file AND either there is no
    // revocation at all, or the grant is STRICTLY newer than the most
    // recent revocation this replica has seen — see this file's own
    // header on why re-granting after a revocation is meaningful.
    get isAuthorized() {
        if (!this._grant) {
            return false;
        }
        if (!this._revocation) {
            return true;
        }
        return new Date(this._grant.authorizedAt).getTime() > new Date(this._revocation.revokedAt).getTime();
    }

    withGrant(record, grantingIdentityId, updatedAt = new Date()) {
        return new WorldEditAuthority({
            worldDocumentId: this._worldDocumentId,
            subjectIdentityId: this._subjectIdentityId,
            grantingIdentityId: grantingIdentityId || this._grantingIdentityId,
            grant: record,
            revocation: this._revocation,
            updatedAt
        });
    }

    withRevocation(record, updatedAt = new Date()) {
        return new WorldEditAuthority({
            worldDocumentId: this._worldDocumentId,
            subjectIdentityId: this._subjectIdentityId,
            grantingIdentityId: this._grantingIdentityId,
            grant: this._grant,
            revocation: record,
            updatedAt
        });
    }

    toJSON() {
        return {
            worldDocumentId: this._worldDocumentId,
            subjectIdentityId: this._subjectIdentityId,
            grantingIdentityId: this._grantingIdentityId,
            grant: this._grant,
            revocation: this._revocation,
            updatedAt: this._updatedAt.toISOString()
        };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        return new WorldEditAuthority(json);
    }
}
