import { LocalAuthorizationVerifier } from './LocalAuthorizationVerifier.js';

// The signed lifecycle records an exported identity carries with its key:
// its revocation, its successor declaration and the device grants it made.
// Without them, importing a revoked identity after this browser's data was
// cleared would show it as active again on this device.
//
// Every record is signed by the identity itself, so on import each one is
// verified and must name the identity being imported; anything else is
// dropped. Nothing here needs the passphrase.

// { revocation, succession, deviceAuthorizations } with only what exists,
// or null when there is nothing to carry.
export function buildLifecycleRecords({ revocation = null, succession = null, deviceAuthorizations = [] } = {}) {
    const lifecycle = {};
    if (revocation) lifecycle.revocation = revocation;
    if (succession) lifecycle.succession = succession;
    if (Array.isArray(deviceAuthorizations) && deviceAuthorizations.length > 0) lifecycle.deviceAuthorizations = deviceAuthorizations;
    return Object.keys(lifecycle).length > 0 ? lifecycle : null;
}

// The records in `lifecycle` that verify and belong to identityId, in the
// same shape; untrusted input never throws.
export function verifiedLifecycleRecords(identityId, lifecycle, verifier = new LocalAuthorizationVerifier()) {
    const result = { revocation: null, succession: null, deviceAuthorizations: [] };
    if (!lifecycle || typeof lifecycle !== 'object') return result;
    const valid = (check) => {
        try { return check().valid === true; } catch { return false; }
    };
    const { revocation, succession, deviceAuthorizations } = lifecycle;
    if (revocation && revocation.identityId === identityId && valid(() => verifier.verifyIdentityRevocation(revocation))) {
        result.revocation = revocation;
    }
    if (succession && succession.predecessorIdentityId === identityId && valid(() => verifier.verifyIdentitySuccession(succession))) {
        result.succession = succession;
    }
    for (const entry of Array.isArray(deviceAuthorizations) ? deviceAuthorizations : []) {
        if (!entry || typeof entry !== 'object') continue;
        const { deviceIdentityId, grant, revocation: deviceRevocation } = entry;
        if (!grant || grant.identityId !== identityId || grant.deviceIdentityId !== deviceIdentityId
            || !valid(() => verifier.verifyDeviceAuthorizationGrant(grant))) {
            continue;
        }
        const revocationValid = deviceRevocation && deviceRevocation.identityId === identityId
            && deviceRevocation.deviceIdentityId === deviceIdentityId
            && valid(() => verifier.verifyDeviceAuthorizationRevocation(deviceRevocation));
        result.deviceAuthorizations.push({ deviceIdentityId, grant, revocation: revocationValid ? deviceRevocation : null });
    }
    return result;
}

// This device's device-authorization list with `restored` merged in: for
// each device the later grant and the later revocation win, the same
// timestamp rule deciding whether a device is authorized.
export function mergeDeviceAuthorizations(local, restored) {
    const merged = (Array.isArray(local) ? local : []).map((entry) => ({ ...entry }));
    for (const entry of restored) {
        const existing = merged.find((candidate) => candidate.deviceIdentityId === entry.deviceIdentityId);
        if (!existing) {
            merged.push({ ...entry });
            continue;
        }
        if (later(entry.grant, existing.grant, 'authorizedAt')) existing.grant = entry.grant;
        if (entry.revocation && later(entry.revocation, existing.revocation, 'revokedAt')) existing.revocation = entry.revocation;
    }
    return merged;
}

function later(candidate, current, field) {
    if (!current) return true;
    return new Date(candidate[field]).getTime() > new Date(current[field]).getTime();
}
