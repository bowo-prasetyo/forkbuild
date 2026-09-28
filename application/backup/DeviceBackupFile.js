// The device backup file: every storage entry, compressed and encrypted
// with a passphrase. A backup can hold private keys stored without a
// passphrase and a TURN credential, so it is never written in the clear.
//
// Layout: the magic line, one line of JSON header (key derivation and
// cipher parameters), then the AES-GCM ciphertext as raw bytes. The header
// is the cipher's additional data, so changing any parameter in it makes
// decryption fail rather than run with other settings. The plaintext is
// gzip-compressed JSON: { formatVersion, createdAt, entries: { name: value } }.
//
// WebCrypto encrypts in one call, so the whole backup is held in memory
// while it is built or read.

export const BACKUP_FILE_MAGIC = 'FORKBUILD-BACKUP';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_FILE_EXTENSION = '.forkbuild-backup';
export const DEFAULT_BACKUP_ITERATIONS = 600000;
// A file states its own iteration count; above this it is refused rather
// than run, so a crafted file cannot make a restore hang.
export const MAX_BACKUP_ITERATIONS = 10000000;

const KDF = 'PBKDF2-SHA256';
const CIPHER = 'AES-256-GCM';
const COMPRESSION = 'gzip';
const SALT_LENGTH = 16;
const NONCE_LENGTH = 12;
const NEWLINE = 0x0a;

export class BackupFileError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BackupFileError';
    }
}

export class IncorrectBackupPassphraseError extends Error {
    constructor() {
        super('Wrong passphrase, or the backup file is damaged.');
        this.name = 'IncorrectBackupPassphraseError';
    }
}

// Resolves to the file's bytes. `entries` maps storage names to JSON-safe values.
export async function encodeDeviceBackup({ entries, passphrase, createdAt = new Date(), iterations = DEFAULT_BACKUP_ITERATIONS }) {
    if (!passphrase || typeof passphrase !== 'string') {
        throw new BackupFileError('A passphrase is required to protect the backup.');
    }
    const salt = randomBytes(SALT_LENGTH);
    const nonce = randomBytes(NONCE_LENGTH);
    const header = { formatVersion: BACKUP_FORMAT_VERSION, kdf: KDF, iterations, cipher: CIPHER, compression: COMPRESSION, salt: toHex(salt), nonce: toHex(nonce) };
    const headerBytes = utf8(`${BACKUP_FILE_MAGIC}\n${JSON.stringify(header)}\n`);
    const payload = { formatVersion: BACKUP_FORMAT_VERSION, createdAt: new Date(createdAt).toISOString(), entries };
    const plaintext = await gzip(utf8(JSON.stringify(payload)));
    const key = await deriveKey(passphrase, salt, iterations, 'encrypt');
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: headerBytes }, key, plaintext));
    const file = new Uint8Array(headerBytes.length + ciphertext.length);
    file.set(headerBytes, 0);
    file.set(ciphertext, headerBytes.length);
    return file;
}

// Resolves to { createdAt, entries }. Rejects with BackupFileError for a
// file that is not a ForkBuild backup (or is from a newer version), and
// with IncorrectBackupPassphraseError for a wrong passphrase or damaged file.
export async function decodeDeviceBackup(bytes, passphrase) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const magicEnd = data.indexOf(NEWLINE);
    if (magicEnd === -1 || text(data.subarray(0, magicEnd)) !== BACKUP_FILE_MAGIC) {
        throw new BackupFileError('This is not a ForkBuild backup file.');
    }
    const headerEnd = data.indexOf(NEWLINE, magicEnd + 1);
    if (headerEnd === -1) {
        throw new BackupFileError('The backup file is damaged.');
    }
    let header;
    try {
        header = JSON.parse(text(data.subarray(magicEnd + 1, headerEnd)));
    } catch {
        throw new BackupFileError('The backup file is damaged.');
    }
    if (!header || typeof header !== 'object' || header.formatVersion !== BACKUP_FORMAT_VERSION) {
        throw new BackupFileError('This backup was made by a newer version of ForkBuild. Update this copy first.');
    }
    if (header.kdf !== KDF || header.cipher !== CIPHER || header.compression !== COMPRESSION
        || !Number.isInteger(header.iterations) || header.iterations < 1 || header.iterations > MAX_BACKUP_ITERATIONS) {
        throw new BackupFileError('The backup file is damaged.');
    }
    if (!passphrase || typeof passphrase !== 'string') {
        throw new IncorrectBackupPassphraseError();
    }
    const salt = fromHex(header.salt);
    const nonce = fromHex(header.nonce);
    const key = await deriveKey(passphrase, salt, header.iterations, 'decrypt');
    let plaintext;
    try {
        plaintext = new Uint8Array(await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: nonce, additionalData: data.subarray(0, headerEnd + 1) }, key, data.subarray(headerEnd + 1)
        ));
    } catch {
        throw new IncorrectBackupPassphraseError();
    }
    let payload;
    try {
        payload = JSON.parse(text(await gunzip(plaintext)));
    } catch {
        throw new BackupFileError('The backup file is damaged.');
    }
    if (!payload || typeof payload !== 'object' || !payload.entries || typeof payload.entries !== 'object' || Array.isArray(payload.entries)) {
        throw new BackupFileError('The backup file is damaged.');
    }
    return { createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : null, entries: payload.entries };
}

async function deriveKey(passphrase, salt, iterations, usage) {
    const material = await crypto.subtle.importKey('raw', utf8(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        [usage]
    );
}

async function gzip(bytes) {
    return pipeThrough(bytes, new CompressionStream('gzip'));
}

async function gunzip(bytes) {
    return pipeThrough(bytes, new DecompressionStream('gzip'));
}

async function pipeThrough(bytes, transform) {
    const stream = new Blob([bytes]).stream().pipeThrough(transform);
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function randomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
}

function utf8(value) {
    return new TextEncoder().encode(value);
}

function text(bytes) {
    return new TextDecoder().decode(bytes);
}

function toHex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
    if (typeof hex !== 'string' || hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
        throw new BackupFileError('The backup file is damaged.');
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}
