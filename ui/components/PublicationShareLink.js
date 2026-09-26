import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import {
    canUseShareSheet, copyPublicationShareLink, describePublicationShare, sharePublicationLink
} from '../../application/publication/PublicationShareLink.js';

const FEEDBACK = Object.freeze({
    shared: 'Shared.',
    copied: 'Link copied.',
    cancelled: '',
    unavailable: 'Copy the link below by hand.'
});

// Share and Copy link for a distributed Publication, from its distribution
// record (publicationDistributionLifecycleStore, restored from this browser's
// storage when not yet in memory), which it follows, so it appears as soon
// as a distribution stores the Signed Claim. Shows nothing before the
// Publication is distributed.
export default {
    name: 'PublicationShareLink',
    props: {
        publicationId: { type: String, default: null },
        title: { type: String, default: null }
    },
    setup(props) {
        const lifecycleStore = inject('publicationDistributionLifecycleStore', null);
        const lifecycleRestorer = inject('publicationDistributionLifecycleRestorer', null);
        const lifecycle = ref(null);
        const feedback = ref('');
        let unsubscribe = null;

        function follow(publicationId) {
            unsubscribe?.();
            unsubscribe = null;
            feedback.value = '';
            if (!lifecycleStore || !publicationId) {
                lifecycle.value = null;
                return;
            }
            // Only catalogued Publications' records are restored at startup, so
            // a build published from the Editor is restored here.
            lifecycle.value = lifecycleStore.get(publicationId) ?? lifecycleRestorer?.restore(publicationId) ?? null;
            if (typeof lifecycleStore.subscribe === 'function') {
                unsubscribe = lifecycleStore.subscribe(publicationId, (_id, next) => { lifecycle.value = next; });
            }
        }
        watch(() => props.publicationId, follow, { immediate: true });
        onBeforeUnmount(() => unsubscribe?.());

        const share = computed(() => describePublicationShare({ lifecycle: lifecycle.value, title: props.title }));
        const shareSheet = computed(() => canUseShareSheet(share.value));

        async function shareNow() {
            feedback.value = FEEDBACK[await sharePublicationLink(share.value)];
        }
        async function copy() {
            feedback.value = FEEDBACK[await copyPublicationShareLink(share.value)];
        }

        return { share, shareSheet, feedback, shareNow, copy };
    },
    template: `
        <div v-if="share" class="publication-share-link">
            <template v-if="share.available">
                <div class="publication-share-link-actions">
                    <button v-if="shareSheet" type="button" class="action-btn action-btn--primary" @click="shareNow">Share…</button>
                    <button type="button" :class="['action-btn', shareSheet ? 'action-btn--secondary' : 'action-btn--primary']" @click="copy">Copy link</button>
                    <span class="publication-share-link-feedback" role="status">{{ feedback }}</span>
                </div>
                <input class="publication-share-link-url" readonly :value="share.url" aria-label="Link to share" @focus="$event.target.select()">
                <p class="form-hint form-hint--neutral">
                    Anyone can open this link on any device to see the build in 3D, once its Snapshot has been distributed too.
                    <template v-if="share.note"> {{ share.note }}</template>
                </p>
            </template>
            <p v-else class="form-hint form-hint--neutral">{{ share.reason }}</p>
        </div>
    `
};
