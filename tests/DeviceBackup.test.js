import { DeviceBackupUseCase, RestoreMode, describeBackupEntries } from '../application/backup/DeviceBackupUseCase.js';
import { BackupEntryGroup, backupEntryGroupOf } from '../application/backup/BackupEntryGroups.js';
import {
    BackupFileError, IncorrectBackupPassphraseError, decodeDeviceBackup, encodeDeviceBackup
} from '../application/backup/DeviceBackupFile.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Few iterations keep the test fast; the format records the count it used.
const ITERATIONS = 1000;
const DOC_A = '11111111-1111-4111-8111-111111111111';
const DOC_B = '22222222-2222-4222-8222-222222222222';

function deviceWithData() {
    const storage = new InMemoryStorageProvider();
    storage.save(DOC_A, { world: 'a' });
    storage.save('forkbuild-index', [{ id: DOC_A, title: 'A' }]);
    storage.save('recovery:' + DOC_A, { checkpoint: true });
    storage.save('local-session', { identityId: 'did:key:z6Mk-session' });
    storage.save('personal-structure:s1', { name: 'Tower' });
    storage.save('turn-server-configuration', { urls: ['turn:x'], username: 'u', credential: 'secret-credential' });
    storage.save('forkbuild-publications', [{ id: 'pub-1', contentHash: 'own-hash' }]);
    storage.save('snapshot:pub-1', { world: 'a' });
    storage.save('content:own-hash', 'own content');
    storage.save('content:other-hash', 'someone else\'s content');
    storage.save('conversation-history:did:key:me', [{ text: 'hi' }]);
    storage.save('announcement-index:snapshot:x', []);
    return storage;
}

