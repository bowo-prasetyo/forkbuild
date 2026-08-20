// 0.2.78 — Multi-Device Identity Semantics.
//
// "What does THIS device know, second-hand and verified, about which
// OTHER keys some identity has authorized to act as one of its
// devices?" — deliberately the same THIRD-concept shape core/
// RemoteIdentityLifecycle.js already established for revocation/
// succession, applied one layer over:
//
//   identity/LocalIdentityProvider.js  "Which devices has MY OWN
//   #listDeviceAuthorizations()         identity authorized?" — local,
//                                        first-person, the authoring
//                                        side (0.2.78).
//   DeviceAuthority (THIS)              "What have I, a completely
//                                        different device, learned and
//                                        independently verified about
//                                        SOME OTHER identity's
//                                        authorized devices?" — never
//                                        enforced anywhere, never a
//                                        signing gate, carries no
//                                        authority over this device's
//                                        own keys or sessions at all.
//
// One record per (identityId, deviceIdentityId) PAIR — never merely
// per identityId — because the whole point is distinguishing MULTIPLE
// devices under the same parent identity from one another (see
// docs/Roadmap.md, 0.2.78's own security flagship: Device A and Device
// B both legitimately authorized, Device C is not).
//
// `grant`/`revocation` are each either null or the EXACT signed record
// (core/DeviceAuthorizationEnvelope.js's own JSON shape, including its
// `signature`) this device received and independently verified — this
// class is its own evidence, never a re-derived summary of one,
// mirroring core/RemoteIdentityLifecycle.js's own discipline exactly.
//
// Unlike an identity's own permanent, one-way revocation, `isAuthorized`
// is a TIMESTAMP COMPARISON, not a one-way latch — see core/
// DeviceAuthorizationEnvelope.js's own header on why a device
// authorization can be re-granted after being revoked, while an
// identity revocation never can.
export class DeviceAuthority {
    constructor({ identityId, deviceIdentityId, devicePublicKey = null, deviceLabel = null, grant = null, revocation = null, updatedAt = new Date() } = {}) {
        if (!identityId || typeof identityId !== 'string') {
            throw new Error('DeviceAuthority: identityId is required');
        }
        if (!deviceIdentityId || typeof deviceIdentityId !== 'string') {
            throw new Error('DeviceAuthority: deviceIdentityId is required');
        }
        this._identityId = identityId;
        this._deviceIdentityId = deviceIdentityId;
        this._devicePublicKey = devicePublicKey || null;
        this._deviceLabel = deviceLabel || null;
        this._grant = grant || null;
        this._revocation = revocation || null;
        this._updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
    }

    get identityId() { return this._identityId; }
    get deviceIdentityId() { return this._deviceIdentityId; }
    get devicePublicKey() { return this._devicePublicKey; }
    get deviceLabel() { return this._deviceLabel; }
    get grant() { return this._grant; }
    get revocation() { return this._revocation; }
    get updatedAt() { return this._updatedAt; }

    // Authorized right now iff a grant is on file AND either there is
    // no revocation at all, or the grant is STRICTLY newer than the
    // most recent revocation this device has seen — see this file's
    // own header on why re-granting after a revocation is meaningful,
    // unlike identity revocation's own permanent latch.
    get isAuthorized() {
        if (!this._grant) {
            return false;
        }
        if (!this._revocation) {
            return true;
        }
        return new Date(this._grant.authorizedAt).getTime() > new Date(this._revocation.revokedAt).getTime();
    }

    withGrant(record, updatedAt = new Date()) {
        return new DeviceAuthority({
            identityId: this._identityId,
            deviceIdentityId: this._deviceIdentityId,
            devicePublicKey: record.devicePublicKey || this._devicePublicKey,
            deviceLabel: record.deviceLabel !== undefined ? record.deviceLabel : this._deviceLabel,
            grant: record,
            revocation: this._revocation,
            updatedAt
        });
    }

    withRevocation(record, updatedAt = new Date()) {
        return new DeviceAuthority({
            identityId: this._identityId,
            deviceIdentityId: this._deviceIdentityId,
            devicePublicKey: this._devicePublicKey,
            deviceLabel: this._deviceLabel,
            grant: this._grant,
            revocation: record,
            updatedAt
        });
    }

    toJSON() {
        return {
            identityId: this._identityId,
            deviceIdentityId: this._deviceIdentityId,
            devicePublicKey: this._devicePublicKey,
            deviceLabel: this._deviceLabel,
            grant: this._grant,
            revocation: this._revocation,
            updatedAt: this._updatedAt.toISOString()
        };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        return new DeviceAuthority(json);
    }
}
