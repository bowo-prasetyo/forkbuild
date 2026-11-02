import { DocumentSealStatus } from '../../identity/DocumentSealing.js';
import { resolveSigningIdentityId } from '../../identity/resolveSigningIdentityId.js';

// What Import does with a build file, decided from who the file says made
// it, whether its seal holds (core/document/DocumentSeal.js), and its license.
//
//   OWN          no maker named, or one of this device's own identities,
//                or a build its maker sealed crediting one of them as
//                having built it with them (Build with me): it opens as the
//                same build, as it always has, so a player can move their
//                own builds between devices.
//   COPY         someone else's build, sealed by its maker, whose license
//                allows remixes: it opens as the importer's own copy,
//                credited to its maker and recording the build it came
//                from, exactly like Edit a Copy.
//   NOT_ALLOWED  someone else's build whose license doesn't allow copies
//                (All Rights Reserved, CC BY-ND or none): Import refuses.
//   ALTERED      someone else's build whose seal doesn't hold, so the name
//                and terms in it can't be trusted: Import refuses.
//   UNVERIFIED   someone else's build with no seal whose license says it
//                allows remixes: Import refuses, since anyone can delete a
//                seal and then write any terms into the file (2026-11-02
//                review: deleting the seal of an All Rights Reserved build
//                and writing CC0 in its place made it import as a remix).
//                Its maker's own export, or Edit a Copy on its published
//                page, still makes the credited copy.
//
// Only what can't help the importer is believed without a seal: an
// unsealed file's maker saying copies aren't allowed is respected, and a
// file naming no maker, or the importer as its maker, opens as theirs (it
// already names nobody else). Being credited under Built with is believed
// only from the maker's seal, since anyone can add their own name to an
// unsealed file's list.
export const DocumentImportOutcome = Object.freeze({
    OWN: 'own',
    COPY: 'copy',
    NOT_ALLOWED: 'not-allowed',
    ALTERED: 'altered',
    UNVERIFIED: 'unverified'
});

export function decideDocumentImport({ authorIdentityId = null, license = null, sealStatus = DocumentSealStatus.NONE, ownIdentityIds = [], builtWith = [] } = {}) {
    if (!authorIdentityId || ownIdentityIds.includes(authorIdentityId)) {
        return DocumentImportOutcome.OWN;
    }
    if (sealStatus === DocumentSealStatus.BROKEN) {
        return DocumentImportOutcome.ALTERED;
    }
    if (sealStatus === DocumentSealStatus.VALID && (Array.isArray(builtWith) ? builtWith : []).some((entry) => entry?.identityId && ownIdentityIds.includes(entry.identityId))) {
        return DocumentImportOutcome.OWN;
    }
    if (!(license && license.forkAllowed)) {
        return DocumentImportOutcome.NOT_ALLOWED;
    }
    return sealStatus === DocumentSealStatus.VALID ? DocumentImportOutcome.COPY : DocumentImportOutcome.UNVERIFIED;
}

// Whether a build Import opens as the importer's own came from a file that
// couldn't show it is theirs (core/document/DocumentMetadata.js
// #unverifiedOrigin): any OWN without the seal of the identity it names. A
// file naming no maker, or naming the importer, opens as theirs whatever is
// in it, since nothing in a file can tell a build exported while signed out
// from someone else's with its maker taken off (2026-11-02 review); the
// mark keeps that from passing as the importer's own sealed work.
export function hasUnverifiedOrigin(outcome, sealStatus) {
    return outcome === DocumentImportOutcome.OWN && sealStatus !== DocumentSealStatus.VALID;
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
// `outcome` is NOT_ALLOWED, ALTERED or UNVERIFIED; `author` is the maker's
// name the file gives, if any.
const REFUSAL_MESSAGES = Object.freeze({
    [DocumentImportOutcome.ALTERED]: 'This build was changed after its maker sealed it, so it can\'t be imported.',
    [DocumentImportOutcome.UNVERIFIED]: 'This build doesn\'t carry its maker\'s seal, so its terms can\'t be checked and it can\'t be imported as your copy.',
    [DocumentImportOutcome.NOT_ALLOWED]: 'This build\'s maker hasn\'t allowed copies, so it can\'t be imported as your build.'
});

export class DocumentImportRefusedError extends Error {
    constructor(outcome, author = null) {
        super(REFUSAL_MESSAGES[outcome] || REFUSAL_MESSAGES[DocumentImportOutcome.NOT_ALLOWED]);
        this.name = 'DocumentImportRefusedError';
        this.outcome = outcome;
        this.author = author;
    }
}
