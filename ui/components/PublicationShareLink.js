import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import {
    canUseShareSheet, copyPublicationShareLink, describePublicationShare, prepareLinkOnlyShare, sharePublicationLink
} from '../../application/publication/PublicationShareLink.js';
import { displayText, t } from '../i18n/i18n.js';

const FEEDBACK = Object.freeze({
    shared: 'share.shared',
    copied: 'share.copied',
    cancelled: null,
    unavailable: 'share.copyByHand'
});

function feedbackText(outcome) {
    return FEEDBACK[outcome] ? t(FEEDBACK[outcome]) : '';
}

// Share, Copy link and Save picture for a Publication. Once it is distributed,
// the link names where its Signed Claim is stored, from its distribution
// record (publicationDistributionLifecycleStore, restored from this browser's
// storage when not yet in memory), which it follows, so the link changes as
// soon as a distribution stores the claim. Before that, given `publication`,
// a build small enough is shared inside the link itself.
export default {
    name: 'PublicationShareLink',
    props: {
        publicationId: { type: String, default: null },
        title: { type: String, default: null },
        // The Publication itself, for a link-only share and a picture; without
        // it only a distributed Publication's link is offered.
        publication: { type: Object, default: null }
    },
    setup(props) {
        const lifecycleStore = inject('publicationDistributionLifecycleStore', null);
        const lifecycleRestorer = inject('publicationDistributionLifecycleRestorer', null);
        const contentStore = inject('publicationContentStore', null);
        const funnel = inject('funnelEventCounter', null);
        const lifecycle = ref(null);
        const linkOnly = ref(null);
        const feedback = ref('');
        const pictureState = ref('idle');
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

        let preparing = 0;
        async function prepare(publication) {
            const attempt = ++preparing;
            linkOnly.value = null;
            pictureState.value = 'idle';
            if (!publication || !contentStore) return;
            const prepared = await prepareLinkOnlyShare({ publication, contentStore });
            if (attempt === preparing) linkOnly.value = prepared;
        }
        watch(() => props.publication, prepare, { immediate: true });

        // The share functions and the share sheet take text, so the messages
        // are translated once here.
        const share = computed(() => {
            const described = describePublicationShare({ lifecycle: lifecycle.value, title: props.title, linkOnly: linkOnly.value });
            if (!described) return null;
            return described.available
                ? { ...described, title: displayText(described.title), text: t(described.text), hint: t(described.hint), note: displayText(described.note) }
                : { ...described, reason: t(described.reason) };
        });
        const shareSheet = computed(() => canUseShareSheet(share.value));
        const canSavePicture = computed(() => Boolean(linkOnly.value?.snapshotText));

        function report(outcome) {
            feedback.value = feedbackText(outcome);
            if (outcome === 'shared' || outcome === 'copied') funnel?.sharedLink();
        }
        async function shareNow() {
            report(await sharePublicationLink(share.value));
        }
        async function copy() {
            report(await copyPublicationShareLink(share.value));
        }

        async function savePicture() {
            const snapshotText = linkOnly.value?.snapshotText;
            if (!snapshotText || pictureState.value === 'drawing') return;
            pictureState.value = 'drawing';
            try {
                // Imported here, so Three.js loads only when a picture is asked for.
                const [{ renderBuildPicture }, { DocumentSerializer }, { CreateBrickRegistryUseCase }] = await Promise.all([
                    import('../../renderer/BuildPicture.js'),
                    import('../../serializer/DocumentSerializer.js'),
                    import('../../application/editor/CreateBrickRegistryUseCase.js')
                ]);
                const build = new DocumentSerializer().deserialize(JSON.parse(snapshotText));
                const title = share.value?.available ? share.value.title : (props.title || t('share.untitled'));
                const blob = await renderBuildPicture(build, {
                    registry: new CreateBrickRegistryUseCase().execute(),
                    title,
                    caption: t('share.pictureCaption')
                });
                downloadBlob(blob, pictureFileName(title));
                pictureState.value = 'saved';
            } catch {
                pictureState.value = 'failed';
            }
        }

        return { t, share, shareSheet, feedback, shareNow, copy, canSavePicture, pictureState, savePicture };
    },
    template: `
        <div v-if="share || canSavePicture" class="publication-share-link">
            <template v-if="share && share.available">
                <div class="publication-share-link-actions">
                    <button v-if="shareSheet" type="button" class="action-btn action-btn--primary" @click="shareNow">{{ t('share.share') }}</button>
                    <button type="button" :class="['action-btn', shareSheet ? 'action-btn--secondary' : 'action-btn--primary']" @click="copy">{{ t('share.copy') }}</button>
                    <button v-if="canSavePicture" type="button" class="action-btn action-btn--secondary publication-share-link-picture" :disabled="pictureState === 'drawing'" @click="savePicture">{{ t('share.savePicture') }}</button>
                    <span class="publication-share-link-feedback" role="status">{{ feedback }}</span>
                </div>
                <input class="publication-share-link-url" readonly :value="share.url" :aria-label="t('share.linkLabel')" @focus="$event.target.select()">
                <p class="form-hint form-hint--neutral">
                    {{ share.hint }}
                    <template v-if="share.note">{{ ' ' + share.note }}</template>
                </p>
            </template>
            <template v-else>
                <div v-if="canSavePicture" class="publication-share-link-actions">
                    <button type="button" class="action-btn action-btn--secondary publication-share-link-picture" :disabled="pictureState === 'drawing'" @click="savePicture">{{ t('share.savePicture') }}</button>
                </div>
                <p v-if="share" class="form-hint form-hint--neutral">{{ share.reason }}</p>
            </template>
            <p v-if="pictureState === 'drawing'" class="form-hint form-hint--neutral" role="status">{{ t('share.pictureDrawing') }}</p>
            <p v-else-if="pictureState === 'failed'" class="form-hint" role="alert">{{ t('share.pictureFailed') }}</p>
        </div>
    `
};

function pictureFileName(title) {
    const slug = String(title || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return `forkbuild-${slug || 'build'}.png`;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    // The download has started by the time this runs; revoking sooner can cancel it in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}
