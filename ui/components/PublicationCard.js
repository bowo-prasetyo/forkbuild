import PublicationPreview from './PublicationPreview.js';
import { resolveSigningIdentityId } from '../../identity/resolveSigningIdentityId.js';
import { formatPublicationDate } from '../../core/PublicationDateAmbiguity.js';
import { createId } from '../../core/createId.js';

// 0.2.31 — one publication, in card form. Pure presentation: every
// piece of enriched data (description, parent title, fork count) is
// resolved by the host (ui/components/PublicationCatalog.js) and
// handed down as a prop — this component never calls a use case or a
// discovery provider itself, the same "host resolves, component
// renders" convention WorldLocationBrowser (0.2.29/0.2.30) already
// established.
//
// Open/Fork/Explore are the same three actions Repository/Author View
// have always offered — see docs/Principles.md, "Repository, World,
// Editor" for why they stay conceptually distinct: Open loads an
// editable document/fork per the existing fork-on-write lifecycle;
// Explore navigates to the publication's World placement; Fork
// explicitly creates an editable descendant. Nothing here changes
// what any of the three DO — only how a publication is discovered
// before one of them is chosen.
//
// 0.9.289 — Other-Publication Commentary Entry Point.
//
// 0.9.288's own Section E finding named this exact component as one of
// six that already hold the full `Publication` object at render time
// (`.id` included) yet carry zero commentary vocabulary — a cross-arc
// composition gap between two independently complete systems
// (Publication Commentary, Discovery presentation). This is that seam,
// wired at exactly one of the six named surfaces (see this milestone's
// own docs/Roadmap.md entry for why one surface, and why this one):
//
//   getPublicationCommentariesCommand(publicationId)   (NEW — a thin
//        │        (publicationId) -> PublicationCommentary[] function,
//        │        injected the SAME way ui/components/PublicationPreview.js's
//        │        own `previewService` already is — a plain `inject`,
//        │        never a prop the host (PublicationCatalog.js/
//        │        PublicationList.js) has to thread through, because
//        │        this capability is app-wide, not scoped to whichever
//        │        catalog happens to be mounted)
//        │
//        ▼
//   commentaries   (THIS component's own local state, below)
//
//   addPublicationCommentaryCommand({ publicationId, content })   (NEW —
//        same injection shape, the identical
//        `({publicationId,content}) -> {commentary,isNew}` contract
//        ui/components/OwnPublicationPanel.js's own 0.9.248
//        `addPublicationCommentaryCommand` prop already is)
//
// THE EXACT SAME COMMANDS OwnPublicationPanel ALREADY CALLS — composed
// by application/CreatePublicationCommentaryUseCase.js (NEW) rather than
// application/CreateWorldViewUseCase.js (unmodified), because this
// component has no WorldNavigationSession to ask, but wrapping the
// IDENTICAL AddPublicationCommentaryUseCase/GetPublicationCommentariesUseCase/
// PublicationCommentaryNotificationProducer instances that composition
// already wires — see that new file's own header. This file never
// imports PublicationCommentary, PublicationCommentaryStore,
// AddPublicationCommentaryUseCase, or GetPublicationCommentariesUseCase
// itself, mirroring OwnPublicationPanel's own identical restraint one
// surface over.
//
// NEVER GATED ON OWNERSHIP. This card renders for the local user's own
// Publications and for every other Wanderer's alike (RepositoryView vs.
// AuthorView — see ui/components/PublicationCatalog.js's own header,
// "the ONE and only thing that distinguishes the two host views" is the
// `author` query, never a different card component or a different
// commentary gate) — CanCommentOnPublicationUseCase (0.9.246) is already
// ownership-agnostic, so this component adds no "is this mine" check of
// its own; the only thing it ever asks for is whether a caller wired
// the commands in at all, the same "feature hidden when its collaborator
// is absent" gate every optional capability in this codebase's UI layer
// already follows.
//
// COLLAPSED BY DEFAULT, LOADED ONLY ON FIRST EXPANSION — unlike
// OwnPublicationPanel's own commentary section (loaded eagerly, because
// that panel only ever shows ONE Publication at a time), this component
// renders inside a paginated, potentially many-items-per-page list (see
// PublicationCatalog.js). Reading commentary for every card on a page
// the instant it mounts would be wasted work for cards nobody expands;
// `toggleCommentary()` (below) is the only thing that ever triggers the
// first `refreshCommentaries()` call, mirroring
// ui/components/PublicationPreview.js's own lazy, IntersectionObserver-
// gated fetch one component over — a different mechanism (a click,
// rather than viewport proximity) answering the identical "don't do the
// work until it's actually wanted" restraint.
//
// AUTHORSHIP IS NEVER UI-SUPPLIED, IDENTICAL TO OwnPublicationPanel's OWN
// RESTRAINT. `submitCommentary()` (below) sends ONLY
// `{ publicationId, content }` — no `authorIdentityId` field exists on
// that call, because AddPublicationCommentaryUseCase's own 0.9.245
// boundary never reads one even if a caller tried to supply it.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. A comment COUNT badge
// (this card shows nothing until expanded — see
// docs/Roadmap.md's own 0.9.251 "Publication Commentary Count UI" entry
// for why a count is its own, separate, deliberate decision, made once
// already for OwnPublicationPanel and NOT extended here); editing/deleting/replying
// to a comment; pagination, sorting, or ranking of the comment list;
// wiring PublicationList.js (the SAME catalog's alternate list view) or
// any of the other five surfaces 0.9.288 Section E named — see this
// milestone's own docs/Roadmap.md entry for why exactly one surface,
// deliberately, this milestone.
//
// 0.9.638 — Publication Commentary Distribution Provider Selector.
//
// 0.9.637's own Section D flagship proved, live, that
// addPublicationCommentaryCommand (the app-wide, distribution-wrapped
// command this component already injects — see 0.9.289's own header
// above) already reaches Arweave instead of its Nostr default the
// instant a caller's input carries `discoveryProvider: 'arweave'`. This
// milestone is exactly that one field, exposed as a real control:
//
//   selectedDiscoveryProvider ('nostr' default, matching
//   EditorView.js's own 0.9.502 `selectedDiscoveryProvider` precedent
//   and ui/main.js's own `|| 'nostr'` fallback exactly)
//        │
//        ▼
//   submitCommentary() forwards it verbatim as `discoveryProvider` on
//   the SAME addPublicationCommentaryCommand({ publicationId, content,
//   commentaryId, createdAt }) call this file has sent since 0.9.289 —
//   no new field name, no new command, no new distribution class
//   imported or constructed here.
//
// This component never imports PublicationCommentaryNostrDistribution
// or PublicationCommentaryArweaveDistribution — selecting between them
// is entirely ui/main.js's own existing job (0.9.620/0.9.628/0.9.631),
// unmodified by this milestone. No fan-out, no fallback, no retry, and
// no new persisted preference: the selection lives only in this card's
// own ephemeral `data()`, exactly like `newCommentaryText`.
//
// STATUS TEXT IS HONEST ABOUT WHAT addPublicationCommentaryCommand
// ACTUALLY DOES. That command's own asynchronous half is fire-and-
// forget (see ui/main.js's own `asynchronousDistribution.publish(...)
// .catch(() => {})`) — it is never awaited and never returns a result
// to its caller, unlike EditorView.js's own AWAITED
// distributeEditorPublication(). There is therefore no real success/
// failure signal for this milestone to surface, and none is invented:
// `lastCommentaryDistributionProvider` only ever reports which
// substrate a locally-succeeded submission REQUESTED, never a
// delivery/receipt claim — the same "never a delivery/read claim"
// restraint 0.9.637's own Section A/G already found in EditorView.js's
// own distribution status vocabulary.
export default {
    name: 'PublicationCard',
    components: { PublicationPreview },
    inject: {
        getPublicationCommentariesCommand: { default: null },
        addPublicationCommentaryCommand: { default: null },
        // The SAME app-wide IdentityUseCase every other injecting
        // component (ui/components/LoginModal.js, etc.) already reads —
        // never a second identity mechanism. Read only to decide whether
        // to show the compose form or a sign-in hint, and to resolve
        // `viewerIdentityId` below — this component never authenticates
        // or derives an identity itself.
        identityUseCase: { default: null },
        // 0.9.667 — Role Provider Preference As Dropdown Default. The SAME
        // app-wide `defaultAnnouncementDiscoveryProvider` ui/main.js
        // resolves once at boot (from this replica's own saved
        // ANNOUNCEMENT_AND_DISCOVERY preference, falling back to 'nostr')
        // — read only to seed `selectedDiscoveryProvider` below at
        // construction time. See application/PreferredProviderDefaultChoice.js's
        // own header.
        defaultAnnouncementDiscoveryProvider: { default: null }
    },
    props: {
        publication: { type: Object, required: true },
        description: { type: String, default: '' },
        parentTitle: { type: String, default: null },
        forkCount: { type: Number, default: 0 },
        // 0.9.539 — see core/PublicationDateAmbiguity.js's own header.
        // True only when the host (PublicationCatalog.js) detected
        // another Publication for the SAME document, published the
        // same calendar day, also visible on the current page — the
        // one case where the usual day-level `publishedAt` label would
        // otherwise render two distinct Publications identically.
        needsPreciseDate: { type: Boolean, default: false }
    },
    emits: ['open', 'fork', 'explore', 'view-author'],
    data() {
        return {
            // `commentaryOpen` — whether the compose/list section is
            // expanded. Starts collapsed; only toggleCommentary() below
            // ever writes it.
            commentaryOpen: false,
            // Every PublicationCommentary getPublicationCommentariesCommand
            // returned for this card's own publication, in the EXACT
            // order it returned them — no sort performed here, mirroring
            // OwnPublicationPanel's own identical restraint.
            commentaries: [],
            newCommentaryText: '',
            commentarySubmitting: false,
            commentaryError: null,
            // 0.9.542 — Publication Commentary Submission Experience
            // Product Reassessment. `{ content, commentaryId, createdAt }`
            // for the CURRENT in-progress compose attempt, or `null`. See
            // submitCommentary()'s own header for why this exists: it lets
            // a manual retry of an UNCHANGED draft reuse the store's own
            // commentaryId-keyed idempotent-retry identity
            // (storage/PublicationCommentaryStore.js's own "SAME ID +
            // IDENTICAL RECORD -> IDEMPOTENT SUCCESS") instead of minting
            // a fresh commentaryId on every submit click. NOT a new
            // identity mechanism — commentaryId/createdAt are the exact,
            // already-optional AddPublicationCommentaryUseCase inputs
            // 0.9.244/0.9.541 already established; this only wires this
            // component to actually pass them. Cleared on a successful
            // submit, and regenerated (never reused) the moment the
            // draft's own text changes from what it was on the last
            // attempt — an edited draft is a new logical comment, not a
            // retry of the old one.
            pendingCommentaryDraft: null,
            // 0.9.638 — the Wanderer's current substrate choice for the
            // NEXT submission. Never persisted — a change here lives only
            // as long as this card does.
            //
            // 0.9.667 — opens on the SAME injected
            // `defaultAnnouncementDiscoveryProvider` above (this replica's
            // own saved preference, or 'nostr' when none is on file),
            // rather than hardcoding 'nostr' directly — still matching
            // EditorView.js's own `selectedDiscoveryProvider` default and
            // ui/main.js's own application-level fallback (0.9.637 Section
            // F) for anyone who has never saved a preference.
            selectedDiscoveryProvider: this.defaultAnnouncementDiscoveryProvider || 'nostr',
            // 0.9.638 — which substrate the MOST RECENT successful
            // submission requested, for the honest status line below.
            // `null` until a first successful submit. Never a
            // success/failure claim — see this file's own header.
            lastCommentaryDistributionProvider: null
        };
    },
    computed: {
        licenseLabel() {
            return this.publication.license ? this.publication.license.id : 'UNSPECIFIED';
        },
        // 0.9.539 — the SAME `publishedAt` field, at finer precision,
        // never a new one. See needsPreciseDate's own comment above.
        // Milliseconds are included (not just toLocaleString()'s own
        // second-level precision) because two republishes of an
        // unmodified document routinely land within the same second —
        // this label's own job is to actually disambiguate the
        // collision it was raised for, not merely to look more precise.
        publishedAtLabel() {
            return formatPublicationDate(this.publication.publishedAt, this.needsPreciseDate);
        },
        // The currently signed-in identity's own did:key id, or `null` —
        // the SAME tolerant lookup application/WorldNavigationSession.js's
        // own getMyIdentityId() already wraps, called directly here
        // because this component has no session to ask.
        viewerIdentityId() {
            if (!this.identityUseCase) {
                return null;
            }
            return resolveSigningIdentityId(this.identityUseCase.provider);
        },
        // 0.9.638 — human-friendly label ONLY, never the value sent to
        // addPublicationCommentaryCommand (that stays the literal
        // application-layer string — see submitCommentary()'s own
        // comment above).
        lastCommentaryDistributionProviderLabel() {
            return this.lastCommentaryDistributionProvider === 'arweave' ? 'Arweave' : 'Nostr';
        }
    },
    methods: {
        // The only writer of `commentaryOpen`. A no-op whenever no
        // getPublicationCommentariesCommand was ever injected — mirrors
        // every other optional-capability gate in this codebase's UI
        // layer. The FIRST time a card is expanded, this also performs
        // the first read — see this file's own header, "collapsed by
        // default, loaded only on first expansion."
        toggleCommentary() {
            if (!this.getPublicationCommentariesCommand) {
                return;
            }
            const opening = !this.commentaryOpen;
            this.commentaryOpen = opening;
            if (opening) {
                this.refreshCommentaries();
            }
        },
        // The only writer of `commentaries`/`commentaryError` from a
        // read. A FAILED read leaves `commentaries` exactly as it was —
        // never wiped to `[]` — and only sets `commentaryError`,
        // mirroring OwnPublicationPanel's own refreshPublicationCommentaries().
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
        // The only call site of addPublicationCommentaryCommand in this
        // file. Sends ONLY `{ publicationId, content }` — see this file's
        // own header, "authorship is never UI-supplied." On success,
        // clears the compose draft and RE-QUERIES through
        // refreshCommentaries() rather than appending the returned
        // commentary itself — one source of truth, never a second,
        // UI-maintained interpretation of the store's own collection,
        // mirroring OwnPublicationPanel's own identical restraint. On
        // failure, `newCommentaryText` and `commentaries` are both left
        // UNCHANGED — a rejected attempt never discards what was typed
        // or corrupts what was already displayed.
        //
        // 0.9.542 — Publication Commentary Submission Experience Product
        // Reassessment, Section D. A thrown error here does not always
        // mean nothing was persisted: PublicationCommentaryNotificationProducer's
        // own header documents that a notificationSink failure propagates
        // AFTER the commentary itself was already saved
        // (`AddPublicationCommentaryUseCase.execute()` already returned).
        // A user who sees `commentaryError` and clicks Comment again with
        // the SAME, unedited text is retrying an attempt that may have
        // already succeeded — before this milestone, that retry sent a
        // brand-new random `commentaryId`, so PublicationCommentaryStore's
        // own "same id, identical record" idempotence never engaged, and
        // the retry created a second, visible, duplicate commentary.
        // `pendingCommentaryDraft` (data(), above) closes exactly that
        // gap: the SAME `commentaryId`/`createdAt` is reused across
        // consecutive submit attempts for byte-identical content, so a
        // retry of an already-persisted comment is now the store's own
        // documented no-op (`isNew: false`), never a duplicate. Editing
        // the draft before retrying mints a fresh id — an edited draft is
        // a genuinely new comment, never conflated with the old one.
        submitCommentary() {
            const content = this.newCommentaryText.trim();
            if (!this.addPublicationCommentaryCommand || !content || this.commentarySubmitting) {
                return;
            }
            if (!this.pendingCommentaryDraft || this.pendingCommentaryDraft.content !== content) {
                this.pendingCommentaryDraft = { content, commentaryId: createId(), createdAt: new Date() };
            }
            const { commentaryId, createdAt } = this.pendingCommentaryDraft;
            // 0.9.638 — forwarded verbatim, the same 'nostr'/'arweave'
            // literal EditorView.js's own selector already sends;
            // ui/main.js's own wrapper falls back to 'nostr' if this were
            // ever omitted, so no local default duplication is needed
            // beyond the data() default above.
            const discoveryProvider = this.selectedDiscoveryProvider;
            this.commentarySubmitting = true;
            try {
                this.addPublicationCommentaryCommand({ publicationId: this.publication.id, content, commentaryId, createdAt, discoveryProvider });
                this.newCommentaryText = '';
                this.commentaryError = null;
                this.pendingCommentaryDraft = null;
                this.lastCommentaryDistributionProvider = discoveryProvider;
                this.refreshCommentaries();
            } catch (error) {
                this.commentaryError = (error && error.message) ? error.message : 'Commentary could not be created.';
            } finally {
                this.commentarySubmitting = false;
            }
        }
    },
    template: `
        <li class="publication-card">
            <PublicationPreview :publication="publication" size="card" />
            <h3>{{ publication.title }}</h3>
            <p v-if="publication.parentDocumentId" class="publication-fork-of">
                ↳ Fork of {{ parentTitle || 'Unknown' }}
            </p>
            <p v-if="description" class="publication-description">{{ description }}</p>
            <p class="publication-meta">
                <span class="publication-badge">🔒 Published</span>
                by
                <template v-if="publication.author">
                    <a @click.prevent="$emit('view-author', publication.author)" class="publication-author-link">{{ publication.author }}</a>
                </template>
                <template v-else>anonymous</template>
            </p>
            <p class="publication-date" v-if="publication.publishedAt">
                {{ publishedAtLabel }} · {{ licenseLabel }}
            </p>
            <p class="publication-forks" v-if="forkCount > 0">
                {{ forkCount }} fork(s)
            </p>
            <div class="publication-actions">
                <button class="action-btn action-btn--open" @click="$emit('open', publication)">Open</button>
                <button class="action-btn action-btn--fork" @click="$emit('fork', publication)">Fork</button>
                <button class="action-btn action-btn--explore" @click="$emit('explore', publication)">Explore</button>
                <button
                    v-if="getPublicationCommentariesCommand"
                    class="action-btn action-btn--comment"
                    @click="toggleCommentary"
                >{{ commentaryOpen ? 'Hide Comments' : 'Comment' }}</button>
            </div>

            <!-- 0.9.289 — Other-Publication Commentary Entry Point.
                 Rendered only when a caller supplied
                 getPublicationCommentariesCommand, mirroring every other
                 optional capability section in this codebase's UI layer.
                 Shown for ANY publication (own or not — see this file's
                 own header, "never gated on ownership"). -->
            <div v-if="getPublicationCommentariesCommand && commentaryOpen" class="publication-card-commentary">
                <p v-if="commentaryError" class="publication-card-commentary-error">{{ commentaryError }}</p>

                <p v-if="!commentaries.length" class="publication-card-commentary-empty">No commentary yet.</p>
                <ul v-else class="publication-card-commentary-list">
                    <li
                        v-for="commentary in commentaries"
                        :key="commentary.commentaryId"
                        class="publication-card-commentary-entry"
                    >
                        <span class="publication-card-commentary-author">{{ commentary.authorIdentityId }}</span>
                        <p class="publication-card-commentary-content">{{ commentary.content }}</p>
                    </li>
                </ul>

                <p v-if="addPublicationCommentaryCommand && !viewerIdentityId" class="publication-card-commentary-signin-hint">
                    Sign in to add commentary.
                </p>
                <form
                    v-else-if="addPublicationCommentaryCommand"
                    class="publication-card-commentary-form"
                    @submit.prevent="submitCommentary"
                >
                    <textarea
                        v-model="newCommentaryText"
                        class="publication-card-commentary-input"
                        :disabled="commentarySubmitting"
                        placeholder="Add a comment…"
                    ></textarea>
                    <!-- 0.9.638 — Publication Commentary Distribution
                         Provider Selector. Same two-option vocabulary as
                         EditorView.js's own "Announcement / Discovery
                         substrate" control, one caller over. -->
                    <label class="publication-card-commentary-provider-label">
                        Distribution:
                        <select
                            v-model="selectedDiscoveryProvider"
                            class="form-select publication-card-commentary-provider-select"
                            :disabled="commentarySubmitting"
                        >
                            <option value="nostr">Nostr</option>
                            <option value="arweave">Arweave</option>
                        </select>
                    </label>
                    <button
                        type="submit"
                        class="action-btn publication-card-commentary-submit-action"
                        :disabled="!newCommentaryText.trim() || commentarySubmitting"
                    >{{ commentarySubmitting ? 'Posting…' : 'Post Comment' }}</button>
                </form>
                <!-- 0.9.638 — reports what was actually requested, never
                     a success/receipt claim — see this file's own header. -->
                <p v-if="addPublicationCommentaryCommand && lastCommentaryDistributionProvider" class="publication-card-commentary-distribution-status">
                    Comment saved locally. Distribution requested via {{ lastCommentaryDistributionProviderLabel }}.
                </p>
            </div>
        </li>
    `
};
