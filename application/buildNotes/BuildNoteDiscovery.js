import { buildNoteFilter, buildNoteFilterForPublication, buildNotesForPublication, latestBuildNotes } from '../../core/publication/BuildNote.js';
import { buildTagsOf } from './PublishBuildNoteUseCase.js';

// Finds the builds others sent to everyone (core/publication/BuildNote.js): asks every
// Nostr relay this device reads for build notes, all of them or one tag's (a
// week's challenge entries), and opens each new one exactly as a shared link
// is opened (application/publication/OpenPublicationLink.js), which checks
// the builder's signature and the build's content hash, keeps the build and
// admits it where the Repository, the challenge and World View look. A note's
// signed placement is then adopted, so the build stands where its publisher
// put it. A challenge entry is logged under its week's tag only when the
// build itself, as signed, carries that tag.
//
// One relay never holds up another: each is asked on its own, and one that
// fails or times out simply adds nothing.

// The most notes opened in one run; the rest wait for the next.
export const BUILD_NOTE_OPEN_LIMIT = 40;

export class BuildNoteDiscovery {
    // `queryRelay(relayUrl, filter)` resolves to events; `relayUrls()` lists
    // the relays; `verifyEvent(event)` resolves to true for a note whose Nostr
    // signature checks out;
    // `decodePayload(payload)` gives `{ claim, snapshotText }` or null;
    // `openLinkOnly({ claim, snapshotText })` opens one as a link would and
    // resolves to `{ outcome, publication }`; `openedOutcome` is the outcome
    // that means it opened; `adoptPlacement(record)` adopts a signed
    // placement; `isKnown(publicationId)` says whether this device already
    // has it; `entryLog` (application/challenge/ChallengeEntryLog.js) is
    // optional; `onOpened(publicationId)` hears of each build opened from a
    // note (application/buildNotes/FindableBuildsStore.js).
    constructor({
        queryRelay, relayUrls, verifyEvent = () => true, decodePayload, openLinkOnly, openedOutcome,
        adoptPlacement = null, isKnown = () => false, entryLog = null, openLimit = BUILD_NOTE_OPEN_LIMIT, onOpened = null
    }) {
        this._queryRelay = queryRelay;
        this._relayUrls = relayUrls;
        this._verifyEvent = verifyEvent;
        this._decodePayload = decodePayload;
        this._openLinkOnly = openLinkOnly;
        this._openedOutcome = openedOutcome;
        this._adoptPlacement = adoptPlacement;
        this._isKnown = isKnown;
        this._entryLog = entryLog;
        this._openLimit = openLimit;
        this._onOpened = onOpened;
        // Publication ids whose note didn't open: not tried again this visit.
        this._refused = new Set();
        this._running = new Map();
    }

    // Resolves to `{ admitted, known, found, pending }`: `admitted` the
    // Publications newly opened, `known` the ids of those this device already
    // had, `found` the entries newly logged under `tag`, `pending` the notes
    // left for a later run. Never rejects. Runs for the same tag share one
    // search.
    run({ tag = null } = {}) {
        const key = tag === null ? '' : tag;
        if (!this._running.has(key)) {
            const running = this._run(tag).finally(() => this._running.delete(key));
            this._running.set(key, running);
        }
        return this._running.get(key);
    }

    // The builds a short link (`#/n/<publicationId>`) may open: each
    // `{ claim, snapshotText }` a note for `publicationId` carries whose claim
    // names that Publication, newest first. Anyone can send a note under any
    // id, so the caller opens them in turn, as a link is opened, and keeps the
    // first that checks out. Resolves to [] when no relay has one or none
    // answers; never rejects.
    async findLinkOnly(publicationId) {
        const filter = buildNoteFilterForPublication(publicationId);
        if (!filter) return [];
        const notes = buildNotesForPublication(await this._verifiedEvents(filter), publicationId);
        const candidates = [];
        for (const note of notes) {
            let linkOnly = null;
            try {
                linkOnly = await this._decodePayload(note.payload);
            } catch {
                linkOnly = null;
            }
            if (linkOnly && linkOnly.claim?.id === publicationId) candidates.push(linkOnly);
        }
        return candidates;
    }

    // Every relay's answer to `filter` whose Nostr signature checks out.
    async _verifiedEvents(filter) {
        let relays = [];
        try {
            relays = [...(this._relayUrls() || [])];
        } catch {
            relays = [];
        }
        const answers = await Promise.all(relays.map(async (relayUrl) => {
            try {
                const events = await this._queryRelay(relayUrl, filter);
                return Array.isArray(events) ? events : [];
            } catch {
                return [];
            }
        }));
        const events = answers.flat();
        const verified = await Promise.all(events.map(async (event) => {
            try {
                return (await this._verifyEvent(event)) === true;
            } catch {
                return false;
            }
        }));
        return events.filter((event, index) => verified[index]);
    }

    async _run(tag) {
        const filter = buildNoteFilter({ tag });
        if (!filter) return summary();
        const notes = latestBuildNotes(await this._verifiedEvents(filter));

        const admitted = [];
        const known = [];
        let opened = 0;
        let pending = 0;
        for (const note of notes) {
            if (this._refused.has(note.publicationId)) continue;
            if (this._isKnownSafely(note.publicationId)) {
                known.push(note.publicationId);
                continue;
            }
            if (opened >= this._openLimit) {
                pending += 1;
                continue;
            }
            opened += 1;
            const publication = await this._open(note);
            if (publication) admitted.push(publication);
            else this._refused.add(note.publicationId);
        }

        let found = 0;
        if (tag !== null && this._entryLog) {
            const entryIds = [...known, ...admitted.filter((entry) => entry.tags.includes(tag)).map((entry) => entry.publication.id)];
            try {
                found = this._entryLog.add(tag, entryIds);
            } catch {
                found = 0;
            }
        }
        return summary({ admitted: admitted.map((entry) => entry.publication), known, found, pending });
    }

    _isKnownSafely(publicationId) {
        try {
            return Boolean(this._isKnown(publicationId));
        } catch {
            return false;
        }
    }

    // The Publication a note opened to, or null. The id the note names must
    // be the id the signed claim inside it carries.
    async _open(note) {
        let linkOnly = null;
        try {
            linkOnly = await this._decodePayload(note.payload);
        } catch {
            linkOnly = null;
        }
        if (!linkOnly || linkOnly.claim?.id !== note.publicationId) return null;
        let opened;
        try {
            opened = await this._openLinkOnly(linkOnly);
        } catch {
            return null;
        }
        if (!opened || opened.outcome !== this._openedOutcome || !opened.publication) return null;
        if (this._onOpened) {
            try {
                this._onOpened(note.publicationId);
            } catch {
                // Opened all the same.
            }
        }
        if (note.placementRecord && this._adoptPlacement) {
            try {
                await this._adoptPlacement(note.placementRecord);
            } catch {
                // The build still stands, at its stand-in position.
            }
        }
        return { publication: opened.publication, tags: buildTagsOf(linkOnly.snapshotText) };
    }
}

function summary({ admitted = [], known = [], found = 0, pending = 0 } = {}) {
    return Object.freeze({ admitted: Object.freeze(admitted), known: Object.freeze(known), found, pending });
}
