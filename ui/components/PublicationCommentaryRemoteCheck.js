// "Check for new comments" — fetches remote Commentary for one Publication.
//
// Mounted inside every Commentary section (Repository cards and list rows,
// World View's My Publication panel, and both World Encounter Commentary
// panels). Each of those sections is only rendered while it is open, so
// checking on mount IS "fetch on open"; the button re-checks on request.
//
// This component fetches, and nothing else: it calls the app-wide
// `refreshPublicationCommentaryCommand` (ui/main.js — see
// application/publication/commentary/RefreshPublicationCommentaryCommandComposition.js), which
// imports whatever Nostr/Arweave hold into the SAME local store the host
// section already reads. It then emits `refreshed` so the host re-reads
// its own list the way it already does after posting — it never renders
// Commentary itself and never holds a second copy of it.
//
// Renders nothing when no command was provided (a mount outside the
// running app), so every host section degrades to exactly its previous,
// local-only behaviour.
//
// The status line is deliberately modest: "no new comments found" means
// none were found on the networks that answered, never that none exist.
// A network that could not be reached is named, and the comments stored
// on this device stay on screen either way.
// "Nostr", "Nostr and Arweave", "Nostr, Arweave and Steem".
function joinNames(names, conjunction) {
    return names.length <= 2 ? names.join(` ${conjunction} `) : `${names.slice(0, -1).join(', ')} ${conjunction} ${names[names.length - 1]}`;
}

export default {
    name: 'PublicationCommentaryRemoteCheck',
    inject: {
        refreshPublicationCommentaryCommand: { default: null }
    },
    props: {
        publicationId: { type: String, default: null }
    },
    emits: ['refreshed'],
    data() {
        return {
            checking: false,
            outcome: null,
            requestId: 0
        };
    },
    computed: {
        statusText() {
            if (this.checking) {
                return 'Checking the network for new comments…';
            }
            const outcome = this.outcome;
            if (!outcome) {
                return '';
            }
            const reached = outcome.checked.filter((name) => !outcome.failed.includes(name));
            if (reached.length === 0 && outcome.failed.length > 0) {
                return `Couldn't reach ${joinNames(outcome.failed, 'or')} — showing comments stored on this device.`;
            }
            const found = outcome.newCount === 0
                ? 'No new comments found'
                : `Found ${outcome.newCount} new ${outcome.newCount === 1 ? 'comment' : 'comments'}`;
            const unreachable = outcome.failed.length > 0 ? ` · ${joinNames(outcome.failed, 'and')} unavailable` : '';
            return `${found}${unreachable}.`;
        }
    },
    watch: {
        publicationId() {
            this.outcome = null;
            this.check();
        }
    },
    mounted() {
        this.check();
    },
    beforeUnmount() {
        // Invalidates any check still in flight, so a late answer never
        // writes to (or emits from) an unmounted component.
        this.requestId += 1;
    },
    methods: {
        check() {
            if (!this.refreshPublicationCommentaryCommand || !this.publicationId) {
                return;
            }
            this.requestId += 1;
            const requestId = this.requestId;
            const publicationId = this.publicationId;
            this.checking = true;
            Promise.resolve()
                .then(() => this.refreshPublicationCommentaryCommand(publicationId))
                .catch(() => ({ newCount: 0, checked: ['the network'], failed: ['the network'] }))
                .then((outcome) => {
                    if (requestId !== this.requestId) {
                        return;
                    }
                    this.checking = false;
                    this.outcome = outcome;
                    if (outcome && outcome.newCount > 0) {
                        this.$emit('refreshed', { publicationId, newCount: outcome.newCount });
                    }
                });
        }
    },
    template: `
        <div v-if="refreshPublicationCommentaryCommand && publicationId" class="commentary-remote-check">
            <button
                type="button"
                class="action-btn commentary-remote-check-action"
                :disabled="checking"
                @click="check"
            >{{ checking ? 'Checking…' : 'Check for new comments' }}</button>
            <span v-if="statusText" class="commentary-remote-check-status" role="status">{{ statusText }}</span>
        </div>
    `
};
