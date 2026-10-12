import { MAX_BUILD_NOTE_PAYLOAD_LENGTH, buildNoteTemplate } from '../../core/BuildNote.js';
import { normalizeBuildTags } from '../../core/BuildTags.js';

// Sends a just-published build to everyone: a build note (core/BuildNote.js)
// carrying its signed claim, its bytes and its publisher's signed placement,
// to every Nostr relay this device reads, signed with this device's carrier
// key (nostr/AppNostrSigner.js). Needs no wallet, extension or account.

export const BuildNoteSendOutcome = Object.freeze({
    SENT: 'sent',
    UNSIGNED: 'unsigned',
    NO_BUILD: 'no-build',
    TOO_LARGE: 'too-large',
    FAILED: 'failed'
});

export class PublishBuildNoteUseCase {
    // `readBuildText(publication)` resolves to the build as text, or null;
    // `encodePayload({ claim, snapshotText })` to a link payload
    // (application/publication/sharing/PublicationLinkPayload.js);
    // `publishToRelay(relayUrl, template)` to `{ published }`;
    // `relayUrls()` lists the relays; `placementClaimFor(publication)` gives
    // `{ placementRecord }` when this device holds its publisher's placement.
    constructor({ readBuildText, encodePayload, publishToRelay, relayUrls, placementClaimFor = () => ({}) }) {
        this._readBuildText = readBuildText;
        this._encodePayload = encodePayload;
        this._publishToRelay = publishToRelay;
        this._relayUrls = relayUrls;
        this._placementClaimFor = placementClaimFor;
    }

    // Resolves to `{ outcome, sent, relays }`: `sent` is how many relays took
    // the note. Never rejects.
    async execute(publication) {
        const claim = typeof publication?.toJSON === 'function' ? publication.toJSON() : publication;
        if (!claim || !claim.id) return result(BuildNoteSendOutcome.NO_BUILD);
        if (!claim.signature || !claim.publisherIdentity) return result(BuildNoteSendOutcome.UNSIGNED);
        let snapshotText = null;
        try {
            snapshotText = await this._readBuildText(claim);
        } catch {
            snapshotText = null;
        }
        if (!snapshotText) return result(BuildNoteSendOutcome.NO_BUILD);
        let payload;
        try {
            payload = await this._encodePayload({ claim, snapshotText });
        } catch {
            return result(BuildNoteSendOutcome.FAILED);
        }
        if (typeof payload !== 'string' || payload.length > MAX_BUILD_NOTE_PAYLOAD_LENGTH) return result(BuildNoteSendOutcome.TOO_LARGE);
        let placementRecord = null;
        try {
            placementRecord = this._placementClaimFor(publication)?.placementRecord ?? null;
        } catch {
            placementRecord = null;
        }
        const template = buildNoteTemplate({ publicationId: claim.id, payload, tags: buildTagsOf(snapshotText), placementRecord });
        if (!template) return result(BuildNoteSendOutcome.FAILED);
        let relays = [];
        try {
            relays = [...(this._relayUrls() || [])];
        } catch {
            relays = [];
        }
        if (relays.length === 0) return result(BuildNoteSendOutcome.FAILED);
        // Every relay on its own: one slow or refusing relay never stops another.
        const answers = await Promise.all(relays.map(async (relayUrl) => {
            try {
                return (await this._publishToRelay(relayUrl, template))?.published === true;
            } catch {
                return false;
            }
        }));
        const sent = answers.filter(Boolean).length;
        return result(sent > 0 ? BuildNoteSendOutcome.SENT : BuildNoteSendOutcome.FAILED, { sent, relays: relays.length });
    }
}

// The tags the build itself carries, as signed: its snapshot's metadata.
export function buildTagsOf(snapshotText) {
    try {
        return normalizeBuildTags(JSON.parse(snapshotText)?.metadata?.tags);
    } catch {
        return [];
    }
}

function result(outcome, { sent = 0, relays = 0 } = {}) {
    return Object.freeze({ outcome, sent, relays });
}
