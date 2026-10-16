import {
    getDocumentSealSigningDescriptor,
    sealedDocumentHash,
    unsignedDocumentSeal,
    DOCUMENT_SEAL_KIND
} from '../core/DocumentSeal.js';
import { resolveSigningIdentityId } from './resolveSigningIdentityId.js';
import { identityForDidKey, verifySignedDescriptor } from './DescriptorSignature.js';

// Signs and checks the seal core/DocumentSeal.js describes.

// `documentJson` with a seal signed by `identityProvider`'s identity, or
// null when that identity can't seal it: nobody is signed in, the
// identity is locked or revoked, or it isn't the build's author (a seal
// only ever says "I made this").
export function sealDocumentJson(documentJson, identityProvider) {
    const authorIdentityId = documentJson?.metadata?.authorIdentityId;
    if (!authorIdentityId || resolveSigningIdentityId(identityProvider) !== authorIdentityId) {
        return null;
    }
    // Sealed as it will be written, so the hash Import recomputes from the
    // parsed file is the same.
    const written = JSON.parse(JSON.stringify(documentJson));
    const seal = unsignedDocumentSeal(written);
    try {
        const signature = identityProvider.signCanonical(getDocumentSealSigningDescriptor(seal));
        return { ...written, seal: { ...seal, signature: signature.toJSON() } };
    } catch {
        return null;
    }
}

export const DocumentSealStatus = Object.freeze({
    // The file carries no seal.
    NONE: 'none',
    // Signed by the author the file names, over exactly this content.
    VALID: 'valid',
    // A seal that doesn't hold: the file was changed after it was sealed,
    // or the seal is malformed or not the named author's.
    BROKEN: 'broken'
});

// Whether `fileJson` (an exported document, with or without `seal`) is
// sealed by the author it names. Returns { status, reason }.
export function verifyDocumentSeal(fileJson) {
    const seal = fileJson?.seal;
    if (seal === undefined || seal === null) {
        return { status: DocumentSealStatus.NONE, reason: null };
    }
    const broken = (reason) => ({ status: DocumentSealStatus.BROKEN, reason });
    if (typeof seal !== 'object' || seal.kind !== DOCUMENT_SEAL_KIND || !seal.signature) {
        return broken('malformed seal');
    }
    const authorIdentityId = fileJson.metadata?.authorIdentityId ?? null;
    if (!authorIdentityId || seal.authorIdentityId !== authorIdentityId) {
        return broken('the seal is not the named author\'s');
    }
    if (seal.documentId !== (fileJson.world?.id ?? null)) {
        return broken('the seal is for another build');
    }
    if (seal.contentHash !== sealedDocumentHash(fileJson)) {
        return broken('the build was changed after it was sealed');
    }
    const identity = identityForDidKey(authorIdentityId);
    if (!identity) {
        return broken('unknown author identity');
    }
    const result = verifySignedDescriptor(getDocumentSealSigningDescriptor(seal), seal.signature, identity);
    return result.valid
        ? { status: DocumentSealStatus.VALID, reason: null }
        : broken(result.reason);
}
