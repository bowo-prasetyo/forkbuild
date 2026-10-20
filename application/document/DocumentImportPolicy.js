import { DocumentSealStatus } from '../../identity/DocumentSealing.js';
import { resolveSigningIdentityId } from '../../identity/resolveSigningIdentityId.js';

// What Import does with a build file, decided from who the file says made
// it, whether its seal holds (core/document/DocumentSeal.js), and its license.
//
//   OWN          no maker named, or one of this device's own identities,
//                or a build that credits one of them as having built it
//                with its maker (Build with me saves such a build on each
//                friend's device): it opens as the same build, as it always
//                has, so a player can move their own builds between devices.
//   COPY         someone else's build whose license allows remixes: it
//                opens as the importer's own copy, credited to its maker
//                and recording the build it came from, exactly like Edit a
//                Copy.
//   NOT_ALLOWED  someone else's build whose license doesn't allow copies
//                (All Rights Reserved, CC BY-ND or none): Import refuses.
//   ALTERED      someone else's build whose seal doesn't hold, so the name
//                and terms in it can't be trusted: Import refuses.
//
// An unsealed file (one exported before seals, or by someone who wasn't
// signed in) is taken at its word: the maker and terms it names are
// respected, since they're all there is to go on.
export const DocumentImportOutcome = Object.freeze({
    OWN: 'own',
    COPY: 'copy',
    NOT_ALLOWED: 'not-allowed',
    ALTERED: 'altered'
});

export function decideDocumentImport({ authorIdentityId = null, license = null, sealStatus = DocumentSealStatus.NONE, ownIdentityIds = [], builtWith = [] } = {}) {
    if (!authorIdentityId || ownIdentityIds.includes(authorIdentityId)) {
        return DocumentImportOutcome.OWN;
    }
    if (sealStatus !== DocumentSealStatus.BROKEN && builtWith.some((entry) => entry?.identityId && ownIdentityIds.includes(entry.identityId))) {
        return DocumentImportOutcome.OWN;
    }
    if (sealStatus === DocumentSealStatus.BROKEN) {
        return DocumentImportOutcome.ALTERED;
    }
    return license && license.forkAllowed ? DocumentImportOutcome.COPY : DocumentImportOutcome.NOT_ALLOWED;
}

// The identities a build counts as this player's own: every identity this
// device holds a key for, the one signing now, and any `extra` the caller
// knows of (the identity an authorized device acts for).
export function ownIdentityIdsOf(identityProvider, extra = []) {
    const ids = new Set((Array.isArray(extra) ? extra : []).filter(Boolean));
    try {
        for (const identity of identityProvider?.listLocalIdentities?.() || []) {
            if (identity?.identityId) ids.add(identity.identityId);
        }
    } catch {
        // No identity storage: only the signing identity, if any, counts.
    }
    const signing = resolveSigningIdentityId(identityProvider);
    if (signing) ids.add(signing);
    return [...ids];
}

// Thrown by Import when a file may not be opened as the importer's build.
// `outcome` is NOT_ALLOWED or ALTERED; `author` is the maker's name the
// file gives, if any.
export class DocumentImportRefusedError extends Error {
    constructor(outcome, author = null) {
        super(outcome === DocumentImportOutcome.ALTERED
            ? 'This build was changed after its maker sealed it, so it can\'t be imported.'
            : 'This build\'s maker hasn\'t allowed copies, so it can\'t be imported as your build.');
        this.name = 'DocumentImportRefusedError';
        this.outcome = outcome;
        this.author = author;
    }
}
