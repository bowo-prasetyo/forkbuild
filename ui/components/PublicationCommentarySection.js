import PublicationCommentaryRemoteCheck from './PublicationCommentaryRemoteCheck.js';
import { resolveSigningIdentityId } from '../../identity/resolveSigningIdentityId.js';
import { createId } from '../../core/createId.js';

// The Repository catalog's Commentary section for ONE Publication — the
// single implementation both of the catalog's views mount:
// ui/components/PublicationCard.js (0.9.289, "cards") and
// ui/components/PublicationList.js (0.9.561, "list", in each row's
// expanded detail row). Before this file existed, the two views carried
// two parallel copies of this exact logic, and the copies drifted (the
// list view never picked up 0.9.667's saved-provider default). One
// component per Publication also retires PublicationList.js's own
// hand-rolled, publicationId-keyed per-row state: each instance simply
// owns its own.
//
// LOADED ON MOUNT, MOUNTED ONLY WHEN OPEN. The host owns the
// "Comment"/"Hide Comments" toggle (it lives in the host's own actions
// area) and renders this component only while that toggle is open — so
// nothing is read for a Publication whose Commentary nobody expanded,
// the same "don't do the work until it's actually wanted" restraint
// ui/components/PublicationPreview.js applies, and the same "mount IS
// open" contract PublicationCommentaryRemoteCheck.js already relies on.
// Collapsing discards this instance, including any unsent draft.
//
// Commands come from the SAME app-wide provide/inject keys ui/main.js
// provides (`getPublicationCommentariesCommand`,
// `addPublicationCommentaryCommand`, `identityUseCase`,
// `defaultAnnouncementDiscoveryProvider`) — never a prop the catalog has
// to thread through. This file never imports a Commentary store, use
// case, or distribution class itself.
//
// NEVER GATED ON OWNERSHIP. Rendered for the local user's own
// Publications and every other Wanderer's alike —
// CanCommentOnPublicationUseCase (0.9.246) is already ownership-agnostic.
//
// AUTHORSHIP IS NEVER UI-SUPPLIED. submitCommentary() sends
// `{ publicationId, content, commentaryId, createdAt, discoveryProvider }`
// — no `authorIdentityId`, because AddPublicationCommentaryUseCase's own
// boundary never reads one.
//
// STATUS TEXT IS HONEST ABOUT WHAT addPublicationCommentaryCommand DOES.
// The command persists locally and synchronously; its relay/gateway
// distribution half is fire-and-forget (ui/main.js) and never reports
// back. `lastCommentaryDistributionProvider` therefore only ever names
// which substrate a locally-succeeded submission REQUESTED, never a
// delivery/receipt claim.
export default {
    name: 'PublicationCommentarySection',
    components: { PublicationCommentaryRemoteCheck },
    inject: {
        getPublicationCommentariesCommand: { default: null },
        addPublicationCommentaryCommand: { default: null },
        // Read only to decide between the compose form and a sign-in
        // hint — this component never authenticates anyone itself.
        identityUseCase: { default: null },
        // 0.9.667 — this replica's saved ANNOUNCEMENT_AND_DISCOVERY
        // preference, resolved once at boot by ui/main.js; seeds
        // `selectedDiscoveryProvider` below.
        defaultAnnouncementDiscoveryProvider: { default: null }
    },
    props: {
        publication: { type: Object, required: true }
    },
    data() {
        return {
            // Every PublicationCommentary getPublicationCommentariesCommand
            // returned, in the EXACT order it returned them — no sort here.
            commentaries: [],
            newCommentaryText: '',
            commentaryError: null,
            // 0.9.542 — `{ content, commentaryId, createdAt }` for the
            // current compose attempt, or `null`. See submitCommentary().
            pendingCommentaryDraft: null,
            // 0.9.638 — the substrate for the NEXT submission. Never
            // persisted; opens on the saved preference, else 'nostr'.
            selectedDiscoveryProvider: this.defaultAnnouncementDiscoveryProvider || 'nostr',
            // 0.9.638 — which substrate the most recent successful
            // submission requested; `null` until one succeeds.
            lastCommentaryDistributionProvider: null
        };
    },
    computed: {
        // The signed-in identity's did:key id, or `null` — the SAME
        // tolerant lookup application/WorldNavigationSession.js's own
        // getMyIdentityId() wraps.
        viewerIdentityId() {
            if (!this.identityUseCase) {
                return null;
            }
            return resolveSigningIdentityId(this.identityUseCase.provider);
        },
        // Human-friendly label only — never the value sent to the command.
        lastCommentaryDistributionProviderLabel() {
            return this.lastCommentaryDistributionProvider === 'arweave' ? 'Arweave' : 'Nostr';
        }
    },
    mounted() {
        this.refreshCommentaries();
    },
    methods: {
        // The only writer of `commentaries`/`commentaryError` from a
        // read. A FAILED read leaves `commentaries` exactly as it was and
        // only sets `commentaryError`.
        refreshCommentaries() {
            if (!this.getPublicationCommentariesCommand) {
                return;
            }
            try {
                const result = this.getPublicationCommentariesCommand(this.publication.id);
                this.commentaries = Array.isArray(result) ? result : [];
                this.commentaryError = null;
            } catch (error) {
                this.commentaryError = 'Commentary could not be loaded.';
            }
        },
        // The only call site of addPublicationCommentaryCommand. On
        // success, clears the draft and RE-QUERIES through
        // refreshCommentaries() rather than appending the returned
        // commentary — one source of truth. On failure, the typed text
        // and the displayed list are both left unchanged.
        //
        // 0.9.542 — a thrown error does not always mean nothing was
        // persisted (PublicationCommentaryNotificationProducer can fail
        // AFTER the save). `pendingCommentaryDraft` reuses the SAME
        // commentaryId/createdAt across retries of byte-identical
        // content, so a retry of an already-saved comment hits
        // PublicationCommentaryStore's own "same id, identical record"
        // idempotent no-op instead of creating a duplicate. Editing the
        // draft mints a fresh id — an edited draft is a new comment.
        submitCommentary() {
            const content = this.newCommentaryText.trim();
            if (!this.addPublicationCommentaryCommand || !content) {
                return;
            }
            if (!this.pendingCommentaryDraft || this.pendingCommentaryDraft.content !== content) {
                this.pendingCommentaryDraft = { content, commentaryId: createId(), createdAt: new Date() };
            }
            const { commentaryId, createdAt } = this.pendingCommentaryDraft;
            const discoveryProvider = this.selectedDiscoveryProvider;
            try {
                this.addPublicationCommentaryCommand({ publicationId: this.publication.id, content, commentaryId, createdAt, discoveryProvider });
                this.newCommentaryText = '';
                this.commentaryError = null;
                this.pendingCommentaryDraft = null;
                this.lastCommentaryDistributionProvider = discoveryProvider;
                this.refreshCommentaries();
            } catch (error) {
                this.commentaryError = (error && error.message) ? error.message : 'Commentary could not be created.';
            }
        }
    },
    template: `
        <div class="publication-commentary">
            <p v-if="commentaryError" class="publication-commentary-error">{{ commentaryError }}</p>

            <PublicationCommentaryRemoteCheck :publication-id="publication.id" @refreshed="refreshCommentaries" />

            <p v-if="!commentaries.length" class="publication-commentary-empty">No commentary yet.</p>
            <ul v-else class="publication-commentary-list">
                <li
                    v-for="commentary in commentaries"
                    :key="commentary.commentaryId"
                    class="publication-commentary-entry"
                >
                    <span class="publication-commentary-author">{{ commentary.authorIdentityId }}</span>
                    <p class="publication-commentary-content">{{ commentary.content }}</p>
                </li>
            </ul>

            <p v-if="addPublicationCommentaryCommand && !viewerIdentityId" class="publication-commentary-signin-hint">
                Sign in to add commentary.
            </p>
            <form
                v-else-if="addPublicationCommentaryCommand"
                class="publication-commentary-form"
                @submit.prevent="submitCommentary"
            >
                <textarea
                    v-model="newCommentaryText"
                    class="publication-commentary-input"
                    placeholder="Add a comment…"
                ></textarea>
                <!-- 0.9.638 — the same two-option vocabulary as
                     EditorView.js's own "Announcement / Discovery
                     substrate" control. -->
                <label class="publication-commentary-provider-label">
                    Distribution:
                    <select
                        v-model="selectedDiscoveryProvider"
                        class="form-select publication-commentary-provider-select"
                    >
                        <option value="arweave">Arweave</option>
                        <option value="nostr">Nostr</option>
                    </select>
                </label>
                <button
                    type="submit"
                    class="action-btn publication-commentary-submit-action"
                    :disabled="!newCommentaryText.trim()"
                >Post Comment</button>
            </form>
            <!-- Reports what was requested, never a success/receipt claim. -->
            <p v-if="addPublicationCommentaryCommand && lastCommentaryDistributionProvider" class="publication-commentary-distribution-status">
                Comment saved locally. Distribution requested via {{ lastCommentaryDistributionProviderLabel }}.
            </p>
        </div>
    `
};