async function run() {
    // --- grouping -----------------------------------------------------
    assert(backupEntryGroupOf(DOC_A) === BackupEntryGroup.DOCUMENTS, 'a UUID name is a saved document');
    assert(backupEntryGroupOf('local-identity-key:did:key:z6Mk') === BackupEntryGroup.IDENTITIES, 'identity keys are identities');
    assert(backupEntryGroupOf('placement-record:p') === BackupEntryGroup.DOWNLOADED, 'placement records are downloaded data');
    assert(backupEntryGroupOf('local-session') === null, 'the session is never backed up or restored');
    assert(backupEntryGroupOf('some-future-store:x') === null, 'an unknown name has no group');
    assert(backupEntryGroupOf('follows:') === null, 'a bare prefix is not an entry');
    console.log('✓ entries are grouped by what they hold');

    // --- collect --------------------------------------------------------
    const source = deviceWithData();
    source.save('some-future-store:x', { kept: true });
    const backup = new DeviceBackupUseCase({ storageProvider: source });
    const collected = await backup.collect();
    assert(!('local-session' in collected.entries), 'the session is left out');
    assert(collected.entries['content:own-hash'] === 'own content', 'content of your own publications is always kept');
    assert(!('content:other-hash' in collected.entries), 'other people\'s content is left out by default');
    assert(collected.leftOutContentCount === 1, 'the left-out content is counted');
    assert(collected.entries['some-future-store:x'], 'unknown entries are backed up for a newer version to restore');
    assert(collected.groups[BackupEntryGroup.OTHER] === 1, 'unknown entries count as other');
    assert(collected.groups[BackupEntryGroup.DOCUMENTS] === 3, 'document, index and recovery checkpoint count as documents');
    const withDownloads = await backup.collect({ includeDownloadedContent: true });
    assert(withDownloads.entries['content:other-hash'], 'other people\'s content is kept when asked for');
    console.log('✓ collect keeps everything but the session and, unless asked, other people\'s content');

    // --- file format ------------------------------------------------------
    const { bytes, groups } = await backup.createBackupFile({ passphrase: 'correct horse', iterations: ITERATIONS });
    const asText = new TextDecoder().decode(bytes);
    assert(asText.startsWith('FORKBUILD-BACKUP\n'), 'the file starts with its magic line');
    assert(!asText.includes('secret-credential') && !asText.includes('Tower'), 'nothing stored is readable in the file');
    assert(groups[BackupEntryGroup.SETTINGS] === 1, 'createBackupFile reports what it holds');

    let error = null;
    try { await decodeDeviceBackup(bytes, 'wrong passphrase'); } catch (e) { error = e; }
    assert(error instanceof IncorrectBackupPassphraseError, 'a wrong passphrase is refused');

    const tampered = bytes.slice();
    tampered[tampered.length - 1] ^= 1;
    error = null;
    try { await decodeDeviceBackup(tampered, 'correct horse'); } catch (e) { error = e; }
    assert(error instanceof IncorrectBackupPassphraseError, 'a changed ciphertext is refused');

    error = null;
    try {
        const headerEnd = bytes.indexOf(0x0a, bytes.indexOf(0x0a) + 1) + 1;
        const newHeader = new TextEncoder().encode(new TextDecoder().decode(bytes.subarray(0, headerEnd)).replace(`"iterations":${ITERATIONS}`, `"iterations":${ITERATIONS + 1}`));
        const changed = new Uint8Array(newHeader.length + bytes.length - headerEnd);
        changed.set(newHeader, 0);
        changed.set(bytes.subarray(headerEnd), newHeader.length);
        await decodeDeviceBackup(changed, 'correct horse');
    } catch (e) { error = e; }
    assert(error instanceof IncorrectBackupPassphraseError, 'a changed header is refused');

    error = null;
    try { await decodeDeviceBackup(new TextEncoder().encode('{"formatVersion":2}'), 'x'); } catch (e) { error = e; }
    assert(error instanceof BackupFileError, 'a file that is not a backup is refused');

    error = null;
    try { await encodeDeviceBackup({ entries: {}, passphrase: '' }); } catch (e) { error = e; }
    assert(error instanceof BackupFileError, 'a backup needs a passphrase');

    const read = await backup.readBackupFile(bytes, 'correct horse');
    assert(read.entries[DOC_A].world === 'a', 'the entries come back');
    assert(typeof read.createdAt === 'string', 'the backup records when it was made');
    assert(JSON.stringify(read.groups) === JSON.stringify(describeBackupEntries(read.entries)), 'reading reports what the file holds');
    console.log('✓ the backup file is encrypted and authenticated, header included');

    // --- restore: replace -------------------------------------------------
    const target = new InMemoryStorageProvider();
    target.save('forkbuild-index', [{ id: DOC_B, title: 'B' }]);
    target.save(DOC_B, { world: 'b' });
    target.save('local-session', { identityId: 'did:key:z6Mk-other' });
    let flushed = 0;
    const replacing = new DeviceBackupUseCase({ storageProvider: target, flush: async () => { flushed++; } });
    const replaced = await replacing.restore(read.entries, { mode: RestoreMode.REPLACE });
    assert(target.load(DOC_B) === null, 'replace deletes what the device had');
    assert(target.load('local-session') === null, 'replace logs the device out');
    assert(target.load(DOC_A).world === 'a', 'replace writes the backup');
    assert(target.load('some-future-store:x') === null, 'unknown entries are not restored');
    assert(replaced.skipped === 1 && replaced.written === Object.keys(read.entries).length - 1, 'restore reports written and skipped entries');
    assert(flushed === 1, 'restore waits for storage to be written');
    console.log('✓ replace restores the backup onto an emptied device');

    // --- restore: merge -----------------------------------------------------
    const merging = new InMemoryStorageProvider();
    merging.save('forkbuild-index', [{ id: DOC_B, title: 'B' }, { id: DOC_A, title: 'A, edited here' }]);
    merging.save(DOC_B, { world: 'b' });
    merging.save(DOC_A, { world: 'a edited here' });
    merging.save('turn-server-configuration', { urls: ['turn:mine'], username: 'm', credential: 'mine' });
    merging.save('forkbuild-publications', [{ id: 'pub-2', contentHash: 'h2' }]);
    const merged = await new DeviceBackupUseCase({ storageProvider: merging }).restore(read.entries, { mode: RestoreMode.MERGE });
    const index = merging.load('forkbuild-index');
    assert(index.length === 2 && index.find((e) => e.id === DOC_A).title === 'A, edited here', 'merge keeps this device\'s document and index entry');
    assert(merging.load(DOC_A).world === 'a edited here', 'merge never overwrites an entry this device has');
    assert(merging.load('turn-server-configuration').credential === 'mine', 'merge keeps this device\'s settings');
    assert(merging.load('personal-structure:s1').name === 'Tower', 'merge adds what this device doesn\'t have');
    assert(merging.load('forkbuild-publications').map((p) => p.id).sort().join() === 'pub-1,pub-2', 'merge combines your publications');
    assert(merged.kept >= 2, 'merge reports the entries it kept');

    const missingIndexEntry = new InMemoryStorageProvider();
    missingIndexEntry.save('forkbuild-index', [{ id: DOC_B, title: 'B' }]);
    await new DeviceBackupUseCase({ storageProvider: missingIndexEntry }).restore(read.entries, { mode: RestoreMode.MERGE });
    assert(missingIndexEntry.load('forkbuild-index').map((e) => e.id).sort().join() === [DOC_A, DOC_B].sort().join(),
        'a restored document is added to this device\'s document list');
    console.log('✓ merge adds missing entries and combines index lists');

    // --- identities survive the round trip ---------------------------------
    const identityStorage = new InMemoryStorageProvider();
    const provider = new LocalIdentityProvider(identityStorage, { pbkdf2Iterations: ITERATIONS });
    const identity = await provider.createProtectedLocalIdentity('Alice', 'alice passphrase');
    const identityBackup = await new DeviceBackupUseCase({ storageProvider: identityStorage }).createBackupFile({ passphrase: 'backup passphrase', iterations: ITERATIONS });
    const freshDevice = new InMemoryStorageProvider();
    const freshBackup = new DeviceBackupUseCase({ storageProvider: freshDevice });
    const { entries } = await freshBackup.readBackupFile(identityBackup.bytes, 'backup passphrase');
    await freshBackup.restore(entries, { mode: RestoreMode.REPLACE });
    const restoredProvider = new LocalIdentityProvider(freshDevice, { pbkdf2Iterations: ITERATIONS });
    assert(restoredProvider.getLocalIdentity(identity.identityId), 'the identity is back on the new device');
    await restoredProvider.unlock(identity.identityId, 'alice passphrase');
    assert(restoredProvider.isUnlocked(identity.identityId), 'and unlocks with its own passphrase');
    console.log('✓ a restored identity unlocks with its own passphrase');
}

await run();
