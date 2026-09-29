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
import { currentLocale, t } from '../i18n/i18n.js';

// "Nostr", "Nostr and Arweave", "Nostr, Arweave and Steem", the chosen
// language's way.
function joinNames(names, conjunction) {
    const locale = currentLocale();
    return new Intl.ListFormat(locale.intlLocale || locale.code, { type: conjunction === 'or' ? 'disjunction' : 'conjunction' }).format(names);
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
                return t('commentaryCheck.checking');
            }
            const outcome = this.outcome;
            if (!outcome) {
                return '';
            }
            const reached = outcome.checked.filter((name) => !outcome.failed.includes(name));
            if (reached.length === 0 && outcome.failed.length > 0) {
                return t('commentaryCheck.unreachable', { networks: joinNames(outcome.failed, 'or') });
            }
            const found = outcome.newCount === 0
                ? t('commentaryCheck.noneNew')
                : t('commentaryCheck.found', { count: outcome.newCount });
            return outcome.failed.length > 0
                ? t('commentaryCheck.foundSomeUnavailable', { found, networks: joinNames(outcome.failed, 'and') })
                : t('commentaryCheck.foundAll', { found });
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
        t,
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
                .catch(() => {
                    const network = t('commentaryCheck.theNetwork');
                    return { newCount: 0, checked: [network], failed: [network] };
                })
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
            >{{ checking ? t('publicationCommentaryRemoteCheck.checking') : t('publicationCommentaryRemoteCheck.checkForNewComments') }}</button>
            <span v-if="statusText" class="commentary-remote-check-status" role="status">{{ statusText }}</span>
        </div>
    `
};
