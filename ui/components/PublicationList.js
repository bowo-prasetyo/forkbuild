import PublicationPreview from './PublicationPreview.js';
import PublicationCommentaryRemoteCheck from './PublicationCommentaryRemoteCheck.js';
import { resolveSigningIdentityId } from '../../identity/resolveSigningIdentityId.js';
import { formatPublicationDate } from '../../core/PublicationDateAmbiguity.js';
import { createId } from '../../core/createId.js';
import { License } from '../../core/License.js';

// 0.2.31 — the compact table/row view of a page of publications —
// "best when there are hundreds or thousands," per the design doc,
// exactly why it exists alongside PublicationCard rather than
// replacing it: cards are for visual discovery, this is for scanning
// a lot of results quickly. Same pure-presentation contract as
// PublicationCard — every row's description/parent-title is resolved
// by the host and handed down already-computed. (Fork counts are a
// cards-view-only detail; the table has no column for them.)
//
// 0.9.561 — Publication List Commentary Parity.
//
// 0.9.560's own Section G named the one real gap its cross-surface
// audit found: PublicationCard.js (this catalog's "cards" view) has
// carried full Commentary since 0.9.289 — view, compose, retry — while
// this file, the alternate "list" view of the IDENTICAL
// PublicationCatalog.js/Publications, carried none. Same catalog, same
// page, same Publications; only the chosen view mode decided whether
// Commentary was reachable. This milestone closes exactly that gap,
// exactly the way 0.9.560's own "if ever acted on" recommendation
// described: reuse PublicationCard.js's own inject/command contract
// verbatim, never a new composition, never a new command, never a new
// use case.
//
//   getPublicationCommentariesCommand(publicationId)   (inject — the
//        │        SAME app-wide command ui/main.js already provides
//        │        (`app.provide('getPublicationCommentariesCommand', ...)`,
//        │        0.9.289) and PublicationCard.js already injects one
//        │        component over. No new provide/inject key, no prop
//        │        threaded through PublicationCatalog.js — Vue's own
//        │        provide/inject already reaches every descendant of
//        │        the app root, PublicationList.js included.
//        ▼
//   commentaryState[pub.id]   (THIS component's own local state, below)
//
//   addPublicationCommentaryCommand({ publicationId, content,
//        commentaryId, createdAt })   (inject — the SAME command,
//        the SAME contract, the SAME 0.9.542 stable-retry-identity
//        shape PublicationCard.js already sends.)
//
// ONE COMPONENT, MANY ROWS — the one real structural difference from
// PublicationCard.js (one component instance PER publication). This
// file renders every row of the current page from a single instance,
// so "which row is this?" has to be part of the state shape itself:
// `commentaryState` is keyed by publicationId, never a single shared
// `commentaryOpen`/`commentaries`/etc. the way PublicationCard.js's own
// per-instance data() gets away with. `rowCommentaryState(pub)` is the
// one place that key is read or created — every other method below
// goes through it, mirroring ReconciliationCandidateLeaderboardTable.js's
// own per-row `expandedKeys` pattern (keyed there by candidateKey, here
// by publicationId) for the identical reason: many rows, one instance,
// no cross-row bleed.
//
// NEVER GATED ON OWNERSHIP, IDENTICAL TO PublicationCard.js's OWN
// RESTRAINT — this table renders for the local user's own Publications
// and every other Wanderer's alike (see PublicationCatalog.js's own
// header, "the ONE and only thing that distinguishes" Repository from
// Author is the `author` query, never a different list component or a
// different commentary gate); CanCommentOnPublicationUseCase is already
// ownership-agnostic, so this component adds no "is this mine" check.
//
// COLLAPSED BY DEFAULT, LOADED ONLY ON FIRST EXPANSION PER ROW — the
// identical restraint PublicationCard.js's own toggleCommentary()
// already established, extended here per-row rather than per-instance.
//
// AUTHORSHIP IS NEVER UI-SUPPLIED, IDENTICAL TO PublicationCard.js's
// OWN RESTRAINT. submitCommentary() sends ONLY
// `{ publicationId, content, commentaryId, createdAt }` — no
// `authorIdentityId` field exists on that call.
//
// 0.9.638 — Publication Commentary Distribution Provider Selector.
//
// The identical control PublicationCard.js (this catalog's "cards"
// view) already gained this milestone, extended here per-row exactly
// the way 0.9.561 extended Commentary itself: each row's own
// `rowCommentaryState()` entry now also carries `discoveryProvider` and `distributionProvider` (the last successful submission's
// choice, for the honest status line), and `submitCommentary(pub)`
// forwards that row's own provider verbatim as `discoveryProvider` on
// the SAME addPublicationCommentaryCommand call. Each row opens on the
// injected `defaultAnnouncementDiscoveryProvider` (else 'nostr'), exactly
// like PublicationCard.js (0.9.667). No new command, no new
// distribution class imported here, no cross-row bleed — see this
// file's own header, "one component, many rows." Status text carries
// the identical "never a success/receipt claim" restraint
// PublicationCard.js's own header documents, for the identical reason:
// this command's own not-awaited relay half is fire-and-forget and
// never returns a result to either surface.
export default {
    name: 'PublicationList',
    components: { PublicationPreview, PublicationCommentaryRemoteCheck },
    inject: {
        getPublicationCommentariesCommand: { default: null },
        addPublicationCommentaryCommand: { default: null },
        identityUseCase: { default: null },
        // The SAME app-wide saved ANNOUNCEMENT_AND_DISCOVERY preference
        // PublicationCard.js injects (0.9.667) — seeds each row's own
        // provider choice, so the list and card views open on the same
        // default.
        defaultAnnouncementDiscoveryProvider: { default: null }
    },
    props: {
        items: { type: Array, required: true },
        descriptions: { type: Object, default: () => ({}) },
        parentTitles: { type: Object, default: () => ({}) },
        // 0.9.539 — see core/PublicationDateAmbiguity.js's own header.
        // Keyed by publicationId (unlike the two maps above, which are
        // keyed by documentId) because the collision this guards
        // against is between two Publication INSTANCES of the same
        // document, not the document itself.
        preciseDateIds: { type: Set, default: () => new Set() }
    },
    emits: ['open', 'fork', 'explore', 'view-author'],
    data() {
        return {
            // publicationId -> { open, commentaries, newText,
            // submitting, error, pendingDraft } — see this file's own
            // header, "one component, many rows." Never pre-populated;
            // rowCommentaryState() below creates an entry on first
            // touch, the same lazy pattern PublicationCard.js's own
            // data() establishes at the per-instance level.
            commentaryState: {}
        };
    },
    computed: {
        // The currently signed-in identity's own did:key id, or `null` —
        // byte-identical to PublicationCard.js's own computed of the
        // same name; this table has exactly one viewer, so this stays a
        // single computed rather than per-row state.
        viewerIdentityId() {
            if (!this.identityUseCase) {
                return null;
            }
            return resolveSigningIdentityId(this.identityUseCase.provider);
        }
    },
    methods: {
        licenseLabel(pub) {
            return License.idOf(pub.license);
        },
        // 0.9.539 — the SAME `publishedAt` field, at finer precision,
        // never a new one.
        publishedAtLabel(pub) {
            return formatPublicationDate(pub.publishedAt, this.preciseDateIds.has(pub.id)) || '—';
        },
        // The one reader/creator of a row's own commentary state. Every
        // other commentary method below calls this rather than touching
        // `commentaryState` directly.
        rowCommentaryState(pub) {
            if (!this.commentaryState[pub.id]) {
                this.commentaryState[pub.id] = {
                    open: false, commentaries: [], newText: '',
                    submitting: false, error: null, pendingDraft: null,
                    // 0.9.638 — this row's own substrate choice (the
                    // saved preference, else 'nostr') and the last successful submission's own
                    // choice, for that row's own status line. Named
                    // discoveryProvider, never the bare `provider`, to
                    // stay unambiguous against this codebase's own,
                    // unrelated `Publication.providerId` vocabulary
                    // (an internal admission-source field, never
                    // surfaced to a Wanderer — see
                    // tests/RepositoryDiscoveryMaterialTrustProductReassessment.test.js's
                    // own Section B).
                    discoveryProvider: this.defaultAnnouncementDiscoveryProvider || 'nostr', distributionProvider: null
                };
            }
            return this.commentaryState[pub.id];
        },
        // 0.9.638 — human-friendly label ONLY, never the value sent to
        // addPublicationCommentaryCommand.
        distributionProviderLabel(pub) {
            return this.rowCommentaryState(pub).distributionProvider === 'arweave' ? 'Arweave' : 'Nostr';
        },
        isCommentaryOpen(pub) {
            return this.rowCommentaryState(pub).open;
        },
        // The only writer of a row's own `open` flag. A no-op whenever
        // no getPublicationCommentariesCommand was ever injected —
        // mirrors PublicationCard.js's own toggleCommentary(). The
        // FIRST time a row is expanded, this also performs the first
        // read for THAT row only — every other row's own state is
        // untouched.
        toggleCommentary(pub) {
            if (!this.getPublicationCommentariesCommand) {
                return;
            }
            const state = this.rowCommentaryState(pub);
            state.open = !state.open;
            if (state.open) {
                this.refreshCommentaries(pub);
            }
        },
        // The only writer of a row's own `commentaries`/`error` from a
        // read. A FAILED read leaves that row's `commentaries` exactly
        // as it was — never wiped — and only sets that row's own
        // `error`; every OTHER row's state is untouched, mirroring
        // PublicationCard.js's own refreshCommentaries().
        refreshCommentaries(pub) {
            if (!this.getPublicationCommentariesCommand) {
                return;
            }
            const state = this.rowCommentaryState(pub);
            try {
                const result = this.getPublicationCommentariesCommand(pub.id);
                state.commentaries = Array.isArray(result) ? result : [];
                state.error = null;
            } catch (error) {
                state.error = 'Commentary could not be loaded.';
            }
        },
        // The only call site of addPublicationCommentaryCommand in this
        // file. Sends ONLY `{ publicationId, content, commentaryId,
        // createdAt }` — see this file's own header, "authorship is
        // never UI-supplied." On success, clears that row's own compose
        // draft and RE-QUERIES through refreshCommentaries() rather than
        // appending the returned commentary — one source of truth, per
        // row, mirroring PublicationCard.js's own identical restraint.
        // On failure, that row's own `newText`/`commentaries` are left
        // UNCHANGED, and every OTHER row stays entirely untouched — the
        // per-row keying in rowCommentaryState() is what makes that
        // isolation structural rather than merely intended.
        //
        // 0.9.542's own stable-retry-identity pattern — reused verbatim,
        // per row: a manual retry of an UNCHANGED draft reuses the same
        // commentaryId/createdAt so PublicationCommentaryStore's own
        // "SAME ID + IDENTICAL RECORD -> IDEMPOTENT SUCCESS" engages
        // instead of minting a fresh id (and a fresh, duplicate record)
        // on every click.
        submitCommentary(pub) {
            const state = this.rowCommentaryState(pub);
            const content = state.newText.trim();
            if (!this.addPublicationCommentaryCommand || !content || state.submitting) {
                return;
            }
            if (!state.pendingDraft || state.pendingDraft.content !== content) {
                state.pendingDraft = { content, commentaryId: createId(), createdAt: new Date() };
            }
            const { commentaryId, createdAt } = state.pendingDraft;
            // 0.9.638 — forwarded verbatim, this row's own choice.
            const discoveryProvider = state.discoveryProvider;
            state.submitting = true;
            try {
                this.addPublicationCommentaryCommand({ publicationId: pub.id, content, commentaryId, createdAt, discoveryProvider });
                state.newText = '';
                state.error = null;
                state.pendingDraft = null;
                state.distributionProvider = discoveryProvider;
                this.refreshCommentaries(pub);
            } catch (error) {
                state.error = (error && error.message) ? error.message : 'Commentary could not be created.';
            } finally {
                state.submitting = false;
            }
        }
    },
    template: `
        <div class="publication-table-wrap">
            <table class="publication-table">
                <thead>
                    <tr>
                        <th class="publication-table-preview-col"></th>
                        <th>Title</th>
                        <th>Author</th>
                        <th>Published</th>
                        <th>License</th>
                        <th class="publication-table-actions-col">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <template v-for="pub in items" :key="pub.id">
                        <tr>
                            <td class="publication-table-preview-col">
                                <PublicationPreview :publication="pub" size="list" />
                            </td>
                            <td class="publication-table-title-col">
                                <span class="publication-table-title">{{ pub.title }}</span>
                                <span v-if="pub.parentDocumentId" class="publication-fork-of">
                                    ↳ Fork of {{ parentTitles[pub.documentId] || 'Unknown' }}
                                </span>
                                <span v-if="descriptions[pub.documentId]" class="publication-description publication-description--list">
                                    {{ descriptions[pub.documentId] }}
                                </span>
                            </td>
                            <td>
                                <template v-if="pub.author">
                                    <a @click.prevent="$emit('view-author', pub.author)" class="publication-author-link">{{ pub.author }}</a>
                                </template>
                                <template v-else>anonymous</template>
                            </td>
                            <td class="publication-date">{{ publishedAtLabel(pub) }}</td>
                            <td class="publication-date">{{ licenseLabel(pub) }}</td>
                            <td>
                                <div class="publication-actions publication-actions--row">
                                    <button class="action-btn action-btn--open" @click="$emit('open', pub)">Open</button>
                                    <button class="action-btn action-btn--fork" @click="$emit('fork', pub)">Fork</button>
                                    <button class="action-btn action-btn--explore" @click="$emit('explore', pub)">Explore</button>
                                    <button
                                        v-if="getPublicationCommentariesCommand"
                                        class="action-btn action-btn--comment"
                                        @click="toggleCommentary(pub)"
                                    >{{ isCommentaryOpen(pub) ? 'Hide Comments' : 'Comment' }}</button>
                                </div>
                            </td>
                        </tr>

                        <!-- 0.9.561 — Publication List Commentary Parity.
                             Rendered only when a caller supplied
                             getPublicationCommentariesCommand AND this
                             specific row is expanded — mirrors
                             ReconciliationCandidateLeaderboardTable.js's
                             own detail-row pattern one component over. -->
                        <tr v-if="getPublicationCommentariesCommand && isCommentaryOpen(pub)" class="publication-table-commentary-row">
                            <td colspan="6" class="publication-table-commentary-cell">
                                <div class="publication-table-commentary">
                                    <p v-if="rowCommentaryState(pub).error" class="publication-table-commentary-error">{{ rowCommentaryState(pub).error }}</p>

                                    <PublicationCommentaryRemoteCheck :publication-id="pub.id" @refreshed="refreshCommentaries(pub)" />

                                    <p v-if="!rowCommentaryState(pub).commentaries.length" class="publication-table-commentary-empty">No commentary yet.</p>
                                    <ul v-else class="publication-table-commentary-list">
                                        <li
                                            v-for="commentary in rowCommentaryState(pub).commentaries"
                                            :key="commentary.commentaryId"
                                            class="publication-table-commentary-entry"
                                        >
                                            <span class="publication-table-commentary-author">{{ commentary.authorIdentityId }}</span>
                                            <p class="publication-table-commentary-content">{{ commentary.content }}</p>
                                        </li>
                                    </ul>

                                    <p v-if="addPublicationCommentaryCommand && !viewerIdentityId" class="publication-table-commentary-signin-hint">
                                        Sign in to add commentary.
                                    </p>
                                    <form
                                        v-else-if="addPublicationCommentaryCommand"
                                        class="publication-table-commentary-form"
                                        @submit.prevent="submitCommentary(pub)"
                                    >
                                        <textarea
                                            v-model="rowCommentaryState(pub).newText"
                                            class="publication-table-commentary-input"
                                            :disabled="rowCommentaryState(pub).submitting"
                                            placeholder="Add a comment…"
                                        ></textarea>
                                        <!-- 0.9.638 — Publication Commentary
                                             Distribution Provider Selector,
                                             per row. -->
                                        <label class="publication-table-commentary-provider-label">
                                            Distribution:
                                            <select
                                                v-model="rowCommentaryState(pub).discoveryProvider"
                                                class="form-select publication-table-commentary-provider-select"
                                                :disabled="rowCommentaryState(pub).submitting"
                                            >
                                                <option value="arweave">Arweave</option>
                                                <option value="nostr">Nostr</option>
                                            </select>
                                        </label>
                                        <button
                                            type="submit"
                                            class="action-btn publication-table-commentary-submit-action"
                                            :disabled="!rowCommentaryState(pub).newText.trim() || rowCommentaryState(pub).submitting"
                                        >{{ rowCommentaryState(pub).submitting ? 'Posting…' : 'Post Comment' }}</button>
                                    </form>
                                    <!-- 0.9.638 — never a success/receipt
                                         claim, see this file's own header. -->
                                    <p v-if="addPublicationCommentaryCommand && rowCommentaryState(pub).distributionProvider" class="publication-table-commentary-distribution-status">
                                        Comment saved locally. Distribution requested via {{ distributionProviderLabel(pub) }}.
                                    </p>
                                </div>
                            </td>
                        </tr>
                    </template>
                </tbody>
            </table>
        </div>
    `
};
