import { Publication } from '../../../publisher/Publication.js';
import { ContentReference } from '../../../core/ContentReference.js';
import { WorldEncounterKind } from '../../../core/WorldEncounter.js';
import { message } from '../../../core/Message.js';
import { DocumentSerializer } from '../../../serializer/DocumentSerializer.js';
import { verifyWorldEncounterMaterial, WorldEncounterMaterialVerificationStatus } from '../../worldEncounter/WorldEncounterMaterialVerification.js';
import { decodePublicationLinkPayload } from './PublicationLinkPayload.js';

// A build shown on another site (ui/embed/): the link-only payload it carries
// (PublicationLinkPayload.js) is checked as opening the link checks it
// (application/publication/OpenPublicationLink.js), its signature with the
// same verifier and its build against the hash it signed, but nothing is kept:
// an embed only shows the build, and stores and admits nothing on the reader's
// device.

export const EmbeddedBuildOutcome = Object.freeze({
    OPENED: 'opened',
    INVALID_LINK: 'invalid-link',
    NOT_VERIFIED: 'not-verified',
    BUILD_MISMATCH: 'build-mismatch'
});

const Outcome = EmbeddedBuildOutcome;

// `{ outcome, publication, document, message }`: on OPENED the verified
// Publication and its build as a Document; otherwise `message` (a
// descriptor, core/Message.js) says why it can't be shown. Never rejects.
export async function openEmbeddedBuild({ payload, verifier, documentSerializer = new DocumentSerializer() }) {
    let linkOnly = null;
    try {
        linkOnly = await decodePublicationLinkPayload(payload);
    } catch {
        // Reported just below.
    }
    if (!linkOnly) return failure(Outcome.INVALID_LINK, 'embed.invalid');

    let publication = null;
    try {
        publication = Publication.fromJSON(linkOnly.claim);
    } catch {
        // Reported just below.
    }
    if (!publication || !publication.id || !publication.documentId || !publication.contentHash) {
        return failure(Outcome.INVALID_LINK, 'embed.invalid');
    }

    let verification = null;
    try {
        verification = await verifyWorldEncounterMaterial({
            resolvedSelection: Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id, origin: 'dweb:link:embed' }),
            material: publication,
            verifier
        });
    } catch {
        // Not verified.
    }
    if (verification?.status !== WorldEncounterMaterialVerificationStatus.VERIFIED) {
        return failure(Outcome.NOT_VERIFIED, 'embed.notVerified');
    }

    const hash = publication.contentReference?.hash ?? publication.contentHash;
    let document = null;
    try {
        if (new ContentReference({ hash }).verify(linkOnly.snapshotText)) {
            document = documentSerializer.deserialize(JSON.parse(linkOnly.snapshotText));
        }
    } catch {
        document = null;
    }
    if (!document) return failure(Outcome.BUILD_MISMATCH, 'embed.mismatch');
    return Object.freeze({ outcome: Outcome.OPENED, publication, document, message: null });
}

function failure(outcome, key) {
    return Object.freeze({ outcome, publication: null, document: null, message: message(key) });
}
