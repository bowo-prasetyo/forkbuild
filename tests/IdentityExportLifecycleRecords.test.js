import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { verifiedLifecycleRecords } from '../identity/IdentityLifecycleTransfer.js';
import * as Ed25519 from '../identity/Ed25519.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// An exported identity carries its signed revocation, successor and device
// grants, so importing it after this browser's data was cleared restores
// them instead of showing a revoked identity as active.

const ITERATIONS = 1000;
const PASSPHRASE = 'alice passphrase';

function newDevice() {
    return new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: ITERATIONS });
}

function otherDidKey() {
    const { publicKey } = Ed25519.seedToKeyPair(Ed25519.randomSeed());
    return { identityId: Ed25519.publicKeyToDidKey(publicKey), publicKey: Ed25519.bytesToHex(publicKey) };
}

async function run() {
    // --- an identity with nothing to carry exports as before ------------------
    {
        const device = newDevice();
        const plain = await device.createProtectedLocalIdentity('Plain', PASSPHRASE);
        const pkg = await device.exportLocalIdentity(plain.identityId, PASSPHRASE);
        assert(!('lifecycle' in pkg), 'an identity with no lifecycle records exports no lifecycle section');
        const result = await newDevice().importLocalIdentity(pkg, PASSPHRASE);
        assert(result.status === 'IMPORTED' && !result.restoredLifecycle.revocation, 'and imports as before');
    }

    // --- revoked identity with a successor and device grants -----------------
    const alice = newDevice();
    const identity = await alice.createProtectedLocalIdentity('Alice', PASSPHRASE);
    await alice.unlock(identity.identityId, PASSPHRASE);
    const laptop = otherDidKey();
    const phone = otherDidKey();
    const successor = otherDidKey();
    alice.authorizeDevice(identity.identityId, laptop.identityId, laptop.publicKey, { deviceLabel: 'Laptop' });
    alice.authorizeDevice(identity.identityId, phone.identityId, phone.publicKey, { deviceLabel: 'Phone' });
    alice.revokeDeviceAuthorization(identity.identityId, phone.identityId);
    alice.revokeIdentity(identity.identityId, { successorIdentityId: successor.identityId });

    const pkg = await alice.exportLocalIdentity(identity.identityId, PASSPHRASE);
    assert(pkg.lifecycle.revocation && pkg.lifecycle.succession && pkg.lifecycle.deviceAuthorizations.length === 2,
        'the export carries the revocation, successor and device grants');

    const restoredDevice = newDevice();
    const result = await restoredDevice.importLocalIdentity(JSON.parse(JSON.stringify(pkg)), PASSPHRASE);
    assert(result.status === 'IMPORTED', 'the identity imports');
    assert(result.restoredLifecycle.revocation && result.restoredLifecycle.succession && result.restoredLifecycle.deviceAuthorizations === 2,
        'the import reports what it restored');
    assert(restoredDevice.isRevoked(identity.identityId), 'the imported identity is revoked, not active again');
    assert(result.identity.isRevoked, 'the returned identity shows it');
    assert(restoredDevice.getLocalIdentity(identity.identityId).successorIdentityId === successor.identityId, 'its successor is restored');
    assert(restoredDevice.isDeviceAuthorized(identity.identityId, laptop.identityId) === false,
        'a revoked identity vouches for no device, as on the original');
    const devices = restoredDevice.listDeviceAuthorizations(identity.identityId);
    assert(devices.length === 2 && devices.find((d) => d.deviceIdentityId === phone.identityId).isAuthorized === false,
        'device grants and their revocations are restored');
    let refused = null;
    await restoredDevice.unlock(identity.identityId, PASSPHRASE);
    restoredDevice.authenticate(identity.identityId);
    try { restoredDevice.signCanonical({ type: 'test', payload: {} }); } catch (e) { refused = e; }
    assert(refused, 'the restored revocation stops the identity from signing');
    console.log('✓ a revoked identity comes back revoked, with its successor and device grants');

    // --- importing onto a device that already has the identity ----------------
    {
        const earlier = newDevice();
        const fresh = await alice.exportLocalIdentity(identity.identityId, PASSPHRASE);
        const withoutLifecycle = { ...fresh };
        delete withoutLifecycle.lifecycle;
        await earlier.importLocalIdentity(withoutLifecycle, PASSPHRASE);
        assert(!earlier.isRevoked(identity.identityId), 'an older export brings the identity back unrevoked');
        const again = await earlier.importLocalIdentity(fresh, 'any passphrase at all');
        assert(again.status === 'ALREADY_EXISTS' && again.restoredLifecycle.revocation, 'a later export adds the revocation it lacks');
        assert(earlier.isRevoked(identity.identityId), 'and the identity is now revoked there too');
        const third = await earlier.importLocalIdentity(fresh, 'any passphrase at all');
        assert(!third.restoredLifecycle.revocation && third.restoredLifecycle.deviceAuthorizations === 0, 'importing it again restores nothing new');
    }
    console.log('✓ importing an identity already here adds only the records it lacks');

    // --- forged or misdirected records are dropped ------------------------------
    {
        const forged = JSON.parse(JSON.stringify(pkg.lifecycle));
        forged.revocation.reason = 'changed after signing';
        forged.succession.successorIdentityId = otherDidKey().identityId;
        forged.deviceAuthorizations[0].grant.deviceLabel = 'Changed';
        const verified = verifiedLifecycleRecords(identity.identityId, forged);
        assert(!verified.revocation && !verified.succession, 'a changed revocation or successor declaration is dropped');
        assert(verified.deviceAuthorizations.length === 1, 'a changed device grant is dropped');
        const someoneElse = verifiedLifecycleRecords(otherDidKey().identityId, pkg.lifecycle);
        assert(!someoneElse.revocation && someoneElse.deviceAuthorizations.length === 0, 'records for another identity are dropped');
        assert(verifiedLifecycleRecords(identity.identityId, 'nonsense').deviceAuthorizations.length === 0, 'junk is ignored');

        const tampered = JSON.parse(JSON.stringify(pkg));
        tampered.lifecycle = forged;
        const target = newDevice();
        const outcome = await target.importLocalIdentity(tampered, PASSPHRASE);
        assert(outcome.status === 'IMPORTED' && !target.isRevoked(identity.identityId) && !outcome.restoredLifecycle.revocation,
            'a forged revocation is not stored');
    }
    console.log('✓ lifecycle records that do not verify are dropped');
}

await run();
