import { computed, inject, onBeforeUnmount, ref } from 'vue';
import { WalkTogetherStatus } from '../../../application/walkTogether/WalkTogether.js';
import { readPublishedBuildText } from '../../../application/publication/PublicationShareLink.js';
import { walkTogetherLink } from '../../../core/WalkTogetherCode.js';

// World View's "Walk here with me" (application/walkTogether/WalkTogether.js):
// the link that brings friends into the World on screen. The link lives as
// long as World View stays open (or until it expires, or Stop): closing its
// dialog keeps it working, and leaving World View ends it. Friends who
// already joined stay connected either way.
//
// `ownPublication` is World View's ref to the active World's Publication:
// the World a link carries, read when the link is made. A World without one
// (not published yet) can't be walked together.
export function useWalkTogether({ ownPublication }) {
    const walkTogether = inject('walkTogether', null);
    const identityUseCase = inject('identityUseCase', null);
    const contentStore = inject('publicationContentStore', null);
    const funnel = inject('funnelEventCounter', null);
    const appUrl = inject('appUrl', () => window.location.href);

    const showWalkDialog = ref(false);
    const signInToWalk = ref(false);
    const walkState = ref(null);
    let host = null;
    let unsubscribe = null;

    const walkAvailable = Boolean(walkTogether && walkTogether.available);
    const walkLink = computed(() => (walkState.value && walkState.value.code ? walkTogetherLink(walkState.value.code, appUrl()) : ''));
    // Live: the link is offered once the active World has a Publication; a
    // link already made keeps showing.
    const walkNeedsPublish = computed(() => !walkState.value && !ownPublication.value);

    function stopWalk() {
        if (unsubscribe) unsubscribe();
        unsubscribe = null;
        if (host) host.close();
        host = null;
        walkState.value = null;
    }

    async function startWalk() {
        if (!walkAvailable || !ownPublication.value) return;
        if (!walkTogether.canWalk()) {
            signInToWalk.value = true;
            return;
        }
        stopWalk();
        const publication = ownPublication.value;
        const user = identityUseCase ? identityUseCase.currentUser() : null;
        const next = walkTogether.createHost({
            world: { claim: publication, snapshotText: await readPublishedBuildText({ publication, contentStore }) },
            hostName: user ? user.displayName : null
        });
        if (host) next.close();
        host = next;
        walkState.value = next.state;
        unsubscribe = next.onChange((state) => { walkState.value = state; });
        await next.start();
        if (host === next && next.state.status === WalkTogetherStatus.WAITING && funnel) funnel.madeWalkLink();
    }

    // Opening the dialog is the request: a link is made straight away,
    // unless one is already working.
    function openWalkDialog() {
        showWalkDialog.value = true;
        if (!walkState.value || walkState.value.status !== WalkTogetherStatus.WAITING) startWalk();
    }

    function closeWalkDialog() {
        showWalkDialog.value = false;
    }

    function walkSignedIn() {
        signInToWalk.value = false;
        startWalk();
    }

    onBeforeUnmount(stopWalk);

    return {
        walkAvailable, walkState, walkLink, walkNeedsPublish, showWalkDialog, signInToWalk,
        openWalkDialog, closeWalkDialog, startWalk, stopWalk, walkSignedIn
    };
}
