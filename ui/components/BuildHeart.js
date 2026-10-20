import IdentityName from './IdentityName.js';
import SigningRemedyButton from './SigningRemedyButton.js';
import I18nText from '../i18n/I18nText.js';
import { errorText, t } from '../i18n/i18n.js';

// A build's hearts: one tap gives this identity's heart or takes it back
// (setPublicationHeartCommand, ui/main.js, which sends it to the network
// chosen in Settings), with the count and who: "Loved by alice and 11
// others", "you" first when you're one of them, each name a link to their
// page and the whole list one click away. `compact` shows the button and
// count alone (Explore's list rows).
//
// What it shows is this device's own count (each person's latest record, as
// far as it has found), never a score: it never sorts or ranks anything. A
// build nobody has hearted shows an empty heart and no count, never "0".
// `refresh` also asks the networks for the build's hearts when it appears
// (one build in World View, not every card in Explore).
//
// The first heart given on this device explains, once, that a heart is
// public and signed with your name before it is sent.
const EXPLAINED_KEY = 'forkbuild.heart-explained';

function explainedAlready() {
    try {
        return globalThis.localStorage?.getItem(EXPLAINED_KEY) === '1';
    } catch {
        return false;
    }
}

function rememberExplained() {
    try {
        globalThis.localStorage?.setItem(EXPLAINED_KEY, '1');
    } catch {
    }
}

export default {
    name: 'BuildHeart',
    components: { IdentityName, I18nText, SigningRemedyButton },
    inject: {
        getPublicationHeartsCommand: { default: null },
        setPublicationHeartCommand: { default: null },
        publicationHeartsChanges: { default: null },
        refreshPublicationCommentaryCommand: { default: null }
    },
    props: {
        publicationId: { type: String, required: true },
        compact: { type: Boolean, default: false },
        refresh: { type: Boolean, default: false }
    },
    data() {
        return { hearts: [], mine: false, ownIdentityId: null, listOpen: false, explaining: false, error: null, errorRemedy: null };
    },
    computed: {
        count() {
            return this.hearts.length;
        },
        // You first, then the most recent.
        people() {
            const own = this.hearts.filter((heart) => heart.authorIdentityId === this.ownIdentityId);
            return [...own, ...this.hearts.filter((heart) => !own.includes(heart))];
        },
        lineKey() {
            if (this.count === 1) return 'heart.lovedByOne';
            if (this.count === 2) return 'heart.lovedByTwo';
            return 'heart.lovedByMany';
        },
        label() {
            return this.mine ? t('heart.takeBack') : t('heart.give');
        }
    },
    watch: {
        publicationId() {
            this.listOpen = false;
            this.read();
            this.refreshRemote();
        }
    },
    created() {
        this.read();
    },
    mounted() {
        if (this.publicationHeartsChanges) {
            this.unsubscribe = this.publicationHeartsChanges.subscribe((publicationId) => {
                if (!publicationId || publicationId === this.publicationId) this.read();
            });
        }
        this.refreshRemote();
    },
    beforeUnmount() {
        if (this.unsubscribe) this.unsubscribe();
    },
    methods: {
        t,
        read() {
            if (!this.getPublicationHeartsCommand) return;
            try {
                const state = this.getPublicationHeartsCommand(this.publicationId);
                this.hearts = Array.isArray(state.hearts) ? state.hearts : [];
                this.mine = state.mine === true;
                this.ownIdentityId = state.ownIdentityId || null;
            } catch {
                this.hearts = [];
                this.mine = false;
            }
        },
        refreshRemote() {
            if (!this.refresh || !this.refreshPublicationCommentaryCommand) return;
            Promise.resolve(this.refreshPublicationCommentaryCommand(this.publicationId)).then(() => this.read()).catch(() => {});
        },
        toggle() {
            this.error = null;
            this.errorRemedy = null;
            if (!this.mine && !explainedAlready()) {
                this.explaining = true;
                return;
            }
            this.set(!this.mine);
        },
        confirmFirst() {
            rememberExplained();
            this.explaining = false;
            this.set(true);
        },
        set(hearted) {
            if (!this.setPublicationHeartCommand) return;
            try {
                this.setPublicationHeartCommand({ publicationId: this.publicationId, hearted });
            } catch (error) {
                this.error = errorText(error, t('heart.failed'));
                this.errorRemedy = error && error.remedy ? error.remedy : null;
            }
            this.read();
        }
    },
    template: `
        <div v-if="getPublicationHeartsCommand" :class="['build-heart', { 'build-heart--compact': compact }]">
            <div class="build-heart-row">
                <button
                    v-if="setPublicationHeartCommand"
                    type="button"
                    :class="['build-heart-toggle', { 'build-heart-toggle--on': mine }]"
                    :aria-pressed="mine ? 'true' : 'false'"
                    :aria-label="label"
                    :title="label"
                    @click="toggle"
                ><span class="build-heart-icon" aria-hidden="true">{{ mine ? '♥' : '♡' }}</span><span v-if="count" class="build-heart-count">{{ count }}</span></button>
                <button
                    v-if="!compact && count"
                    type="button"
                    class="build-heart-who"
                    :aria-expanded="listOpen ? 'true' : 'false'"
                    @click="listOpen = !listOpen"
                >
                    <I18nText :keypath="lineKey" :params="{ count: count - 1 }">
                        <template #a><template v-if="people[0].authorIdentityId === ownIdentityId">{{ t('heart.you') }}</template><IdentityName v-else :identity-id="people[0].authorIdentityId" :chosen-name="people[0].authorName" /></template>
                        <template v-if="count === 2" #b><IdentityName :identity-id="people[1].authorIdentityId" :chosen-name="people[1].authorName" /></template>
                    </I18nText>
                </button>
            </div>
            <ul v-if="listOpen && count" class="build-heart-list">
                <li v-for="heart in people" :key="heart.authorIdentityId">
                    <template v-if="heart.authorIdentityId === ownIdentityId">{{ t('heart.you') }}</template>
                    <IdentityName v-else :identity-id="heart.authorIdentityId" :chosen-name="heart.authorName" />
                </li>
            </ul>
            <div v-if="explaining" class="build-heart-explain" role="group" :aria-label="t('heart.give')">
                <p>{{ t('heart.explain') }}</p>
                <button type="button" class="action-btn action-btn--primary build-heart-explain-go" @click="confirmFirst">♥ {{ t('heart.giveIt') }}</button>
                <button type="button" class="action-btn build-heart-explain-cancel" @click="explaining = false">{{ t('heart.cancel') }}</button>
            </div>
            <p v-if="error" class="build-heart-error" role="status">{{ error }} <SigningRemedyButton :remedy="errorRemedy" /></p>
        </div>
    `
};
