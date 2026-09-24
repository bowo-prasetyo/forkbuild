import { createId } from '../../../core/createId.js';
import { sanitizeDistributionErrorMessage } from '../../../application/DistributionErrorMessageSanitizer.js';

// WorldEncounterCanvas methods: publication discovery and encounter commentary.
// Spread into the component's `methods`, so `this` is the component instance.
export const publicationDiscoveryMethods = {
    // The only caller of `discoveryCommand`. No-op without the command, while a
    // call is in flight, or with a blank objectId/tag. A synchronous throw
    // becomes the same plain notice as a rejection. The result is stored
    // verbatim.
    discoverPublication() {
        if (!this.discoveryCommand || this.discovering) {
            return;
        }
        const objectId = this.discoveryObjectId.trim();
        const discoveryTag = this.discoveryTag.trim();
        if (!objectId || !discoveryTag) {
            return;
        }

        this.discovering = true;
        this.discoveryError = null;
        this.discoveryRequestId += 1;
        const requestId = this.discoveryRequestId;

        Promise.resolve()
            .then(() => this.discoveryCommand({ objectId, discoveryTag }))
            .then((result) => {
                if (requestId === this.discoveryRequestId) {
                    this.discoveryResult = result;
                }
            })
            .catch((error) => {
                if (requestId === this.discoveryRequestId) {
                    console.error('Discovery failed:', error);
                    this.discoveryError = sanitizeDistributionErrorMessage(error)
                        || 'Discovery could not be completed.';
                }
            })
            .then(() => {
                if (requestId === this.discoveryRequestId) {
                    this.discovering = false;
                }
            });
    },
    // The only writer of `selectedDiscoveredPublication`: stores the current
    // `discoveryResult` itself, re-checking isDiscoveredPublicationSelectable
    // rather than trusting the template.
    selectDiscoveredPublication() {
        if (!this.isDiscoveredPublicationSelectable) {
            return;
        }
        this.selectedDiscoveredPublication = this.discoveryResult;
    },
    // The only writer of `encounterCommentaryOpen`, like PublicationCard.js's
    // toggleCommentary(). The first open performs the first read (collapsed by default, loaded only on first expansion).
    toggleEncounterCommentary() {
        if (!this.getPublicationCommentariesCommand || !this.encounterCommentaryPublicationId) {
            return;
        }
        const opening = !this.encounterCommentaryOpen;
        this.encounterCommentaryOpen = opening;
        if (opening) {
            this.refreshEncounterCommentaries();
        }
    },
    // The only reader via getPublicationCommentariesCommand. A failed read
    // keeps the existing list and sets the error, like PublicationCard.js's
    // refreshCommentaries().
    refreshEncounterCommentaries() {
        if (!this.getPublicationCommentariesCommand || !this.encounterCommentaryPublicationId) {
            return;
        }
        try {
            const result = this.getPublicationCommentariesCommand(this.encounterCommentaryPublicationId);
            this.encounterCommentaries = Array.isArray(result) ? result : [];
            this.encounterCommentaryError = null;
        } catch (error) {
            this.encounterCommentaryError = 'Commentary could not be loaded.';
        }
    },
    // The only caller of addPublicationCommentaryCommand; sends only
    // `{ publicationId, content }`. On success, clears the draft and re-queries
    // rather than appending, like PublicationCard.js/OwnPublicationPanel.js. On
    // failure, draft and list are unchanged. An unedited retry reuses the same
    // commentaryId/createdAt, so a write that actually persisted becomes an
    // idempotent no-op (see PublicationCard.js's submitCommentary()). Editing
    // the draft mints a new id.
    submitEncounterCommentary() {
        const publicationId = this.encounterCommentaryPublicationId;
        const content = this.newEncounterCommentaryText.trim();
        if (!publicationId || !this.addPublicationCommentaryCommand || !content || this.encounterCommentarySubmitting) {
            return;
        }
        if (!this.pendingEncounterCommentaryDraft || this.pendingEncounterCommentaryDraft.content !== content) {
            this.pendingEncounterCommentaryDraft = { content, commentaryId: createId(), createdAt: new Date() };
        }
        const { commentaryId, createdAt } = this.pendingEncounterCommentaryDraft;
        this.encounterCommentarySubmitting = true;
        try {
            this.addPublicationCommentaryCommand({ publicationId, content, commentaryId, createdAt });
            this.newEncounterCommentaryText = '';
            this.encounterCommentaryError = null;
            this.pendingEncounterCommentaryDraft = null;
            this.refreshEncounterCommentaries();
        } catch (error) {
            this.encounterCommentaryError = (error && error.message) ? error.message : 'Commentary could not be created.';
        } finally {
            this.encounterCommentarySubmitting = false;
        }
    },
};
